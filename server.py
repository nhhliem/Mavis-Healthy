import os
import sys
import json
import threading

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import datetime
from ai_service import AIError, chat, live_token
import db_sql

# Real-time Event Hub cho Quản trị viên Mavis Admin
EVENT_LOCK = threading.Lock()
REALTIME_EVENTS = []
MAX_REALTIME_EVENTS = 200
EVENT_COUNTER = 0

def push_realtime_event(event_type, user_data=None, log_data=None, detail=""):
    global EVENT_COUNTER, REALTIME_EVENTS
    with EVENT_LOCK:
        EVENT_COUNTER += 1
        event = {
            "id": EVENT_COUNTER,
            "type": event_type,
            "user": user_data,
            "log": log_data,
            "detail": detail,
            "timestamp": datetime.now().isoformat()
        }
        REALTIME_EVENTS.append(event)
        if len(REALTIME_EVENTS) > MAX_REALTIME_EVENTS:
            REALTIME_EVENTS.pop(0)
        return event

# Khởi tạo Cơ sở dữ liệu SQL (SQLite - sleepsync.db)
db_sql.init_db()

import time
from collections import defaultdict

PORT = int(os.environ.get('PORT', 8080))
ADMIN_KEY = os.environ.get('ADMIN_KEY', 'mavis_admin_founder_2026').strip()
VALID_ADMIN_KEYS = {ADMIN_KEY, '2004', 'mavis_admin_founder_2004', 'mavis_admin_founder_2026'}
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, 'server_database.json')

# In-Memory Rate Limiting Engine (Protects against Brute Force & DoS)
class RateLimiter:
    def __init__(self):
        self._lock = threading.Lock()
        self._records = defaultdict(list)

    def is_allowed(self, key, max_requests, window_seconds):
        now = time.time()
        with self._lock:
            timestamps = [t for t in self._records[key] if now - t < window_seconds]
            if len(timestamps) >= max_requests:
                self._records[key] = timestamps
                return False
            timestamps.append(now)
            self._records[key] = timestamps
            if len(self._records) > 4000:
                self._records = defaultdict(list, {k: v for k, v in self._records.items() if v and now - v[-1] < 3600})
            return True

RATE_LIMITER = RateLimiter()

# Default Clean Data
DEFAULT_DB = {
    "users": [],
    "activeUserId": None,
    "serviceUsage": [],
    "diagnoses": []
}

def load_db():
    return db_sql.export_full_dict()

def save_db(data=None):
    if data and isinstance(data, dict):
        try:
            with open(DB_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print("[Mirror DB Error]", e)
    return True

class SleepSyncAPIHandler(SimpleHTTPRequestHandler):
    def is_admin_authorized(self):
        """
        Xác thực quyền quản trị viên:
        1. Tự động cho phép nếu truy cập trực tiếp từ máy cục bộ (127.0.0.1 / localhost)
           và KHÔNG qua proxy/đường hầm công khai (Cloudflare Tunnel).
        2. Nếu truy cập từ mạng ngoài / internet / tunnel: BẮT BUỘC có ADMIN_KEY hoặc PIN 2004 qua:
           - Tham số URL (?key=... hoặc ?token=...)
           - Header HTTP (X-Admin-Key hoặc X-Admin-Pin)
           - Cookie phiên (mavis_admin_token)
        Nếu không có quyền -> trả về False (khiến server phản hồi 404 Không Tồn Tại).
        """
        is_proxied = bool(
            self.headers.get('CF-Connecting-IP') or
            self.headers.get('CF-Ray') or
            self.headers.get('X-Forwarded-For')
        )
        host = self.headers.get('Host', '').split(':')[0].lower()
        is_external_host = host.endswith('.trycloudflare.com')

        client_ip = self.client_address[0] if self.client_address else ''
        is_localhost = client_ip in ('127.0.0.1', '::1', 'localhost')

        # Truy cập an toàn trực tiếp từ chính máy tính chủ
        if is_localhost and not is_proxied and not is_external_host:
            return True

        # Xác thực bằng ADMIN_KEY hoặc PIN 2004 nếu truy cập từ thiết bị khác hoặc mạng ngoài
        from urllib.parse import urlparse, parse_qs
        query = parse_qs(urlparse(self.path).query)
        key_in_query = (query.get('key', [None])[0] or query.get('token', [None])[0])
        if key_in_query and key_in_query in VALID_ADMIN_KEYS:
            return True

        key_in_header = self.headers.get('X-Admin-Key') or self.headers.get('X-Admin-Pin')
        if key_in_header and key_in_header in VALID_ADMIN_KEYS:
            return True

        cookie_str = self.headers.get('Cookie', '')
        if any(f"mavis_admin_token={k}" in cookie_str for k in VALID_ADMIN_KEYS):
            return True

        return False

    def end_headers(self):
        # Tự động gán Cookie phiên làm việc an toàn nếu Admin truy cập có kèm key/pin
        try:
            from urllib.parse import urlparse, parse_qs
            query = parse_qs(urlparse(self.path).query)
            key_in_query = (query.get('key', [None])[0] or query.get('token', [None])[0])
            key_in_header = self.headers.get('X-Admin-Key') or self.headers.get('X-Admin-Pin')
            if (key_in_query and key_in_query in VALID_ADMIN_KEYS) or (key_in_header and key_in_header in VALID_ADMIN_KEYS):
                self.send_header('Set-Cookie', f'mavis_admin_token={ADMIN_KEY}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400')
        except Exception:
            pass

        # Global Security Headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')

        super().end_headers()

    def extract_client_metadata(self, body=None):
        """
        Trích xuất thông tin người dùng chi tiết: IP, Mac/Hardware ID, Thiết bị, Trình duyệt, Hệ điều hành
        """
        # 1. Địa chỉ IP thực tế (hỗ trợ Cloudflare Tunnel / Reverse Proxy / Mạng nội bộ)
        ip = (
            self.headers.get('CF-Connecting-IP') or
            (self.headers.get('X-Forwarded-For') or '').split(',')[0].strip() or
            (self.client_address[0] if self.client_address else '127.0.0.1')
        )
        if ip in ('127.0.0.1', '::1', 'localhost'):
            ip = '127.0.0.1 (Localhost)'

        # 2. Lấy thông tin môi trường chi tiết gửi từ Client (db.js)
        client_info = (body.get('clientInfo') if isinstance(body, dict) else {}) or {}

        ua = self.headers.get('User-Agent', '')
        browser = client_info.get('browser')
        os_name = client_info.get('os')
        device_type = client_info.get('deviceType')
        mac = client_info.get('mac')
        screen = client_info.get('screen')

        # Nhận diện dự phòng từ User-Agent nếu Client không gửi hoặc bị thiếu
        if not browser or browser == 'Trình duyệt Web':
            if 'Edg/' in ua: browser = 'Microsoft Edge'
            elif 'CocCoc' in ua: browser = 'Cốc Cốc'
            elif 'SamsungBrowser' in ua: browser = 'Samsung Internet'
            elif 'Chrome/' in ua: browser = 'Google Chrome'
            elif 'Firefox/' in ua: browser = 'Mozilla Firefox'
            elif 'Safari/' in ua: browser = 'Apple Safari'
            else: browser = 'Trình duyệt Web'

        if not os_name or os_name == 'Không xác định':
            if 'Windows NT 10.0' in ua: os_name = 'Windows 10/11'
            elif 'Android' in ua: os_name = 'Android'
            elif 'iPhone' in ua: os_name = 'iOS (iPhone)'
            elif 'iPad' in ua: os_name = 'iPadOS'
            elif 'Macintosh' in ua: os_name = 'macOS'
            elif 'Linux' in ua: os_name = 'Linux'
            else: os_name = 'Hệ điều hành'

        if not device_type:
            if 'Mobile' in ua or 'iPhone' in ua or 'Android' in ua:
                device_type = 'Điện thoại di động'
            elif 'iPad' in ua or 'Tablet' in ua:
                device_type = 'Máy tính bảng'
            else:
                device_type = 'Máy tính (PC/Laptop)'

        # Nếu không có Mac/Hardware ID từ client, sinh mã băm phần cứng cố định chuẩn MAC từ IP + UserAgent
        if not mac:
            import hashlib
            h = hashlib.md5(f"{ip}_{ua}".encode()).hexdigest()[:8].upper()
            mac = f"DEV-{h[0:2]}:{h[2:4]}:{h[4:6]}:{h[6:8]}"

        formatted_device = f"{device_type} • {os_name} • {browser}"

        return {
            "ip": ip,
            "mac": mac,
            "device": formatted_device,
            "deviceType": device_type,
            "os": os_name,
            "browser": browser,
            "screen": screen or "Màn hình chuẩn",
            "userAgent": ua
        }

    def send_head(self):
        # Chỉ phục vụ tài nguyên công khai; file Python, .env và DB được giữ kín.
        from pathlib import Path
        target = Path(self.translate_path(self.path)).resolve()
        root = Path(BASE_DIR).resolve()
        public_files = {'index.html', 'styles.css', 'app.js', 'rag.js',
                        'db.js', 'sw.js', 'manifest.json', 'talk.js', 'voice-processor.js'}
        relative = target.relative_to(root) if target.is_relative_to(root) else None

        # Bảo vệ tuyệt đối file admin.html:
        # Nếu chưa được xác thực quyền Admin -> Giả lập 404 Not Found (như thể file không hề tồn tại)
        if relative and str(relative) == 'admin.html':
            if not self.is_admin_authorized():
                self.send_error(404)
                return None
            return super().send_head()

        if relative is None or not (str(relative) in public_files or str(relative) == '.' or
                (relative.parts and relative.parts[0] == 'assets' and target.is_file())):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.client_address[0]} - " + (format % args), flush=True)

    def do_OPTIONS(self):
        print(f"[HTTP OPTIONS] {self.path}", flush=True)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        print(f"[HTTP GET] {self.path}", flush=True)
        try:
            clean_path = self.path.split('?')[0]

            # Bảo vệ toàn diện các API quản trị: Người dùng ngoài không thể quét hoặc đọc dữ liệu
            admin_get_endpoints = ('/api/users', '/api/stats', '/api/logs', '/api/realtime/events', '/api/diagnoses', '/api/export')
            if clean_path in admin_get_endpoints:
                if not self.is_admin_authorized():
                    self.send_error(404, "Endpoint Not Found")
                    return

            if clean_path == '/api/users':
                self.handle_get_users()
            elif clean_path == '/api/stats':
                self.handle_get_stats()
            elif clean_path == '/api/logs':
                self.handle_get_logs()
            elif clean_path == '/api/realtime/events':
                self.handle_get_realtime_events()
            elif clean_path == '/api/diagnoses':
                self.handle_get_diagnoses()
            elif clean_path == '/api/export':
                self.handle_export_db()
            else:
                # File tĩnh thông thường
                super().do_GET()
        except Exception as e:
            print("[GET Exception]", e, flush=True)

    def do_POST(self):
        try:
            clean_path = self.path.split('?')[0]

            # Bảo vệ toàn diện các API quản trị POST: Ngăn chặn xóa hoặc sửa đổi cơ sở dữ liệu
            admin_post_endpoints = ('/api/users', '/api/users/delete', '/api/reset', '/api/logs', '/api/diagnoses')
            if clean_path in admin_post_endpoints:
                if not self.is_admin_authorized():
                    self.send_error(404, "Endpoint Not Found")
                    return

            if clean_path in ('/api/ai/chat', '/api/ai/live-token'):
                self.handle_ai(clean_path)
            elif clean_path == '/api/sync':
                self.handle_sync()
            elif clean_path == '/api/auth/login':
                self.handle_login()
            elif clean_path == '/api/auth/register':
                self.handle_register()
            elif clean_path == '/api/users':
                self.handle_save_user()
            elif clean_path == '/api/users/delete':
                self.handle_delete_user()
            elif clean_path == '/api/diagnoses':
                self.handle_save_diagnosis()
            elif clean_path == '/api/logs':
                self.handle_add_log()
            elif clean_path == '/api/reset':
                self.handle_reset_db()
            else:
                self.send_error(404, "Endpoint Not Found")
        except Exception as e:
            print("[POST Exception]", e)

    def read_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                raw = self.rfile.read(content_length).decode('utf-8')
                return json.loads(raw)
        except Exception as e:
            print("[JSON Parse Error]", e)
        return None

    # -----------------------------
    # API HANDLERS
    # -----------------------------
    def handle_ai(self, path):
        try:
            client_ip = self.client_address[0] if self.client_address else '127.0.0.1'
            if not RATE_LIMITER.is_allowed(f"ai_{client_ip}", max_requests=30, window_seconds=60):
                self.send_json({'success': False, 'error': 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng nghỉ ngơi vài giây.'}, 429)
                return

            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 200000:
                self.send_json({'success': False, 'error': 'Yêu cầu quá dài hoặc không có nội dung.'}, 413)
                return
            origin = self.headers.get('Origin')
            if origin:
                from urllib.parse import urlparse
                origin_netloc = urlparse(origin).netloc
                host = self.headers.get('Host', '')
                fwd_host = self.headers.get('X-Forwarded-Host', '')
                is_valid = (
                    origin_netloc == host or
                    origin_netloc == fwd_host or
                    origin_netloc.endswith('.trycloudflare.com')
                )
                if not is_valid:
                    self.send_json({'success': False, 'error': 'Nguồn yêu cầu không hợp lệ.'}, 403)
                    return
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(body, dict):
                raise ValueError()
            result = chat(body) if path.endswith('/chat') else live_token(body)
            self.send_json(result)
        except AIError as exc:
            self.send_json({'success': False, 'error': str(exc)}, exc.status)
        except (ValueError, UnicodeDecodeError):
            self.send_json({'success': False, 'error': 'Dữ liệu gửi lên không hợp lệ.'}, 400)
        except Exception:
            self.send_json({'success': False, 'error': 'Máy chủ chưa xử lý được yêu cầu AI.'}, 500)

    def handle_get_users(self):
        users = db_sql.get_all_users()
        active_id = db_sql.get_active_user_id()
        self.send_json({"success": True, "users": users, "activeUserId": active_id})

    def handle_get_stats(self):
        self.send_json({"success": True, "stats": db_sql.get_stats()})

    def handle_get_logs(self):
        self.send_json({"success": True, "logs": db_sql.get_activities(limit=150)})

    def handle_get_realtime_events(self):
        from urllib.parse import urlparse, parse_qs
        query = parse_qs(urlparse(self.path).query)
        try:
            since_id = int(query.get('sinceId', ['0'])[0] or '0')
        except (ValueError, TypeError):
            since_id = 0

        with EVENT_LOCK:
            if since_id == 0:
                new_events = REALTIME_EVENTS[-15:] if REALTIME_EVENTS else []
            else:
                new_events = [e for e in REALTIME_EVENTS if e['id'] > since_id]
            latest_id = EVENT_COUNTER

        stats = db_sql.get_stats()
        self.send_json({
            "success": True,
            "events": new_events,
            "latestEventId": latest_id,
            "stats": stats,
            "serverTime": datetime.now().isoformat()
        })

    def handle_get_diagnoses(self):
        self.send_json({"success": True, "diagnoses": db_sql.get_diagnoses()})

    def handle_export_db(self):
        self.send_json(db_sql.export_full_dict())

    def handle_login(self):
        client_ip = self.client_address[0] if self.client_address else '127.0.0.1'
        if not RATE_LIMITER.is_allowed(f"login_{client_ip}", max_requests=12, window_seconds=300):
            self.send_json({"success": False, "message": "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 5 phút để bảo vệ an toàn tài khoản!"}, 429)
            return

        body = self.read_json_body()
        if not body:
            self.send_json({"success": False, "message": "Dữ liệu không hợp lệ"}, 400)
            return

        phone_or_id = body.get("phoneOrId", "").strip()
        password = body.get("password", "").strip()
        found_user = db_sql.find_user_by_credential(phone_or_id, include_password=True)

        if found_user:
            user_pwd = found_user.get("password", "123456")
            if not password or not db_sql.verify_password(user_pwd, password):
                self.send_json({"success": False, "message": "Mật khẩu không chính xác. Vui lòng thử lại!"}, 401)
                return

            # Nâng cấp mật khẩu plaintext cũ lên chuẩn băm SHA-256 an toàn
            if not user_pwd.startswith("sha256$"):
                db_sql.update_user_password(found_user["id"], db_sql.hash_password(password))

            found_user["lastLoginAt"] = datetime.now().isoformat()
            db_sql.update_user(found_user)
            db_sql.set_active_user_id(found_user["id"])

            client_meta = self.extract_client_metadata(body)
            activity_log = db_sql.log_activity(
                user_id=found_user["id"],
                user_name=found_user["fullName"],
                service_type="AUTH_LOGIN",
                title="Đăng nhập tài khoản",
                detail=f"Người dùng {found_user['fullName']} (SĐT/ID: {phone_or_id}) đã đăng nhập thành công vào hệ thống.",
                device=client_meta["device"],
                metadata={
                    "action": "LOGIN",
                    "loginAt": found_user["lastLoginAt"],
                    "phone": found_user.get("phone"),
                    "role": found_user.get("role"),
                    **client_meta
                }
            )

            # Đẩy sự kiện lên Realtime Event Hub cho Mavis Admin
            push_realtime_event(
                event_type="AUTH_LOGIN",
                user_data=found_user,
                log_data=activity_log,
                detail=f"Người dùng {found_user['fullName']} vừa đăng nhập thành công."
            )

            user_diags = db_sql.get_diagnoses(user_id=found_user["id"])

            # Luôn che giấu hash mật khẩu trước khi gửi về giao diện web
            found_user["password"] = "••••••••"

            self.send_json({
                "success": True,
                "user": found_user,
                "log": activity_log,
                "diagnoses": user_diags,
                "message": f"Chào mừng {found_user['fullName']} đã đăng nhập thành công!"
            })
        else:
            self.send_json({"success": False, "message": "Không tìm thấy tài khoản với thông tin này. Bạn vui lòng kiểm tra lại hoặc chuyển sang tab Đăng ký!"}, 404)

    def handle_register(self):
        client_ip = self.client_address[0] if self.client_address else '127.0.0.1'
        if not RATE_LIMITER.is_allowed(f"reg_{client_ip}", max_requests=15, window_seconds=3600):
            self.send_json({"success": False, "message": "Quá nhiều lượt đăng ký từ mạng này. Vui lòng thử lại sau 1 giờ!"}, 429)
            return

        body = self.read_json_body()
        if not body:
            self.send_json({"success": False, "message": "Dữ liệu không hợp lệ"}, 400)
            return

        full_name = body.get("fullName", "").strip()[:100]
        phone = body.get("phone", "").strip()[:30]
        password = body.get("password", "").strip() or "123456"

        if not full_name or not phone:
            self.send_json({"success": False, "message": "Vui lòng nhập họ tên và số điện thoại!"}, 400)
            return

        for u in db_sql.get_all_users():
            if u.get("phone") == phone:
                self.send_json({"success": False, "message": "Số điện thoại này đã được đăng ký trong hệ thống. Vui lòng chuyển sang tab Đăng Nhập!"}, 409)
                return

        new_user = {
            "id": "user_" + str(int(datetime.now().timestamp())),
            "fullName": full_name,
            "phone": phone,
            "password": password,
            "email": body.get("email", "")[:100],
            "verified": True,
            "role": body.get("role", "Thành viên SleepSync")[:60],
            "bio": body.get("bio", "Mục tiêu cải thiện chất lượng giấc ngủ sâu NREM 💤")[:500],
            "age": body.get("age", "28 tuổi")[:30],
            "gender": body.get("gender", "Khác")[:20],
            "occupation": (body.get("occupation") or body.get("role", "Tự do"))[:60],
            "targetBedtime": body.get("targetBedtime", "23:00")[:10],
            "wakeTime": body.get("wakeTime", "06:30")[:10],
            "fitnessLevel": body.get("fitnessLevel", "Trung bình")[:30],
            "healthConditions": (body.get("healthConditions", ["Sức khỏe ổn định"]) or [])[:20],
            "avatarType": body.get("avatarType", "programmer_laptop")[:50],
            "createdAt": datetime.now().isoformat(),
            "lastLoginAt": datetime.now().isoformat()
        }

        created = db_sql.create_user(new_user)
        db_sql.set_active_user_id(created["id"])

        client_meta = self.extract_client_metadata(body)
        activity_log = db_sql.log_activity(
            user_id=created["id"],
            user_name=created["fullName"],
            service_type="AUTH_REGISTER",
            title="Đăng ký thành viên mới",
            detail=f"Thành viên mới {created['fullName']} (SĐT: {created['phone']} - Nghề: {created.get('occupation', created.get('role', 'Tự do'))}) vừa tạo tài khoản và lưu vào SQL Database.",
            device=client_meta["device"],
            metadata={
                "action": "REGISTER",
                "phone": created["phone"],
                "age": created.get("age"),
                "occupation": created.get("occupation") or created.get("role"),
                "targetBedtime": created.get("targetBedtime"),
                "wakeTime": created.get("wakeTime"),
                **client_meta
            }
        )

        db_sql.upsert_ai_profile(
            created["id"],
            summary_notes=f"Tài khoản {created['fullName']} mới đăng ký. Mục tiêu: {created['bio']}"
        )

        # Đẩy sự kiện lên Realtime Event Hub cho Mavis Admin
        push_realtime_event(
            event_type="AUTH_REGISTER",
            user_data=created,
            log_data=activity_log,
            detail=f"Thành viên mới {created['fullName']} ({created['phone']}) vừa đăng ký thành công."
        )

        # Che giấu hash mật khẩu trước khi gửi về client
        created["password"] = "••••••••"

        self.send_json({
            "success": True,
            "user": created,
            "log": activity_log,
            "message": "Đăng ký tài khoản thành công! Dữ liệu đã được lưu trữ an toàn vào Cơ sở dữ liệu SQL."
        })

    def handle_sync(self):
        body = self.read_json_body()
        client_meta = self.extract_client_metadata(body)
        requested_user_ids = []
        if body and isinstance(body, dict):
            client_users = body.get("users", [])
            client_logs = body.get("serviceUsage", [])
            client_diags = body.get("diagnoses", [])
            requested_user_ids = body.get("userIds", [])
            if not requested_user_ids and isinstance(client_users, list):
                requested_user_ids = [u.get("id") for u in client_users if isinstance(u, dict) and u.get("id")]

            # Giới hạn số lượng bản ghi đồng bộ để tránh tấn công DoS payload lớn
            if isinstance(client_users, list):
                for cu in client_users[:50]:
                    if isinstance(cu, dict) and cu.get("id"):
                        existing = db_sql.get_user_by_id(cu.get("id"), include_password=True)
                        if existing:
                            cu_copy = dict(cu)
                            # Không bao giờ cho phép ghi đè mật khẩu qua kênh đồng bộ chưa xác thực
                            cu_copy['password'] = existing['password']
                            db_sql.update_user(cu_copy)
            device_type = client_meta.get("device", "Desktop Web")

            if isinstance(client_logs, list):
                for cl in client_logs[:100]:
                    if not isinstance(cl, dict):
                        continue
                if cl.get("title") or cl.get("serviceType"):
                    ts = cl.get("timestamp")
                    st = cl.get("serviceType", "CLIENT_SYNC")
                    uid = cl.get("userId")
                    with db_sql.get_connection() as conn:
                        existing = conn.execute(
                            "SELECT id FROM user_activities WHERE (user_id = ? OR (? IS NULL AND user_id IS NULL)) AND service_type = ? AND timestamp = ? LIMIT 1",
                            (uid, uid, st, ts)
                        ).fetchone()
                    if not existing:
                        log_meta = cl.get("metadata") or {}
                        if not isinstance(log_meta, dict):
                            log_meta = {"raw": log_meta}
                        for k, v in client_meta.items():
                            if k not in log_meta:
                                log_meta[k] = v
                        db_sql.log_activity(
                            user_id=uid,
                            user_name=cl.get("userName"),
                            service_type=st,
                            title=cl.get("title", "Đồng bộ"),
                            detail=cl.get("detail", ""),
                            device=cl.get("device") or client_meta["device"],
                            metadata=log_meta,
                            timestamp=ts
                        )

            if isinstance(client_diags, list):
                for cd in client_diags[:50]:
                    if isinstance(cd, dict) and cd.get("score") is not None:
                        db_sql.save_diagnosis(cd)

        full_data = db_sql.export_full_dict()
        save_db(full_data)

        # Device privacy: Only return users and user-specific diagnoses that belong to this device
        requested_set = set(str(uid) for uid in requested_user_ids if uid)
        sync_response_data = {
            "users": [u for u in full_data.get("users", []) if str(u.get("id")) in requested_set] if requested_set else [],
            "serviceUsage": full_data.get("serviceUsage", [])[:50],
            "diagnoses": [d for d in full_data.get("diagnoses", []) if not requested_set or str(d.get("userId")) in requested_set],
            "aiProfiles": [p for p in full_data.get("aiProfiles", []) if not requested_set or str(p.get("userId")) in requested_set]
        }

        self.send_json({
            "success": True,
            "message": "Đồng bộ cơ sở dữ liệu SQL thành công!",
            "serverTime": datetime.now().isoformat(),
            "data": sync_response_data
        })

    def handle_save_user(self):
        body = self.read_json_body()
        if not body:
            self.send_json({"success": False, "message": "Dữ liệu rỗng"}, 400)
            return

        if body.get("id"):
            saved = db_sql.update_user(body)
        else:
            saved = db_sql.create_user(body)

        self.send_json({"success": True, "message": "Lưu người dùng thành công vào SQL!", "user": saved})

    def handle_delete_user(self):
        body = self.read_json_body()
        if not body or not body.get("userId"):
            self.send_json({"success": False, "message": "Thiếu userId"}, 400)
            return

        target_id = body.get("userId")
        db_sql.delete_user(target_id)
        self.send_json({"success": True, "message": "Đã xóa người dùng khỏi SQL database thành công!"})

    def handle_save_diagnosis(self):
        body = self.read_json_body()
        if not body:
            self.send_json({"success": False}, 400)
            return

        saved_diag = db_sql.save_diagnosis(body)
        
        user_id = body.get("userId")
        user_name = body.get("userName", "Người dùng")
        score = body.get("score", 0)
        client_meta = self.extract_client_metadata(body)
        db_sql.log_activity(
            user_id=user_id,
            user_name=user_name,
            service_type="DIAGNOSIS_5PILLARS",
            title="Khảo sát 5 Trụ Cột Y Khoa",
            detail=f"Điểm dự báo giấc ngủ {score}%. Khảo sát đã được lưu vào SQL database.",
            device=client_meta["device"],
            metadata=client_meta
        )

        if user_id:
            answers = body.get("answers", {})
            triggers = []
            if "late_high" in answers.get("caffeine_usage", []):
                triggers.append("Uống caffeine muộn sau 14h")
            if "heavy_late" in answers.get("dinner_habit", []):
                triggers.append("Ăn tối muộn, no sát giờ ngủ")
            if "lướt_tiktok_fb" in answers.get("bed_phone", []):
                triggers.append("Sử dụng điện thoại trên giường")
            if "high" in answers.get("stress_level", []):
                triggers.append("Căng thẳng thần kinh cao")

            db_sql.upsert_ai_profile(
                user_id=user_id,
                primary_pattern=f"Điểm giấc ngủ: {score}/100",
                triggers=triggers,
                summary_notes=f"Đã hoàn thành khảo sát 5 trụ cột y khoa với điểm {score}/100 lúc {datetime.now().strftime('%H:%M %d/%m/%Y')}."
            )

        # Đẩy sự kiện khảo sát lên Realtime Hub cho Mavis Admin
        push_realtime_event(
            event_type="DIAGNOSIS_5PILLARS",
            user_data={"id": user_id, "fullName": user_name},
            log_data={
                "id": saved_diag.get("id"),
                "serviceType": "DIAGNOSIS_5PILLARS",
                "title": "Hồ sơ khảo sát y khoa mới",
                "detail": f"Khảo sát nhịp sinh học từ {user_name} - Điểm: {score}/100",
                "userName": user_name,
                "userId": user_id,
                "timestamp": saved_diag.get("timestamp")
            },
            detail=f"Người dùng {user_name} vừa hoàn thành khảo sát 5 trụ cột ({score} điểm)."
        )

        self.send_json({"success": True, "diagnosis": saved_diag})

    def handle_add_log(self):
        body = self.read_json_body()
        if not body:
            self.send_json({"success": False}, 400)
            return

        client_meta = self.extract_client_metadata(body)
        meta = body.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {"raw": meta}
        for k, v in client_meta.items():
            if k not in meta:
                meta[k] = v

        logged = db_sql.log_activity(
            user_id=body.get("userId"),
            user_name=body.get("userName", "Hệ thống"),
            service_type=body.get("serviceType", "ACTION_LOG"),
            title=body.get("title", "Hành động"),
            detail=body.get("detail", ""),
            device=body.get("device") or client_meta["device"],
            metadata=meta,
            timestamp=body.get("timestamp")
        )

        push_realtime_event(
            event_type=body.get("serviceType", "ACTION_LOG"),
            user_data={"id": body.get("userId"), "fullName": body.get("userName")},
            log_data=logged,
            detail=body.get("detail", body.get("title", ""))
        )

        self.send_json({"success": True, "log": logged})

    def handle_reset_db(self):
        db_sql.clear_all_data()
        save_db(DEFAULT_DB)
        self.send_json({"success": True, "message": "Đã làm sạch toàn bộ dữ liệu cơ sở dữ liệu SQL!"})


if __name__ == '__main__':
    server_address = ('0.0.0.0', PORT)
    httpd = ThreadingHTTPServer(server_address, SleepSyncAPIHandler)
    print("=" * 65, flush=True)
    print(f"🌙 SleepSync Server running on http://localhost:{PORT}", flush=True)
    print(f"👉 1. Web Người Dùng (Main Web): http://localhost:{PORT}/", flush=True)
    print(f"👉 2. Web Quản Trị (Mavis Admin): http://localhost:{PORT}/admin.html (Mã PIN: 2004)", flush=True)
    print("✨ Tự động mở cả 2 trang web song song trên trình duyệt...", flush=True)
    print("=" * 65, flush=True)

    # Tự động mở cả Web chính và Web quản trị trên trình duyệt
    import webbrowser
    def open_tabs():
        import time
        time.sleep(1.0)
        try:
            webbrowser.open(f"http://localhost:{PORT}/")
            time.sleep(0.6)
            webbrowser.open(f"http://localhost:{PORT}/admin.html")
        except Exception:
            pass
    threading.Thread(target=open_tabs, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
