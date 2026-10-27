"""
Launcher script to expose SleepSync AI for phones and external computers.
Supports:
1. Public HTTPS URL via Cloudflare Tunnel (accessible from any phone on 4G/WiFi or remote PC).
2. Local Network LAN IP (accessible from devices on the same Wi-Fi).
"""
import os
import sys
import re
import socket
import subprocess
import time
import urllib.request

# Đảm bảo in ký tự Unicode và Emoji an toàn trên mọi terminal Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_port():
    env_path = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('PORT='):
                    try:
                        return int(line.split('=', 1)[1].strip())
                    except ValueError:
                        pass
    return 8766

def get_admin_key():
    env_path = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('ADMIN_KEY='):
                    return line.split('=', 1)[1].strip().strip('\"\'')
    return 'mavis_admin_founder_2026'

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def is_server_healthy(port):
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/stats")
        with urllib.request.urlopen(req, timeout=1.5) as res:
            return res.status == 200
    except Exception:
        return False

def free_port(port):
    """Giải phóng cổng nếu có tiến trình zombie chiếm giữ."""
    try:
        res = subprocess.run(
            ['netstat', '-ano'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False
        )
        for line in res.stdout.splitlines():
            if f":{port}" in line and 'LISTENING' in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid.isdigit() and int(pid) != os.getpid():
                    subprocess.run(['taskkill', '/F', '/PID', pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    time.sleep(0.4)
    except Exception:
        pass

def main():
    port = get_port()
    lan_ip = get_lan_ip()
    cf_path = os.path.join(BASE_DIR, 'cloudflared.exe')

    print("=" * 65)
    print("   🌙 SLEEPSYNC AI - KẾT NỐI ĐIỆN THOẠI & MÁY TÍNH BÊN NGOÀI")
    print("=" * 65)

    # 0. Dọn dẹp các tiến trình cloudflared cũ nếu bị treo từ các lần chạy trước
    try:
        subprocess.run(['taskkill', '/F', '/IM', 'cloudflared.exe'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.3)
    except Exception:
        pass

    # 1. Start server.py if not already running or not healthy
    server_proc = None
    if not is_server_healthy(port):
        free_port(port)
        print(f"[*] Đang khởi động SleepSync Server trên cổng {port}...")
        server_py = os.path.join(BASE_DIR, 'server.py')
        server_env = os.environ.copy()
        server_env['PYTHONIOENCODING'] = 'utf-8'
        server_env['PYTHONUTF8'] = '1'
        server_proc = subprocess.Popen([sys.executable, server_py], cwd=BASE_DIR, env=server_env)
        for _ in range(30):
            time.sleep(0.4)
            if is_server_healthy(port):
                break
        if not is_server_healthy(port):
            print(f"[!] Cảnh báo: Server chưa sẵn sàng trên port {port}.")
        else:
            print(f"[+] Server SleepSync đã sẵn sàng trên port {port}!")
    else:
        print(f"[+] Server SleepSync đang hoạt động ổn định trên port {port}.")

    # 2. Check cloudflared.exe
    if not os.path.exists(cf_path):
        print("[!] Không tìm thấy cloudflared.exe trong thư mục dự án.")
        print(f"[+] Bạn vẫn có thể truy cập qua mạng nội bộ Wi-Fi:")
        print(f"    👉 http://{lan_ip}:{port}")
        return

    # 3. Start cloudflared tunnel
    print("[*] Đang tạo đường hầm bảo mật HTTPS (Cloudflare Tunnel)...")
    tunnel_cmd = [cf_path, 'tunnel', '--url', f'http://127.0.0.1:{port}', '--no-autoupdate', '--metrics', '127.0.0.1:0']
    tunnel_proc = subprocess.Popen(
        tunnel_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace',
        cwd=BASE_DIR
    )

    public_url = None
    pattern = re.compile(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')

    start_time = time.time()
    while time.time() - start_time < 30:
        line = tunnel_proc.stdout.readline()
        if not line and tunnel_proc.poll() is not None:
            break
        match = pattern.search(line)
        if match:
            public_url = match.group(0)
            break

    # Tránh đầy buffer stdout khiến process bị nghẽn (pipe deadlock)
    import threading
    import webbrowser

    def drain_pipe():
        try:
            for _ in tunnel_proc.stdout:
                pass
        except Exception:
            pass
    threading.Thread(target=drain_pipe, daemon=True).start()

    # Tự động mở cả Web chính và Web quản trị Mavis Admin trên trình duyệt
    def open_browser_tabs():
        time.sleep(1.2)
        try:
            # 1. Mở Web chính
            webbrowser.open(f"http://localhost:{port}/")
            time.sleep(0.6)
            # 2. Mở Web quản trị song song
            webbrowser.open(f"http://localhost:{port}/admin.html")
        except Exception as e:
            print(f"[Browser Open Error] {e}")

    threading.Thread(target=open_browser_tabs, daemon=True).start()

    print("\n" + "=" * 65)
    print("   🚀 KẾT NỐI THÀNH CÔNG! HỆ THỐNG ĐÃ MỞ CẢ 2 TRANG WEB:")
    print("=" * 65)

    admin_key = get_admin_key()

    if public_url:
        print("\n🌐 [CÁCH 1 - KHUYÊN DÙNG] TRUY CẬP TỪ MỌI NƠI (Điện thoại 4G/5G, máy tính ngoài):")
        print(f"   👉 Link Web Cho Người Dùng (Gửi cho khách): {public_url}")
        print(f"   🔒 Web Quản Trị ĐÃ ĐƯỢC BẢO MẬT: Khách bên ngoài không thể truy cập (404 Not Found).")
        print(f"   🔑 Link Quản Trị từ xa bí mật (Chỉ dành riêng cho bạn): {public_url}/admin.html?key={admin_key}")
        print(f"   📲 Quét mã QR nhanh Web khách trên điện thoại: https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={public_url}")

        # Tự động lưu link ra file public_url.txt và sao chép vào Clipboard
        try:
            url_file = os.path.join(BASE_DIR, 'public_url.txt')
            with open(url_file, 'w', encoding='utf-8') as f:
                f.write(f"Link Web Cho Khách / Người Dùng (HTTPS):\n{public_url}\n\nLink Web Quản Trị Bí Mật (Founder Portal):\n{public_url}/admin.html?key={admin_key}\n(Mã PIN: 2004)\n\nMa QR:\nhttps://api.qrserver.com/v1/create-qr-code/?size=250x250&data={public_url}\n")
        except Exception:
            pass

        try:
            subprocess.run(['clip.exe'], input=public_url.encode('utf-8'), check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("   📋 (Đã tự động sao chép link Web chính vào bộ nhớ tạm Clipboard!)")
        except Exception:
            pass

    print("\n🏠 [CÁCH 2] TRUY CẬP TRÊN MÁY TÍNH NÀY HOẶC MẠNG NỘI BỘ (Wi-Fi):")
    print(f"   👉 1. Web Người Dùng: http://localhost:{port}/ (hoặc http://{lan_ip}:{port})")
    print(f"   👉 2. Web Quản Trị:   http://localhost:{port}/admin.html (Mã PIN: 2004)")
    print("   ✨ (Hệ thống đã tự động mở sẵn cả 2 tab trên trình duyệt của bạn!)")

    print("\n" + "=" * 65)
    print("👉 Khi người dùng đăng ký hoặc đăng nhập trên Web chính,")
    print("   dữ liệu và nhật ký sẽ hiển thị NGAY LẬP TỨC trên Web quản trị!")
    print("⚠️  LƯU Ý: Vui lòng giữ nguyên cửa sổ này để duy trì kết nối cho khách.")
    print("    Nhấn phím Ctrl + C để dừng chia sẻ.\n")

    try:
        while True:
            time.sleep(2)
            if tunnel_proc.poll() is not None:
                # Kiểm tra xem có tiến trình cloudflared nào đang duy trì tunnel không
                res = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq cloudflared.exe'], stdout=subprocess.PIPE, text=True, check=False)
                if 'cloudflared.exe' not in res.stdout:
                    print("[!] Cloudflared tunnel đã dừng.")
                    break
            if server_proc and server_proc.poll() is not None:
                print("[!] SleepSync Server đã dừng.")
                break
    except KeyboardInterrupt:
        print("\n[*] Đang đóng kết nối chia sẻ...")
        try:
            tunnel_proc.terminate()
        except Exception:
            pass
        if server_proc:
            try:
                server_proc.terminate()
            except Exception:
                pass
        subprocess.run(['taskkill', '/F', '/IM', 'cloudflared.exe'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("[+] Đã đóng kết nối an toàn.")

if __name__ == '__main__':
    main()
