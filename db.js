/**
 * SLEEPSYNC AI - CLIENT DATABASE ENGINE
 * Persistent storage for user profiles, authentication sessions, and service usage logs.
 * Backed by HTML5 IndexedDB with automated LocalStorage sync & fallback.
 */

const SleepSyncDB = (function() {
  const DB_NAME = 'SleepSyncAI_DB';
  const DB_VERSION = 1;
  const STORAGE_KEY_MIRROR = 'sleepsync_db_mirror';
  const STORAGE_KEY_ACTIVE_USER = 'sleepsync_active_user_id';
  const STORAGE_KEY_DEVICE_USERS = 'sleepsync_device_user_ids';

  let idb = null;
  let inMemoryData = null;

  // Clean Seed Data
  const DEFAULT_SEED_DATA = {
    users: [],
    activeUserId: null,
    serviceUsage: [],
    diagnoses: []
  };

  // Helper to load mirror from localStorage
  function loadLocalStorageMirror() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_MIRROR);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[SleepSyncDB] LocalStorage mirror parse error:', e);
    }
    return null;
  }

  // Helper to save mirror to localStorage
  function saveLocalStorageMirror(data) {
    try {
      localStorage.setItem(STORAGE_KEY_MIRROR, JSON.stringify(data));
      if (data.activeUserId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_USER, data.activeUserId);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_USER);
      }
    } catch (e) {
      console.warn('[SleepSyncDB] LocalStorage save error:', e);
    }
  }

  // Helper to load device user IDs from localStorage
  function getDeviceUserIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DEVICE_USERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      }
    } catch (e) {
      console.warn('[SleepSyncDB] Error parsing device user IDs:', e);
    }
    // Migration: if STORAGE_KEY_DEVICE_USERS is not yet initialized
    const savedActiveUserId = localStorage.getItem(STORAGE_KEY_ACTIVE_USER);
    if (savedActiveUserId) {
      const initial = [savedActiveUserId];
      saveDeviceUserIds(initial);
      return initial;
    }
    return [];
  }

  // Helper to save device user IDs to localStorage
  function saveDeviceUserIds(ids) {
    try {
      const cleanIds = Array.from(new Set(ids.filter(Boolean)));
      localStorage.setItem(STORAGE_KEY_DEVICE_USERS, JSON.stringify(cleanIds));
    } catch (e) {
      console.warn('[SleepSyncDB] Error saving device user IDs:', e);
    }
  }

  // Add an authorized user ID to this device
  function addDeviceUserId(userId) {
    if (!userId) return;
    const current = getDeviceUserIds();
    if (!current.includes(userId)) {
      current.push(userId);
      saveDeviceUserIds(current);
    }
  }

  // Remove / Forget a user account from this device
  function removeDeviceUserId(userId) {
    if (!userId) return;
    let current = getDeviceUserIds();
    current = current.filter(id => id !== userId);
    saveDeviceUserIds(current);

    if (inMemoryData && inMemoryData.users) {
      inMemoryData.users = inMemoryData.users.filter(u => u.id !== userId);
      if (inMemoryData.activeUserId === userId) {
        const remaining = current.length > 0 ? current[0] : null;
        inMemoryData.activeUserId = remaining;
        if (remaining) {
          localStorage.setItem(STORAGE_KEY_ACTIVE_USER, remaining);
        } else {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_USER);
          localStorage.setItem('sleepsync_explicit_logout', 'true');
        }
      }
      saveLocalStorageMirror(inMemoryData);
      syncMemoryToIndexedDB();
    }
    window.dispatchEvent(new CustomEvent('sleepsync:device-accounts-updated'));
    window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: getCurrentUser() }));
  }

  // Get only users that belong to this device
  function getDeviceUsers() {
    if (!inMemoryData || !inMemoryData.users) return [];
    const deviceIds = new Set(getDeviceUserIds());
    return inMemoryData.users.filter(u => deviceIds.has(u.id));
  }

  // Open / Init IndexedDB
  function openIndexedDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[SleepSyncDB] IndexedDB not available, using LocalStorage mirror.');
        resolve(null);
        return;
      }

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = function(e) {
          const db = e.target.result;

          if (!db.objectStoreNames.contains('users')) {
            const userStore = db.createObjectStore('users', { keyPath: 'id' });
            userStore.createIndex('phone', 'phone', { unique: false });
          }

          if (!db.objectStoreNames.contains('service_usage')) {
            const usageStore = db.createObjectStore('service_usage', { keyPath: 'id', autoIncrement: true });
            usageStore.createIndex('userId', 'userId', { unique: false });
            usageStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          if (!db.objectStoreNames.contains('diagnoses')) {
            const diagStore = db.createObjectStore('diagnoses', { keyPath: 'id' });
            diagStore.createIndex('userId', 'userId', { unique: false });
          }

          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        };

        req.onsuccess = function(e) {
          idb = e.target.result;
          resolve(idb);
        };

        req.onerror = function(e) {
          console.warn('[SleepSyncDB] IndexedDB open failed:', e);
          resolve(null);
        };
      } catch (err) {
        console.warn('[SleepSyncDB] IndexedDB init error:', err);
        resolve(null);
      }
    });
  }

  // Initialize DB instance
  async function init() {
    let mirror = loadLocalStorageMirror();
    if (!mirror || !Array.isArray(mirror.users)) {
      mirror = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA));
      saveLocalStorageMirror(mirror);
    }

    inMemoryData = mirror;

    // Device privacy: Prune inMemoryData.users so ONLY accounts belonging to THIS device are kept
    const deviceIds = new Set(getDeviceUserIds());
    inMemoryData.users = (inMemoryData.users || []).filter(u => deviceIds.has(u.id));

    // Connect to IndexedDB
    try {
      await openIndexedDB();
      if (idb) {
        // Sync in-memory to IndexedDB if needed
        syncMemoryToIndexedDB();
      }
    } catch (err) {
      console.warn('[SleepSyncDB] IndexedDB sync skipped:', err);
    }

    // Check if user previously logged in on this device
    const savedActiveUserId = localStorage.getItem(STORAGE_KEY_ACTIVE_USER);
    const hasExplicitLogout = localStorage.getItem('sleepsync_explicit_logout') === 'true';
    if (savedActiveUserId && deviceIds.has(savedActiveUserId) && inMemoryData.users.some(u => u.id === savedActiveUserId)) {
      inMemoryData.activeUserId = savedActiveUserId;
    } else if (!hasExplicitLogout && inMemoryData.users.length > 0) {
      inMemoryData.activeUserId = inMemoryData.users[0].id;
      localStorage.setItem(STORAGE_KEY_ACTIVE_USER, inMemoryData.activeUserId);
    } else {
      inMemoryData.activeUserId = null;
    }

    saveLocalStorageMirror(inMemoryData);

    console.log('[SleepSyncDB] Database initialized on this device. Current user:', getCurrentUser()?.fullName || 'Khách (Chưa đăng nhập)');
    
    // Auto-sync with cloud server initially and continuously in realtime
    setTimeout(() => {
      syncWithCloudServer();
    }, 100);

    // Continuous Realtime Cloud Sync every 12 seconds
    setInterval(() => {
      syncWithCloudServer();
    }, 12000);

    return inMemoryData;
  }

  function syncMemoryToIndexedDB() {
    if (!idb) return;
    try {
      const tx = idb.transaction(['users', 'service_usage', 'meta'], 'readwrite');
      const userStore = tx.objectStore('users');
      const metaStore = tx.objectStore('meta');

      inMemoryData.users.forEach(u => userStore.put(u));
      metaStore.put({ key: 'activeUserId', value: inMemoryData.activeUserId });
    } catch (e) {
      console.warn('[SleepSyncDB] Error syncing to IndexedDB:', e);
    }
  }

  // Get current active user (returns null if Guest / Not logged in)
  function getCurrentUser() {
    if (!inMemoryData || !inMemoryData.users || !inMemoryData.activeUserId) return null;
    const active = inMemoryData.users.find(u => u.id === inMemoryData.activeUserId);
    return active || null;
  }

  // Check if authenticated
  function isAuthenticated() {
    return !!getCurrentUser();
  }

  // Get all users on this device
  function getAllUsers() {
    return getDeviceUsers();
  }

  // Switch active user
  function setCurrentUser(userId) {
    const user = inMemoryData.users.find(u => u.id === userId);
    if (!user) return false;

    addDeviceUserId(userId);
    inMemoryData.activeUserId = userId;
    user.lastLoginAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_USER, userId);
      localStorage.removeItem('sleepsync_explicit_logout');
    } catch(e) {}
    saveLocalStorageMirror(inMemoryData);

    // Log the switch/login event
    logServiceUsage(
      'AUTH_LOGIN',
      'Đổi tài khoản đăng nhập',
      `Đã chuyển sang tài khoản ${user.fullName} (${user.role}).`
    );

    // Notify listeners
    window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: user }));
    return user;
  }

  // Update profile
  function updateUserProfile(userId, updatedFields) {
    const idx = inMemoryData.users.findIndex(u => u.id === userId);
    if (idx === -1) return null;

    const user = inMemoryData.users[idx];
    const updated = {
      ...user,
      ...updatedFields,
      updatedAt: new Date().toISOString()
    };

    inMemoryData.users[idx] = updated;
    saveLocalStorageMirror(inMemoryData);

    if (idb) {
      try {
        const tx = idb.transaction(['users'], 'readwrite');
        tx.objectStore('users').put(updated);
      } catch (e) {}
    }

    logServiceUsage(
      'PROFILE_UPDATE',
      'Cập nhật hồ sơ cá nhân',
      `Người dùng ${updated.fullName} đã cập nhật thông tin hồ sơ.`
    );

    window.dispatchEvent(new CustomEvent('sleepsync:user-updated', { detail: updated }));
    syncWithCloudServer();
    return updated;
  }

  // Create new user
  function createUser(userData) {
    const newId = 'user_' + Date.now().toString(36);
    const newUser = {
      id: newId,
      fullName: userData.fullName || 'Người Dùng Mới',
      verified: false,
      role: userData.role || 'Khách Hàng',
      bio: userData.bio || 'Chưa cập nhật mục tiêu giấc ngủ',
      age: userData.age || '28 tuổi',
      gender: userData.gender || 'Nam',
      occupation: userData.occupation || 'Chưa cập nhật',
      phone: userData.phone || '0900 000 000',
      targetBedtime: userData.targetBedtime || '23:00',
      wakeTime: userData.wakeTime || '06:30',
      fitnessLevel: userData.fitnessLevel || 'Trung bình',
      healthConditions: Array.isArray(userData.healthConditions) ? userData.healthConditions : ['Chưa có thông tin'],
      avatarType: userData.avatarType || 'programmer_laptop',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    inMemoryData.users.push(newUser);
    setCurrentUser(newId);

    if (idb) {
      try {
        const tx = idb.transaction(['users'], 'readwrite');
        tx.objectStore('users').put(newUser);
      } catch (e) {}
    }

    logServiceUsage(
      'AUTH_REGISTER',
      'Đăng ký hồ sơ tài khoản mới',
      `Tạo thành công hồ sơ cho ${newUser.fullName} trên thiết bị.`
    );

    window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: newUser }));
    syncWithCloudServer();
    return newUser;
  }

  // Lấy mã định danh phần cứng duy nhất (Virtual MAC / Hardware ID)
  function getDeviceFingerprint() {
    let devId = null;
    try {
      devId = localStorage.getItem('mavis_device_hwid');
      if (!devId) {
        // Sinh mã định danh vật lý ngẫu nhiên cố định chuẩn định dạng MAC (XX:XX:XX:XX)
        const hex = () => Math.floor((1 + Math.random()) * 0x100).toString(16).substring(1).toUpperCase();
        devId = `DEV-${hex()}:${hex()}:${hex()}:${hex()}`;
        localStorage.setItem('mavis_device_hwid', devId);
      }
    } catch (e) {
      devId = 'DEV-A1:B2:C3:D4';
    }
    return devId;
  }

  // Thu thập chi tiết môi trường thiết bị và trình duyệt của người dùng
  function getClientEnvironment() {
    const ua = navigator.userAgent || '';
    let browser = 'Trình duyệt Web';
    let os = 'Không xác định';
    let deviceType = 'Máy tính (PC/Laptop)';

    // Nhận diện Hệ điều hành (OS)
    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
    else if (/Android/i.test(ua)) {
      const match = ua.match(/Android\s([0-9\.]+)/i);
      os = match ? `Android ${match[1]}` : 'Android';
      deviceType = 'Điện thoại (Android)';
    } else if (/iPhone/i.test(ua)) {
      const match = ua.match(/OS\s([0-9_]+)/i);
      const ver = match ? match[1].replace(/_/g, '.') : '';
      os = `iOS ${ver}`;
      deviceType = 'Điện thoại (iPhone)';
    } else if (/iPad/i.test(ua)) {
      os = 'iPadOS';
      deviceType = 'Máy tính bảng (iPad)';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      os = 'macOS';
      deviceType = 'Máy tính (MacBook/iMac)';
    } else if (/Linux/i.test(ua)) {
      os = 'Linux';
    }

    // Nhận diện Trình duyệt
    if (/Edg\/([0-9\.]+)/i.test(ua)) {
      browser = `Edge ${ua.match(/Edg\/([0-9\.]+)/i)[1].split('.')[0]}`;
    } else if (/CocCoc\/([0-9\.]+)/i.test(ua)) {
      browser = `Cốc Cốc ${ua.match(/CocCoc\/([0-9\.]+)/i)[1].split('.')[0]}`;
    } else if (/SamsungBrowser\/([0-9\.]+)/i.test(ua)) {
      browser = `Samsung Internet ${ua.match(/SamsungBrowser\/([0-9\.]+)/i)[1].split('.')[0]}`;
    } else if (/Chrome\/([0-9\.]+)/i.test(ua)) {
      browser = `Chrome ${ua.match(/Chrome\/([0-9\.]+)/i)[1].split('.')[0]}`;
    } else if (/Firefox\/([0-9\.]+)/i.test(ua)) {
      browser = `Firefox ${ua.match(/Firefox\/([0-9\.]+)/i)[1].split('.')[0]}`;
    } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
      const match = ua.match(/Version\/([0-9\.]+)/i);
      browser = match ? `Safari ${match[1].split('.')[0]}` : 'Safari';
    }

    const isPWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const appMode = isPWA ? 'Mobile App (PWA)' : 'Web Browser';
    const mac = getDeviceFingerprint();

    return {
      mac,
      browser,
      os,
      deviceType,
      appMode,
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      formattedDevice: `${deviceType} • ${os} • ${browser}`
    };
  }

  // Log service usage
  function logServiceUsage(serviceType, title, detail, metadata = {}) {
    if (!inMemoryData) return;

    let icon = 'fa-solid fa-circle-check';
    let badgeColor = 'indigo';

    if (serviceType.includes('AUTH')) {
      icon = 'fa-solid fa-user-shield';
      badgeColor = 'emerald';
    } else if (serviceType.includes('DIAGNOSIS')) {
      icon = 'fa-solid fa-heart-pulse';
      badgeColor = 'indigo';
    } else if (serviceType.includes('SOUND')) {
      icon = 'fa-solid fa-headphones';
      badgeColor = 'cyan';
    } else if (serviceType.includes('CALENDAR')) {
      icon = 'fa-solid fa-calendar-check';
      badgeColor = 'amber';
    } else if (serviceType.includes('PROFILE')) {
      icon = 'fa-solid fa-id-card';
      badgeColor = 'purple';
    }

    const env = getClientEnvironment();
    const mergedMetadata = {
      ...env,
      ...metadata
    };

    const logEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      userId: inMemoryData.activeUserId,
      userName: getCurrentUser()?.fullName || 'Khách',
      serviceType,
      title,
      detail,
      device: env.formattedDevice,
      metadata: mergedMetadata,
      icon,
      badgeColor,
      timestamp: new Date().toISOString()
    };

    if (!Array.isArray(inMemoryData.serviceUsage)) {
      inMemoryData.serviceUsage = [];
    }

    inMemoryData.serviceUsage.unshift(logEntry);
    if (inMemoryData.serviceUsage.length > 50) {
      inMemoryData.serviceUsage.pop();
    }

    saveLocalStorageMirror(inMemoryData);

    if (idb) {
      try {
        const tx = idb.transaction(['service_usage'], 'readwrite');
        tx.objectStore('service_usage').add(logEntry);
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('sleepsync:usage-logged', { detail: logEntry }));
    if (serviceType.includes('GUARDRAIL') || serviceType.includes('AUTH')) {
      syncWithCloudServer();
    }
    return logEntry;
  }

  // Get service usage logs for a user
  function getServiceUsage(userId = null, limit = 20) {
    if (!inMemoryData || !inMemoryData.serviceUsage) return [];
    const targetUserId = userId || inMemoryData.activeUserId;
    const filtered = inMemoryData.serviceUsage.filter(entry => entry.userId === targetUserId);
    return filtered.slice(0, limit);
  }

  // Save diagnosis result
  function saveDiagnosis(diagnosisResult) {
    if (!inMemoryData) return;
    const currentUser = getCurrentUser();
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const diag = {
      id: Date.now(),
      userId: inMemoryData.activeUserId,
      userName: currentUser ? currentUser.fullName : 'Người dùng',
      score: diagnosisResult.predictedScore,
      pillars: diagnosisResult.pillars,
      summary: diagnosisResult.summary,
      answers: diagnosisResult.answers || (typeof AppState !== 'undefined' ? AppState.answers : null),
      customAnswers: diagnosisResult.customAnswers || (typeof AppState !== 'undefined' ? AppState.customAnswers : null),
      device: isMobile ? 'Mobile App (PWA)' : 'Web Browser',
      timestamp: new Date().toISOString()
    };

    if (!Array.isArray(inMemoryData.diagnoses)) {
      inMemoryData.diagnoses = [];
    }

    inMemoryData.diagnoses.unshift(diag);
    saveLocalStorageMirror(inMemoryData);

    logServiceUsage(
      'DIAGNOSIS_5PILLARS',
      'Hoàn thành chẩn đoán 5 trụ cột y khoa',
      `Điểm số giấc ngủ dự báo: ${diag.score}%. Lịch vi-hành động đã sẵn sàng.`
    );

    // Synchronize to cloud server immediately
    syncWithCloudServer();

    return diag;
  }

  // Export full JSON database backup
  function exportDatabaseBackup() {
    const jsonStr = JSON.stringify(inMemoryData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SleepSync_Database_Backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Restore from JSON
  function importDatabaseBackup(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        inMemoryData = parsed;
        saveLocalStorageMirror(inMemoryData);
        syncMemoryToIndexedDB();
        window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: getCurrentUser() }));
        return true;
      }
    } catch (e) {
      console.error('[SleepSyncDB] Import failed:', e);
    }
    return false;
  }

  // Reset to default seed
  function resetToDefaults() {
    inMemoryData = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA));
    try {
      localStorage.removeItem(STORAGE_KEY_DEVICE_USERS);
    } catch(e) {}
    saveLocalStorageMirror(inMemoryData);
    syncMemoryToIndexedDB();
    window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: getCurrentUser() }));
    return inMemoryData;
  }

  // Cloud Synchronizer between Web and Mobile App
  async function syncWithCloudServer() {
    try {
      const env = getClientEnvironment();
      const deviceUserIds = getDeviceUserIds();
      const payload = {
        users: getDeviceUsers(),
        userIds: deviceUserIds,
        serviceUsage: inMemoryData.serviceUsage || [],
        diagnoses: inMemoryData.diagnoses || [],
        clientInfo: env,
        deviceType: env.formattedDevice
      };

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const serverData = result.data;
          if (Array.isArray(serverData.users)) {
            // Strictly retain ONLY users authorized on THIS device
            const allowedIds = new Set(getDeviceUserIds());
            const filteredServerUsers = serverData.users.filter(u => allowedIds.has(u.id));
            inMemoryData.users = filteredServerUsers;

            if (inMemoryData.activeUserId && !allowedIds.has(inMemoryData.activeUserId)) {
              inMemoryData.activeUserId = filteredServerUsers.length > 0 ? filteredServerUsers[0].id : null;
              if (inMemoryData.activeUserId) {
                try { localStorage.setItem(STORAGE_KEY_ACTIVE_USER, inMemoryData.activeUserId); } catch(e) {}
              } else {
                try { localStorage.removeItem(STORAGE_KEY_ACTIVE_USER); } catch(e) {}
              }
            }
          }
          if (Array.isArray(serverData.serviceUsage)) {
            inMemoryData.serviceUsage = serverData.serviceUsage;
          }
          if (Array.isArray(serverData.diagnoses)) {
            inMemoryData.diagnoses = serverData.diagnoses;
          }
          saveLocalStorageMirror(inMemoryData);
          syncMemoryToIndexedDB();
          console.log('[SleepSyncDB] Cloud sync complete. Device users count:', inMemoryData.users.length);
          window.dispatchEvent(new CustomEvent('sleepsync:cloud-synced', { detail: result }));
          return true;
        }
      }
    } catch (err) {
      console.warn('[SleepSyncDB] Cloud sync skipped (offline or server unreachable):', err);
    }
    return false;
  }

  // Đồng bộ sự kiện xác thực phiên
  function broadcastRealtimeAuthEvent(action, user, log) {
    const payload = {
      type: action,
      user: user || null,
      log: log || null,
      timestamp: new Date().toISOString(),
      nonce: Math.random()
    };

    // 1. BroadcastChannel API (Đồng bộ đa tab)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('mavis_sync_event_channel');
        bc.postMessage(payload);
        setTimeout(() => bc.close(), 1000);
      }
    } catch (e) {
      console.warn('[SleepSyncDB] BroadcastChannel skipped:', e);
    }

    // 2. LocalStorage pulse (Đồng bộ đa cửa sổ)
    try {
      localStorage.setItem('mavis_sync_event_pulse', JSON.stringify(payload));
    } catch (e) {}

    // 3. Dispatch local event
    try {
      window.dispatchEvent(new CustomEvent('mavis:realtime-event', { detail: payload }));
    } catch (e) {}
  }

  // Login with Cloud Account (Synchronize account to this device)
  async function loginWithCloudAccount(phoneOrId, password = '') {
    if (!phoneOrId) return { success: false, message: 'Vui lòng nhập số điện thoại hoặc ID tài khoản' };

    const env = getClientEnvironment();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneOrId,
          password: password || undefined,
          clientInfo: env,
          device: env.formattedDevice
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        const user = data.user;
        addDeviceUserId(user.id);
        const existingIdx = inMemoryData.users.findIndex(u => u.id === user.id);
        if (existingIdx !== -1) {
          inMemoryData.users[existingIdx] = user;
        } else {
          inMemoryData.users.push(user);
        }

        inMemoryData.activeUserId = user.id;

        // If server returned user's diagnoses, merge them
        if (Array.isArray(data.diagnoses) && data.diagnoses.length > 0) {
          const currentDiagIds = new Set((inMemoryData.diagnoses || []).map(d => d.id));
          data.diagnoses.forEach(sd => {
            if (!currentDiagIds.has(sd.id)) {
              inMemoryData.diagnoses.unshift(sd);
            }
          });
        }

        saveLocalStorageMirror(inMemoryData);
        syncMemoryToIndexedDB();

        const authLog = data.log || logServiceUsage(
          'AUTH_LOGIN',
          'Đăng nhập đồng bộ tài khoản',
          `Tài khoản ${user.fullName} đã đăng nhập và đồng bộ thành công sang thiết bị này.`
        );

        // Cập nhật sự kiện phiên đăng nhập
        broadcastRealtimeAuthEvent('AUTH_LOGIN', user, authLog);

        window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: user }));
        syncWithCloudServer();
        return { success: true, user, log: authLog, message: data.message || 'Đăng nhập thành công!' };
      } else {
        return { success: false, message: data.message || 'Không tìm thấy tài khoản.' };
      }
    } catch (err) {
      console.warn('[SleepSyncDB] Login cloud fallback search locally:', err);
      const cleanInput = phoneOrId.replace(/\s+/g, '').toLowerCase();
      const localUser = inMemoryData.users.find(u => {
        const uId = (u.id || '').toLowerCase();
        const uUsername = (u.username || '').toLowerCase();
        const uPhone = (u.phone || '').replace(/\s+/g, '');
        const uEmail = (u.email || '').toLowerCase();
        const uName = (u.fullName || '').toLowerCase();
        return (
          uId === cleanInput ||
          uId.replace('user_', '') === cleanInput ||
          ('user_' + cleanInput) === uId ||
          uUsername === cleanInput ||
          uPhone === cleanInput ||
          uEmail === cleanInput ||
          uName === phoneOrId.toLowerCase()
        );
      });

      if (localUser) {
        if (!password || (localUser.password && localUser.password !== password)) {
          return { success: false, message: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại!' };
        }
        addDeviceUserId(localUser.id);
        setCurrentUser(localUser.id);
        const authLog = logServiceUsage('AUTH_LOGIN', 'Đăng nhập nội bộ', `Tài khoản ${localUser.fullName} đăng nhập.`);
        broadcastRealtimeAuthEvent('AUTH_LOGIN', localUser, authLog);
        return { success: true, user: localUser, log: authLog, message: 'Đăng nhập thành công!' };
      }
      return { success: false, message: 'Không tìm thấy tài khoản với thông tin đã nhập.' };
    }
  }

  // Register with Cloud Account
  async function registerWithCloudAccount(userData) {
    if (!userData.fullName || !userData.phone) {
      return { success: false, message: 'Vui lòng nhập họ tên và số điện thoại!' };
    }

    const env = getClientEnvironment();
    const payload = {
      ...userData,
      clientInfo: env,
      device: env.formattedDevice
    };

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.user) {
        const newUser = data.user;
        addDeviceUserId(newUser.id);
        const existingIdx = inMemoryData.users.findIndex(u => u.id === newUser.id);
        if (existingIdx !== -1) {
          inMemoryData.users[existingIdx] = newUser;
        } else {
          inMemoryData.users.push(newUser);
        }

        setCurrentUser(newUser.id);
        syncMemoryToIndexedDB();

        const authLog = data.log || logServiceUsage(
          'AUTH_REGISTER',
          'Đăng ký tài khoản thành viên mới',
          `Tài khoản ${newUser.fullName} (${newUser.phone}) đã được tạo thành công.`
        );

        // Cập nhật sự kiện phiên đăng ký
        broadcastRealtimeAuthEvent('AUTH_REGISTER', newUser, authLog);

        window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: newUser }));
        return { success: true, user: newUser, log: authLog, message: data.message || 'Đăng ký thành công!' };
      } else {
        return { success: false, message: data.message || 'Không thể tạo tài khoản.' };
      }
    } catch (err) {
      console.warn('[SleepSyncDB] Register cloud fallback to local creation:', err);
      const newUser = createUser(userData);
      const authLog = logServiceUsage('AUTH_REGISTER', 'Đăng ký nội bộ', `Tạo tài khoản ${newUser.fullName}`);
      broadcastRealtimeAuthEvent('AUTH_REGISTER', newUser, authLog);
      return { success: true, user: newUser, log: authLog, message: 'Tạo tài khoản cục bộ thành công (Máy chủ ngoại tuyến).' };
    }
  }

  // Logout Current User
  function logoutCurrentUser() {
    const currentUser = getCurrentUser();
    inMemoryData.activeUserId = null;
    try {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_USER);
      localStorage.setItem('sleepsync_explicit_logout', 'true');
    } catch(e) {}
    saveLocalStorageMirror(inMemoryData);

    if (idb) {
      try {
        const tx = idb.transaction(['meta'], 'readwrite');
        tx.objectStore('meta').put({ key: 'activeUserId', value: null });
      } catch (e) {}
    }
    
    const logoutLog = logServiceUsage(
      'AUTH_LOGOUT',
      'Đăng xuất tài khoản',
      `Người dùng ${currentUser?.fullName || 'Khách'} đã đăng xuất khỏi thiết bị.`
    );

    // Cập nhật sự kiện phiên đăng xuất
    broadcastRealtimeAuthEvent('AUTH_LOGOUT', currentUser, logoutLog);

    window.dispatchEvent(new CustomEvent('sleepsync:user-logged-out', { detail: currentUser }));
    window.dispatchEvent(new CustomEvent('sleepsync:user-changed', { detail: null }));
    return true;
  }

  // 1-Click Social Account Login (Google, Facebook, Apple)
  async function loginWithSocialAccount(provider = 'google') {
    const providerProfiles = {
      google: { name: 'Người Dùng Google', phone: 'google.account@gmail.com', avatar: 'sleep_owl', role: 'Thành viên Google Sync' },
      facebook: { name: 'Người Dùng Facebook', phone: 'fb.user@facebook.com', avatar: 'zen_meditator', role: 'Thành viên Facebook Connect' },
      apple: { name: 'Người Dùng Apple ID', phone: 'apple.id@icloud.com', avatar: 'nature_moon', role: 'Thành viên Apple ID' }
    };

    const p = providerProfiles[provider] || providerProfiles.google;
    const socialId = `user_${provider}_demo`;

    let user = inMemoryData.users.find(u => u.id === socialId || u.socialProvider === provider);
    if (!user) {
      user = {
        id: socialId,
        fullName: p.name,
        verified: true,
        role: p.role,
        bio: `Tài khoản kết nối qua ${provider.toUpperCase()} • Đồng bộ hóa nhịp sinh học tự động 🌙`,
        age: '29 tuổi',
        gender: 'Khác',
        occupation: p.role,
        phone: p.phone,
        password: '',
        targetBedtime: '23:00',
        wakeTime: '06:30',
        fitnessLevel: 'Khá',
        healthConditions: ['Đồng bộ thói quen sinh học'],
        avatarType: p.avatar,
        socialProvider: provider,
        streakDays: 3,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      inMemoryData.users.push(user);
    } else {
      user.lastLoginAt = new Date().toISOString();
    }

    addDeviceUserId(user.id);
    setCurrentUser(user.id);
    const authLog = logServiceUsage(
      'AUTH_LOGIN',
      `Đăng nhập ${provider.toUpperCase()}`,
      `Người dùng ${user.fullName} đã đăng nhập 1-chạm thành công qua ${provider.toUpperCase()}.`
    );
    broadcastRealtimeAuthEvent('AUTH_LOGIN', user, authLog);
    syncWithCloudServer();
    return { success: true, user, message: `Chào mừng ${user.fullName} đã kết nối thành công qua ${provider.toUpperCase()}!` };
  }

  return {
    init,
    getCurrentUser,
    getCurrentUserDiagnoses: () => {
      const user = isAuthenticated() ? getCurrentUser() : null;
      return user ? (inMemoryData.diagnoses || []).filter(record => record.userId === user.id)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))) : [];
    },
    isAuthenticated,
    getAllUsers,
    getDeviceUsers,
    getDeviceUserIds,
    addDeviceUserId,
    removeDeviceUserId,
    setCurrentUser,
    updateUserProfile,
    createUser,
    logServiceUsage,
    getServiceUsage,
    saveDiagnosis,
    exportDatabaseBackup,
    importDatabaseBackup,
    resetToDefaults,
    syncWithCloudServer,
    loginWithCloudAccount,
    registerWithCloudAccount,
    logoutCurrentUser,
    loginWithSocialAccount
  };
})();

// Auto initialize on load
if (typeof window !== 'undefined') {
  window.SleepSyncDB = SleepSyncDB;
}
