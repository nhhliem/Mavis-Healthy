"""
SQL Database Manager for SleepSync AI.
Engine: SQLite (Native Python SQL Driver)
Database file: sleepsync.db
Schema file: schema.sql
"""
import os
import json
import sqlite3
import time
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, 'sleepsync.db')
SCHEMA_FILE = os.path.join(BASE_DIR, 'schema.sql')
JSON_BACKUP = os.path.join(BASE_DIR, 'server_database.json')

import hashlib
import hmac

PASSWORD_SALT = "mavis_sleepsync_secure_salt_v1"

def hash_password(password):
    if not password:
        password = "123456"
    if password.startswith("sha256$"):
        return password
    hashed = hashlib.sha256(f"{PASSWORD_SALT}:{password}".encode('utf-8')).hexdigest()
    return f"sha256${hashed}"

def verify_password(stored_password, candidate_password):
    if not stored_password or not candidate_password:
        return False
    if candidate_password.startswith("sha256$") and not stored_password.startswith("sha256$"):
        stored_password, candidate_password = candidate_password, stored_password
    if stored_password.startswith("sha256$"):
        candidate_hashed = hash_password(candidate_password)
        return hmac.compare_digest(stored_password, candidate_hashed)
    return hmac.compare_digest(stored_password, candidate_password)

def get_connection():
    conn = sqlite3.connect(DB_FILE, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    conn.execute("PRAGMA cache_size = -64000;")
    return conn

def init_db():
    """Initializes tables using schema.sql and migrates existing JSON data if needed."""
    if os.path.exists(SCHEMA_FILE):
        with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
            schema_sql = f.read()
    else:
        raise FileNotFoundError(f"Schema file not found at {SCHEMA_FILE}")

    with get_connection() as conn:
        conn.executescript(schema_sql)
        conn.commit()

def clear_all_data():
    """Wipes all users, activities, diagnoses, and AI profiles to clean database completely."""
    with get_connection() as conn:
        conn.execute("DELETE FROM ai_personalization_profiles;")
        conn.execute("DELETE FROM sleep_diagnoses;")
        conn.execute("DELETE FROM user_activities;")
        conn.execute("DELETE FROM users;")
        conn.execute("DELETE FROM system_metadata;")
        conn.commit()
    print("[SQL Database] Successfully cleared all users, activities, diagnoses, and profiles.")

def migrate_from_json(json_path):
    """Migrate all data from server_database.json into the SQL database."""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"[SQL Migration] Failed to read {json_path}: {e}")
        return

    users = data.get('users', [])
    activities = data.get('serviceUsage', [])
    diagnoses = data.get('diagnoses', [])
    active_user_id = data.get('activeUserId')

    with get_connection() as conn:
        # Migrate users
        for u in users:
            conn.execute("""
                INSERT OR REPLACE INTO users (
                    id, full_name, phone, email, password, role, bio, age, gender,
                    occupation, target_bedtime, wake_time, fitness_level,
                    health_conditions, avatar_type, verified, streak_days,
                    created_at, last_login_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                u.get('id'),
                u.get('fullName') or u.get('full_name') or 'Người dùng',
                u.get('phone'),
                u.get('email', ''),
                u.get('password', '123456'),
                u.get('role', 'Thành viên SleepSync'),
                u.get('bio', ''),
                u.get('age', ''),
                u.get('gender', 'Khác'),
                u.get('occupation', ''),
                u.get('targetBedtime', '23:00'),
                u.get('wakeTime', '06:30'),
                u.get('fitnessLevel', 'Trung bình'),
                json.dumps(u.get('healthConditions', []), ensure_ascii=False),
                u.get('avatarType', 'programmer_laptop'),
                1 if u.get('verified', True) else 0,
                u.get('streakDays', 1),
                u.get('createdAt') or datetime.now().isoformat(),
                u.get('lastLoginAt') or datetime.now().isoformat()
            ))

        # Migrate user activities
        valid_uids = {u.get('id') for u in users}
        for a in activities:
            uid = a.get('userId')
            if uid not in valid_uids:
                uid = None
            metadata_val = a.get('metadata')
            if isinstance(metadata_val, (dict, list)):
                metadata_val = json.dumps(metadata_val, ensure_ascii=False)
            conn.execute("""
                INSERT OR IGNORE INTO user_activities (
                    id, user_id, user_name, service_type, title, detail, device, metadata, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                a.get('id'),
                uid,
                a.get('userName') or '',
                a.get('serviceType') or 'GENERAL_ACTIVITY',
                a.get('title') or 'Hành động',
                a.get('detail') or '',
                a.get('device') or 'Web Browser',
                metadata_val,
                a.get('timestamp') or datetime.now().isoformat()
            ))

        # Migrate diagnoses
        for d in diagnoses:
            uid = d.get('userId')
            if uid not in valid_uids:
                uid = None
            conn.execute("""
                INSERT OR IGNORE INTO sleep_diagnoses (
                    id, user_id, user_name, score, pillars, answers, custom_answers, device, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                d.get('id'),
                uid,
                d.get('userName') or '',
                d.get('score', 0),
                json.dumps(d.get('pillars', {}), ensure_ascii=False),
                json.dumps(d.get('answers', {}), ensure_ascii=False),
                json.dumps(d.get('customAnswers', {}), ensure_ascii=False),
                d.get('device', 'Web Browser'),
                d.get('timestamp') or datetime.now().isoformat()
            ))

        if active_user_id:
            conn.execute("""
                INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('active_user_id', ?)
            """, (active_user_id,))

        conn.commit()
    print("[SQL Migration] Successfully migrated JSON data into SQL database sleepsync.db")

# -------------------------------------------------------------
# HELPER CONVERTER: SQL Row -> Frontend JSON dictionary format
# -------------------------------------------------------------
def _row_to_user_dict(row, include_password=False):
    if not row:
        return None
    try:
        health_cond = json.loads(row['health_conditions']) if row['health_conditions'] else []
    except Exception:
        health_cond = []

    res = {
        "id": row['id'],
        "fullName": row['full_name'],
        "phone": row['phone'],
        "email": row['email'] or '',
        "password": row['password'] if include_password else "••••••••",
        "role": row['role'],
        "bio": row['bio'] or '',
        "age": row['age'] or '',
        "gender": row['gender'] or 'Khác',
        "occupation": row['occupation'] or '',
        "targetBedtime": row['target_bedtime'] or '23:00',
        "wakeTime": row['wake_time'] or '06:30',
        "fitnessLevel": row['fitness_level'] or 'Trung bình',
        "healthConditions": health_cond,
        "avatarType": row['avatar_type'] or 'programmer_laptop',
        "verified": bool(row['verified']),
        "streakDays": row['streak_days'] or 1,
        "createdAt": row['created_at'],
        "lastLoginAt": row['last_login_at']
    }
    return res

def _row_to_activity_dict(row):
    if not row:
        return None
    meta = None
    if row['metadata']:
        try:
            meta = json.loads(row['metadata'])
        except Exception:
            meta = row['metadata']
    return {
        "id": row['id'],
        "userId": row['user_id'],
        "userName": row['user_name'],
        "serviceType": row['service_type'],
        "title": row['title'],
        "detail": row['detail'],
        "device": row['device'],
        "metadata": meta,
        "timestamp": row['timestamp']
    }

def _row_to_diagnosis_dict(row):
    if not row:
        return None
    try:
        pillars = json.loads(row['pillars']) if row['pillars'] else {}
    except Exception:
        pillars = {}
    try:
        answers = json.loads(row['answers']) if row['answers'] else {}
    except Exception:
        answers = {}
    try:
        custom_answers = json.loads(row['custom_answers']) if row['custom_answers'] else {}
    except Exception:
        custom_answers = {}

    return {
        "id": row['id'],
        "userId": row['user_id'],
        "userName": row['user_name'],
        "score": row['score'],
        "pillars": pillars,
        "answers": answers,
        "customAnswers": custom_answers,
        "device": row['device'],
        "timestamp": row['timestamp']
    }

# -------------------------------------------------------------
# USER CRUD OPERATIONS
# -------------------------------------------------------------
def get_all_users():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        return [_row_to_user_dict(r, include_password=False) for r in rows]

def get_user_by_id(user_id, include_password=False):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _row_to_user_dict(row, include_password=include_password)

def find_user_by_credential(credential, include_password=False):
    if not credential:
        return None
    clean = credential.strip()
    clean_no_space = clean.replace(" ", "")
    clean_lower = clean.lower()
    with get_connection() as conn:
        # 1. Search directly by phone, ID, email, or full name using SQL index
        row = conn.execute("""
            SELECT * FROM users 
            WHERE phone = ? OR phone = ? OR id = ? OR LOWER(email) = ? OR LOWER(full_name) = ?
            LIMIT 1
        """, (clean, clean_no_space, clean, clean_lower, clean_lower)).fetchone()
        if row:
            return _row_to_user_dict(row, include_password=include_password)
        
        # 2. Check prefixed user ID
        row = conn.execute("SELECT * FROM users WHERE id = ? LIMIT 1", (f"user_{clean}",)).fetchone()
        if row:
            return _row_to_user_dict(row, include_password=include_password)

        # 3. Handle alternate phone formats (leading 0)
        if clean_no_space.isdigit():
            alt_phone = clean_no_space[1:] if clean_no_space.startswith('0') else f"0{clean_no_space}"
            row = conn.execute("SELECT * FROM users WHERE phone = ? LIMIT 1", (alt_phone,)).fetchone()
            if row:
                return _row_to_user_dict(row, include_password=include_password)

    return None

def create_user(user_dict):
    user_id = user_dict.get('id') or ("user_" + str(int(datetime.now().timestamp())))
    now = datetime.now().isoformat()
    health_cond = json.dumps(user_dict.get('healthConditions', []), ensure_ascii=False)
    raw_pwd = user_dict.get('password') or '123456'
    hashed_pwd = hash_password(raw_pwd)
    
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO users (
                id, full_name, phone, email, password, role, bio, age, gender,
                occupation, target_bedtime, wake_time, fitness_level,
                health_conditions, avatar_type, verified, streak_days,
                created_at, last_login_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            user_dict.get('fullName', 'Người dùng'),
            user_dict.get('phone'),
            user_dict.get('email', ''),
            hashed_pwd,
            user_dict.get('role', 'Thành viên SleepSync'),
            user_dict.get('bio', 'Mục tiêu cải thiện chất lượng giấc ngủ sâu NREM 💤'),
            user_dict.get('age', '28 tuổi'),
            user_dict.get('gender', 'Khác'),
            user_dict.get('occupation', 'Tự do'),
            user_dict.get('targetBedtime', '23:00'),
            user_dict.get('wakeTime', '06:30'),
            user_dict.get('fitnessLevel', 'Trung bình'),
            health_cond,
            user_dict.get('avatarType', 'programmer_laptop'),
            1 if user_dict.get('verified', True) else 0,
            user_dict.get('streakDays', 1),
            user_dict.get('createdAt') or now,
            user_dict.get('lastLoginAt') or now
        ))
        conn.commit()
    return get_user_by_id(user_id)

def update_user_password(user_id, hashed_password):
    with get_connection() as conn:
        conn.execute("UPDATE users SET password = ?, updated_at = ? WHERE id = ?", (hashed_password, datetime.now().isoformat(), user_id))
        conn.commit()

def update_user(user_dict):
    user_id = user_dict.get('id')
    if not user_id:
        return None
    existing = get_user_by_id(user_id, include_password=True)
    if not existing:
        return create_user(user_dict)

    now = datetime.now().isoformat()
    health_cond = json.dumps(user_dict.get('healthConditions', existing['healthConditions']), ensure_ascii=False)

    new_pwd = user_dict.get('password')
    if new_pwd and new_pwd not in ('', '••••••••', existing['password']):
        final_pwd = hash_password(new_pwd)
    else:
        final_pwd = existing['password']

    with get_connection() as conn:
        conn.execute("""
            UPDATE users SET
                full_name = ?,
                phone = ?,
                email = ?,
                password = ?,
                role = ?,
                bio = ?,
                age = ?,
                gender = ?,
                occupation = ?,
                target_bedtime = ?,
                wake_time = ?,
                fitness_level = ?,
                health_conditions = ?,
                avatar_type = ?,
                verified = ?,
                streak_days = ?,
                last_login_at = ?,
                updated_at = ?
            WHERE id = ?
        """, (
            user_dict.get('fullName', existing['fullName']),
            user_dict.get('phone', existing['phone']),
            user_dict.get('email', existing['email']),
            final_pwd,
            user_dict.get('role', existing['role']),
            user_dict.get('bio', existing['bio']),
            user_dict.get('age', existing['age']),
            user_dict.get('gender', existing['gender']),
            user_dict.get('occupation', existing['occupation']),
            user_dict.get('targetBedtime', existing['targetBedtime']),
            user_dict.get('wakeTime', existing['wakeTime']),
            user_dict.get('fitnessLevel', existing['fitnessLevel']),
            health_cond,
            user_dict.get('avatarType', existing['avatarType']),
            1 if user_dict.get('verified', existing['verified']) else 0,
            user_dict.get('streakDays', existing['streakDays']),
            user_dict.get('lastLoginAt', existing['lastLoginAt']),
            now,
            user_id
        ))
        conn.commit()
    return get_user_by_id(user_id)

def delete_user(user_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return True

# -------------------------------------------------------------
# USER ACTIVITY LOGGING (Lưu toàn bộ hành động người dùng)
# -------------------------------------------------------------
def log_activity(user_id, user_name, service_type, title, detail="", device="Web Browser", metadata=None, timestamp=None):
    ts = timestamp or datetime.now().isoformat()
    meta_str = json.dumps(metadata, ensure_ascii=False) if metadata is not None else None
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO user_activities (
                user_id, user_name, service_type, title, detail, device, metadata, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, user_name, service_type, title, detail, device, meta_str, ts))
        conn.commit()
        act_id = cursor.lastrowid
    return {
        "id": act_id,
        "userId": user_id,
        "userName": user_name,
        "serviceType": service_type,
        "title": title,
        "detail": detail,
        "device": device,
        "metadata": metadata,
        "timestamp": ts
    }

def get_activities(limit=150, user_id=None):
    with get_connection() as conn:
        if user_id:
            rows = conn.execute(
                "SELECT * FROM user_activities WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                (user_id, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM user_activities ORDER BY timestamp DESC LIMIT ?",
                (limit,)
            ).fetchall()
        return [_row_to_activity_dict(r) for r in rows]

# -------------------------------------------------------------
# SLEEP DIAGNOSES
# -------------------------------------------------------------
def save_diagnosis(diag_dict):
    diag_id = diag_dict.get('id') or int(datetime.now().timestamp() * 1000)
    ts = diag_dict.get('timestamp') or datetime.now().isoformat()
    pillars_str = json.dumps(diag_dict.get('pillars', {}), ensure_ascii=False)
    answers_str = json.dumps(diag_dict.get('answers', {}), ensure_ascii=False)
    custom_str = json.dumps(diag_dict.get('customAnswers', {}), ensure_ascii=False)

    with get_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO sleep_diagnoses (
                id, user_id, user_name, score, pillars, answers, custom_answers, device, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            diag_id,
            diag_dict.get('userId', 'unknown'),
            diag_dict.get('userName', ''),
            diag_dict.get('score', 0),
            pillars_str,
            answers_str,
            custom_str,
            diag_dict.get('device', 'Web Browser'),
            ts
        ))
        conn.commit()

    return {
        "id": diag_id,
        "userId": diag_dict.get('userId'),
        "userName": diag_dict.get('userName'),
        "score": diag_dict.get('score'),
        "pillars": diag_dict.get('pillars', {}),
        "answers": diag_dict.get('answers', {}),
        "customAnswers": diag_dict.get('customAnswers', {}),
        "device": diag_dict.get('device', 'Web Browser'),
        "timestamp": ts
    }

def get_diagnoses(user_id=None):
    with get_connection() as conn:
        if user_id:
            rows = conn.execute(
                "SELECT * FROM sleep_diagnoses WHERE user_id = ? ORDER BY timestamp DESC",
                (user_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM sleep_diagnoses ORDER BY timestamp DESC"
            ).fetchall()
        return [_row_to_diagnosis_dict(r) for r in rows]

# -------------------------------------------------------------
# AI PERSONALIZATION PROFILES
# -------------------------------------------------------------
def get_ai_profile(user_id):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM ai_personalization_profiles WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            return None
        return {
            "userId": row['user_id'],
            "chronotype": row['chronotype'],
            "primarySleepPattern": row['primary_sleep_pattern'],
            "keyTriggers": json.loads(row['key_triggers']) if row['key_triggers'] else [],
            "effectiveInterventions": json.loads(row['effective_interventions']) if row['effective_interventions'] else [],
            "aiSummaryNotes": row['ai_summary_notes'],
            "lastAiInteraction": row['last_ai_interaction'],
            "updatedAt": row['updated_at']
        }

def upsert_ai_profile(user_id, chronotype=None, primary_pattern=None, triggers=None, interventions=None, summary_notes=None):
    existing = get_ai_profile(user_id)
    now = datetime.now().isoformat()
    triggers_json = json.dumps(triggers if triggers is not None else (existing['keyTriggers'] if existing else []), ensure_ascii=False)
    interventions_json = json.dumps(interventions if interventions is not None else (existing['effectiveInterventions'] if existing else []), ensure_ascii=False)

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO ai_personalization_profiles (
                user_id, chronotype, primary_sleep_pattern, key_triggers, effective_interventions, ai_summary_notes, last_ai_interaction, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                chronotype = COALESCE(excluded.chronotype, ai_personalization_profiles.chronotype),
                primary_sleep_pattern = COALESCE(excluded.primary_sleep_pattern, ai_personalization_profiles.primary_sleep_pattern),
                key_triggers = excluded.key_triggers,
                effective_interventions = excluded.effective_interventions,
                ai_summary_notes = COALESCE(excluded.ai_summary_notes, ai_personalization_profiles.ai_summary_notes),
                last_ai_interaction = excluded.last_ai_interaction,
                updated_at = excluded.updated_at
        """, (
            user_id,
            chronotype or (existing['chronotype'] if existing else None),
            primary_pattern or (existing['primarySleepPattern'] if existing else None),
            triggers_json,
            interventions_json,
            summary_notes or (existing['aiSummaryNotes'] if existing else None),
            now,
            now
        ))
        conn.commit()
    return get_ai_profile(user_id)

# -------------------------------------------------------------
# ACTIVE USER & SYSTEM METADATA
# -------------------------------------------------------------
def get_active_user_id():
    with get_connection() as conn:
        row = conn.execute("SELECT value FROM system_metadata WHERE key = 'active_user_id'").fetchone()
        if row and row['value']:
            return row['value']
        first_user = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
        return first_user['id'] if first_user else None

def set_active_user_id(user_id):
    with get_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('active_user_id', ?)", (user_id,))
        conn.commit()

def get_stats():
    t_start = time.perf_counter()
    with get_connection() as conn:
        total_users = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()['c']
        total_diags = conn.execute("SELECT COUNT(*) AS c FROM sleep_diagnoses").fetchone()['c']
        total_logs = conn.execute("SELECT COUNT(*) AS c FROM user_activities").fetchone()['c']
        guardrails = conn.execute("SELECT COUNT(*) AS c FROM user_activities WHERE service_type LIKE '%GUARDRAIL%'").fetchone()['c']
        ai_chats = conn.execute("SELECT COUNT(*) AS c FROM user_activities WHERE service_type LIKE '%AI_CHAT%'").fetchone()['c']

        db_size_kb = 0
        if os.path.exists(DB_FILE):
            try:
                db_size_kb = round(os.path.getsize(DB_FILE) / 1024, 1)
            except Exception:
                db_size_kb = 0

        query_time_ms = round((time.perf_counter() - t_start) * 1000, 1)

        return {
            "totalUsers": total_users,
            "totalDiagnoses": total_diags,
            "totalAiChats": ai_chats,
            "totalGuardrailBlocks": guardrails,
            "totalLogs": total_logs,
            "totalRecords": total_users + total_diags + total_logs,
            "dbFileSizeKb": db_size_kb,
            "queryTimeMs": query_time_ms,
            "lastSync": datetime.now().strftime("%H:%M:%S %d/%m/%Y"),
            "serverStatus": "Online (SQL Database Active)",
            "databaseEngine": "SQLite (sleepsync.db)"
        }

def export_full_dict():
    """Returns dictionary format compatible with original server_database.json."""
    return {
        "users": get_all_users(),
        "activeUserId": get_active_user_id(),
        "serviceUsage": get_activities(limit=200),
        "diagnoses": get_diagnoses()
    }
