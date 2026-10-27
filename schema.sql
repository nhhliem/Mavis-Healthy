-- ===================================================================
-- SLEEPSYNC AI - SQL DATABASE SCHEMA (SQLite / Standard SQL)
-- Lưu trữ tài khoản, toàn bộ nhật ký hành động và hồ sơ cá nhân hóa AI
-- ===================================================================

PRAGMA foreign_keys = ON;

-- 1. BẢNG NGƯỜI DÙNG (USERS)
-- Quản lý toàn bộ thông tin đăng ký, hồ sơ thể chất & mục tiêu sinh học
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                          -- Mã định danh duy nhất (user_xxx)
    full_name TEXT NOT NULL,                      -- Họ và tên
    phone TEXT UNIQUE,                            -- Số điện thoại đăng nhập
    email TEXT,                                   -- Email
    password TEXT NOT NULL,                       -- Mật khẩu
    role TEXT DEFAULT 'Thành viên SleepSync',     -- Vai trò/Chức danh
    bio TEXT,                                     -- Giới thiệu/Mục tiêu giấc ngủ
    age TEXT,                                     -- Độ tuổi
    gender TEXT,                                  -- Giới tính
    occupation TEXT,                              -- Nghề nghiệp
    target_bedtime TEXT DEFAULT '23:00',          -- Giờ ngủ mục tiêu
    wake_time TEXT DEFAULT '06:30',               -- Giờ thức dậy mục tiêu
    fitness_level TEXT DEFAULT 'Trung bình',      -- Thể lực vận động
    health_conditions TEXT DEFAULT '[]',          -- Bệnh nền / triệu chứng (JSON Array)
    avatar_type TEXT DEFAULT 'programmer_laptop', -- Loại avatar
    verified INTEGER DEFAULT 1,                   -- Đã xác thực
    streak_days INTEGER DEFAULT 1,                -- Chuỗi ngày theo dõi
    created_at TEXT NOT NULL,                     -- Thời điểm tạo tài khoản
    last_login_at TEXT NOT NULL,                  -- Lần đăng nhập gần nhất
    updated_at TEXT                               -- Lần cập nhật hồ sơ gần nhất
);

-- 2. BẢNG NHẬT KÝ HÀNH ĐỘNG CỦA USER (USER_ACTIVITIES)
-- Lưu lại TOÀN BỘ những gì người dùng thao tác trên web
CREATE TABLE IF NOT EXISTS user_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,                                 -- ID người dùng thực hiện (NULL nếu là khách ẩn danh)
    user_name TEXT,                               -- Tên người dùng tại thời điểm làm
    service_type TEXT NOT NULL,                   -- Loại hành động (AUTH_REGISTER, AUTH_LOGIN, DIAGNOSIS_5PILLARS, AI_CHAT, SOUNDSCAPE, etc.)
    title TEXT NOT NULL,                          -- Tiêu đề tóm tắt hành động
    detail TEXT,                                  -- Chi tiết hành động người dùng vừa làm
    device TEXT DEFAULT 'Web Browser',            -- Thiết bị sử dụng (Web Browser, Mobile PWA...)
    metadata TEXT,                                -- Dữ liệu kỹ thuật đính kèm (JSON nếu có)
    timestamp TEXT NOT NULL,                      -- Thời gian thực hiện (ISO String)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. BẢNG KHẢO SÁT & CHẨN ĐOÁN GIẤC NGỦ (SLEEP_DIAGNOSES)
-- Lưu trữ chi tiết các câu trả lời trắc nghiệm, điểm số 5 trụ cột y khoa
CREATE TABLE IF NOT EXISTS sleep_diagnoses (
    id INTEGER PRIMARY KEY,                       -- ID khảo sát (timestamp ms)
    user_id TEXT,                                 -- ID người dùng (NULL nếu làm trắc nghiệm ẩn danh)
    user_name TEXT,                               -- Tên người dùng
    score INTEGER NOT NULL,                       -- Điểm chất lượng giấc ngủ (0-100)
    pillars TEXT NOT NULL,                        -- Điểm 5 trụ cột (JSON Object)
    answers TEXT NOT NULL,                        -- Các câu trả lời trắc nghiệm (JSON Object)
    custom_answers TEXT,                          -- Câu trả lời tùy chỉnh hoặc ghi chú thêm
    device TEXT DEFAULT 'Web Browser',            -- Thiết bị làm khảo sát
    timestamp TEXT NOT NULL,                      -- Thời gian nộp khảo sát
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. BẢNG HỒ SƠ CÁ NHÂN HÓA CỦA AI (AI_PERSONALIZATION_PROFILES)
-- Lưu trữ các đặc tính được AI phân tích riêng cho từng user
CREATE TABLE IF NOT EXISTS ai_personalization_profiles (
    user_id TEXT PRIMARY KEY,                     -- Gắn liền với từng user
    chronotype TEXT,                              -- Kiểu hình sinh học (Cú đêm / Chim sơn ca)
    primary_sleep_pattern TEXT,                   -- Dạng mất ngủ chính (Khó vào giấc / Tỉnh giữa đêm / Dậy sớm)
    key_triggers TEXT,                            -- Các tác nhân gây mất ngủ chính (JSON Array)
    effective_interventions TEXT,                 -- Các vi-hành động phù hợp nhất với user này (JSON Array)
    ai_summary_notes TEXT,                        -- Tóm tắt bệnh cảnh y khoa do AI tổng hợp
    last_ai_interaction TEXT,                     -- Lần trò chuyện AI gần nhất
    updated_at TEXT NOT NULL,                     -- Thời điểm cập nhật hồ sơ cá nhân hóa
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. BẢNG THIẾT LẬP HỆ THỐNG (SYSTEM_METADATA)
CREATE TABLE IF NOT EXISTS system_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- TẠO CÁC CHỈ MỤC (INDEXES) TỐI ƯU TRUY VẤN TỐC ĐỘ CAO
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON user_activities(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_diagnoses_user_id ON sleep_diagnoses(user_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
