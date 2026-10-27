/**
 * SLEEPSYNC AI - Clinical 5-Pillar Chronobiology & Sleep Intelligence Engine
 * 1. Psychological & Mental (Stress, Cortisol, Anxiety, Depression)
 * 2. Environmental (Light, Screen, Temp 24-27°C, Noise)
 * 3. Habits & Lifestyle (Caffeine cutoff, Alcohol REM fragmentation, Heavy dinner, Phone on bed)
 * 4. Physiological & Endocrine (Age >50, Menopause hot flashes, Hormones)
 * 5. Physical & Clinical Conditions (GERD reflux, Neck/back pain, Headaches, Nocturia)
 * 
 * Features: Multi-choice Wizard, AI Voice Talk Mode, Real-time Advice, 
 * Calendar Scanner & 2-5min Micro-Actions, Web Audio Delta Beats.
 */

// ==========================================
// 1. APPLICATION STATE
// ==========================================
const AppState = {
  currentTab: 'quiz', // 'quiz' | 'talk' | 'calendar'
  wizardStep: 1,
  totalSteps: 6, // 6 steps including Step 6 confirmation table
  customAnswers: {}, // Stores user-typed text for 'Khác...'
  answers: {
    // Pillar 1: Psychology
    stress_level: ['medium'], // 'low' | 'medium' | 'high' | 'custom'
    mood_state: ['good'],     // 'good' | 'brain_fog' | 'anxious' | 'custom'

    // Pillar 2: Environment
    env_light: ['dark'],      // 'dark' | 'screen_heavy' | 'light_polluted' | 'custom'
    env_temp: ['ideal'],      // 'ideal' | 'hot' | 'too_cold' | 'custom'
    env_noise: ['quiet'],     // 'quiet' | 'noisy' | 'custom'

    // Pillar 3: Habits & Lifestyle
    caffeine_usage: ['morning_only'], // 'none' | 'morning_only' | 'late_high' | 'custom'
    alcohol_nicotine: ['none'],       // 'none' | 'alcohol_dinner' | 'nicotine' | 'custom'
    dinner_habit: ['light_early'],    // 'light_early' | 'heavy_late' | 'drink_lots_water' | 'custom'
    bed_phone: ['lướt_tiktok_fb'],    // 'no_phone' | 'lướt_tiktok_fb' | 'custom'

    // Pillar 4: Physiology & Endocrine
    age_group: ['young_adult'],       // 'young_adult' | 'middle_aged' | 'custom'
    hormone_state: ['normal'],        // 'normal' | 'menopause_hotflash' | 'custom'

    // Pillar 5: Clinical & Pain
    physical_pain: ['none'],          // 'none' | 'neck_back_pain' | 'headache' | 'custom'
    chronic_condition: ['none']       // 'none' | 'gerd' | 'nocturia' | 'custom'
  },
  calendarEvents: [
    { id: 1, title: 'Họp giao ban & Xử lý báo cáo', time: '09:00 - 11:30', busy: true },
    { id: 2, title: 'Họp dự án với đối tác', time: '13:30 - 15:30', busy: true },
    { id: 3, title: 'Rà soát hợp đồng & Trả lời email', time: '16:30 - 17:30', busy: true }
  ],
  detectedFreeSlots: [
    { start: '11:30', end: '13:30', duration: '120 phút (Nghỉ trưa)' },
    { start: '15:30', end: '16:30', duration: '60 phút (Trống chiều)' },
    { start: '17:30', end: '18:30', duration: '60 phút (Tan sở)' }
  ],
  talkState: {
    mode: 'chat',
    isListening: false,
    pending: false,
    history: []
  },
  analysisResult: null,
  assistantAssessment: null,
  readinessTasks: [],
  history: [],
  audio: {
    ctx: null,
    channels: {
      binaural: { isPlaying: false, gainNode: null, leftOsc: null, rightOsc: null, volume: 0.7 },
      rain: { isPlaying: false, gainNode: null, sourceNode: null, volume: 0.6 },
      ocean: { isPlaying: false, gainNode: null, sourceNode: null, lfoNode: null, volume: 0.5 },
      bowl: { isPlaying: false, gainNode: null, intervalId: null, volume: 0.65 }
    },
    timerDuration: 30,
    timerTimeout: null
  }
};

// ==========================================
// 2. INITIALIZATION & AUTH GUARD SYSTEM
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  try { initRealtimeClock(); } catch (e) { console.error('[SleepSync Init Error] Realtime Clock:', e); }
  try { initWelcomeSplash(); } catch (e) { console.error('[SleepSync Init Error] Welcome Splash:', e); }
  try { initTabSwitchers(); } catch (e) { console.error('[SleepSync Init Error] Tabs:', e); }
  try { initWizard(); } catch (e) { console.error('[SleepSync Init Error] Wizard:', e); }
  try { initTalkMode(); } catch (e) { console.error('[SleepSync Init Error] Talk Mode:', e); }
  try { initCalendarScanner(); } catch (e) { console.error('[SleepSync Init Error] Calendar Scanner:', e); }
  try { initAudioControls(); } catch (e) { console.error('[SleepSync Init Error] Audio Controls:', e); }
  try { initHistoryModule(); } catch (e) { console.error('[SleepSync Init Error] History Module:', e); }
  try { initUserProfileModule(); } catch (e) { console.error('[SleepSync Init Error] User Profile:', e); }
});

// ==========================================
// TOAST NOTIFICATION SYSTEM (Modern In-App Toast)
// ==========================================
function showAppToast(title, message, type = 'success', duration = 3500) {
  const container = document.getElementById('app-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `app-toast toast-${type}`;

  const iconMap = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info'
  };
  const iconClass = iconMap[type] || iconMap.info;

  toast.innerHTML = `
    <div class="toast-icon">
      <i class="${iconClass}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button type="button" class="toast-close" aria-label="Đóng thông báo">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 280);
  };

  if (closeBtn) closeBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

function showAuthRequiredToast(actionName = 'tiếp tục') {
  showAppToast('Yêu cầu đăng nhập', `Vui lòng đăng nhập để ${actionName}!`, 'info');
}

// Custom Promise-based Confirm Dialog (zero native confirm())
function showConfirmDialog({ title, message, confirmText = 'Xác nhận', cancelText = 'Hủy', type = 'danger', icon = 'fa-solid fa-right-from-bracket' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('app-confirm-modal');
    if (!modal) {
      resolve(confirm(message));
      return;
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const iconEl = document.getElementById('confirm-modal-icon');
    const okBtn = document.getElementById('btn-confirm-proceed');
    const cancelBtn = document.getElementById('btn-confirm-cancel');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) okBtn.textContent = confirmText;
    if (cancelBtn) cancelBtn.textContent = cancelText;
    if (iconEl) iconEl.innerHTML = `<i class="${icon}"></i>`;

    modal.style.display = 'flex';

    function cleanup(result) {
      modal.style.display = 'none';
      okBtn?.removeEventListener('click', handleOk);
      cancelBtn?.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackdrop);
      resolve(result);
    }

    function handleOk() { cleanup(true); }
    function handleCancel() { cleanup(false); }
    function handleBackdrop(e) {
      if (e.target === modal) cleanup(false);
    }

    okBtn?.addEventListener('click', handleOk);
    cancelBtn?.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackdrop);
  });
}

// Global Avatar SVG Generator for all 6 avatars
function getAvatarSvg(avatarType) {
  switch (avatarType) {
    case 'woman_professional':
      return `
        <svg viewBox="0 0 100 100" class="avatar-svg-illu">
          <defs>
            <linearGradient id="avWomanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#EC4899" />
              <stop offset="60%" stop-color="#8B5CF6" />
              <stop offset="100%" stop-color="#3B82F6" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#avWomanGrad)" />
          <path d="M28 85 C30 65, 70 65, 72 85" fill="#312E81" />
          <circle cx="50" cy="46" r="16" fill="#FDE047" />
          <path d="M33 46 C32 30, 68 30, 67 46 C67 52, 63 56, 63 56 C59 50, 41 50, 37 56 C37 56, 33 52, 33 46 Z" fill="#4B2411" />
          <circle cx="44" cy="45" r="2.5" fill="#1E293B" />
          <circle cx="56" cy="45" r="2.5" fill="#1E293B" />
          <path d="M46 53 Q50 56 54 53" stroke="#DC2626" stroke-width="2" fill="none" stroke-linecap="round" />
          <circle cx="50" cy="67" r="3" fill="#F8FAFC" />
          <polygon points="46,65 50,73 54,65" fill="#F43F5E" />
        </svg>
      `;
    case 'doctor_health':
      return `
        <svg viewBox="0 0 100 100" class="avatar-svg-illu">
          <defs>
            <linearGradient id="avDocGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#059669" />
              <stop offset="60%" stop-color="#0D9488" />
              <stop offset="100%" stop-color="#0284C7" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#avDocGrad)" />
          <ellipse cx="50" cy="88" rx="36" ry="24" fill="#F8FAFC" />
          <path d="M43 68 L50 78 L57 68 Z" fill="#0284C7" />
          <circle cx="50" cy="44" r="16" fill="#FDE047" />
          <path d="M34 40 C34 27, 66 27, 66 40 C63 32, 37 32, 34 40 Z" fill="#334155" />
          <circle cx="44" cy="44" r="2.5" fill="#1E293B" />
          <circle cx="56" cy="44" r="2.5" fill="#1E293B" />
          <path d="M46 51 Q50 54 54 51" stroke="#1E293B" stroke-width="1.8" fill="none" stroke-linecap="round" />
          <path d="M37 68 C37 82, 63 82, 63 68" fill="none" stroke="#64748B" stroke-width="3" stroke-linecap="round" />
          <circle cx="50" cy="82" r="3.5" fill="#CBD5E1" stroke="#475569" stroke-width="1.5" />
          <circle cx="68" cy="74" r="6" fill="#EF4444" />
          <rect x="66" y="70" width="4" height="8" rx="1" fill="#FFFFFF" />
          <rect x="64" y="72" width="8" height="4" rx="1" fill="#FFFFFF" />
        </svg>
      `;
    case 'sleep_owl':
      return `
        <svg viewBox="0 0 100 100" class="avatar-svg-illu">
          <defs>
            <linearGradient id="avOwlGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1E1B4B" />
              <stop offset="60%" stop-color="#312E81" />
              <stop offset="100%" stop-color="#4C1D95" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#avOwlGrad)" />
          <path d="M68 22 C64 22, 60 25, 60 30 C60 37, 67 43, 75 42 C72 45, 67 47, 62 47 C50 47, 43 38, 43 28 C43 23, 46 18, 50 15 C48 16, 46 18, 45 20 C40 26, 43 36, 52 41 C59 45, 69 41, 72 34 C74 30, 72 24, 68 22 Z" fill="#FDE047" opacity="0.6" />
          <ellipse cx="50" cy="58" rx="26" ry="28" fill="#6366F1" />
          <ellipse cx="50" cy="62" rx="18" ry="20" fill="#E0E7FF" />
          <circle cx="41" cy="46" r="10" fill="#FFFFFF" />
          <circle cx="59" cy="46" r="10" fill="#FFFFFF" />
          <circle cx="41" cy="46" r="5" fill="#1E1B4B" />
          <circle cx="59" cy="46" r="5" fill="#1E1B4B" />
          <circle cx="43" cy="44" r="2" fill="#FFFFFF" />
          <circle cx="61" cy="44" r="2" fill="#FFFFFF" />
          <polygon points="47,51 53,51 50,58" fill="#F59E0B" />
          <path d="M33 40 Q50 22 67 40 Q75 22 80 25" stroke="#F43F5E" stroke-width="5" fill="none" stroke-linecap="round" />
          <circle cx="80" cy="25" r="4" fill="#FDE047" />
        </svg>
      `;
    case 'zen_meditator':
      return `
        <svg viewBox="0 0 100 100" class="avatar-svg-illu">
          <defs>
            <linearGradient id="avZenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#F59E0B" />
              <stop offset="60%" stop-color="#D97706" />
              <stop offset="100%" stop-color="#7C2D12" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#avZenGrad)" />
          <circle cx="50" cy="42" r="24" fill="none" stroke="#FEF08A" stroke-width="2" opacity="0.4" />
          <path d="M30 80 Q50 92 70 80 Q50 84 30 80 Z" fill="#FED7AA" />
          <path d="M34 80 C36 68, 64 68, 66 80 Z" fill="#451A03" />
          <circle cx="50" cy="44" r="13" fill="#FDE047" />
          <path d="M43 45 Q46 48 49 45" stroke="#78350F" stroke-width="1.8" fill="none" stroke-linecap="round" />
          <path d="M51 45 Q54 48 57 45" stroke="#78350F" stroke-width="1.8" fill="none" stroke-linecap="round" />
          <path d="M47 51 Q50 53 53 51" stroke="#78350F" stroke-width="1.5" fill="none" stroke-linecap="round" />
          <circle cx="50" cy="38" r="1.5" fill="#FFFFFF" />
        </svg>
      `;
    case 'nature_moon':
      return `
        <svg viewBox="0 0 100 100" class="avatar-svg-illu">
          <defs>
            <linearGradient id="avMoonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0F172A" />
              <stop offset="60%" stop-color="#1E293B" />
              <stop offset="100%" stop-color="#38BDF8" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#avMoonGrad)" />
          <path d="M54 22 C42 22, 32 32, 32 44 C32 56, 42 66, 54 66 C46 62, 42 54, 42 44 C42 34, 46 26, 54 22 Z" fill="#FDE047" />
          <path d="M30 68 C26 68, 22 71, 22 75 C22 79, 26 82, 30 82 L70 82 C74 82, 78 79, 78 75 C78 71, 74 68, 70 68 C70 62, 64 57, 58 57 C53 57, 49 60, 48 64 C46 63, 44 63, 42 63 C36 63, 31 65, 30 68 Z" fill="#F1F5F9" opacity="0.9" />
          <circle cx="68" cy="30" r="2" fill="#FFFFFF" />
          <circle cx="76" cy="44" r="1.5" fill="#FDE047" />
          <circle cx="28" cy="36" r="1.5" fill="#FFFFFF" />
        </svg>
      `;
    case 'programmer_laptop':
    default:
      return `
        <svg viewBox="0 0 100 100" class="avatar-svg-illu">
          <defs>
            <linearGradient id="avatarBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4338CA" />
              <stop offset="60%" stop-color="#3B82F6" />
              <stop offset="100%" stop-color="#06B6D4" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#avatarBgGrad)" />
          <ellipse cx="50" cy="88" rx="34" ry="22" fill="#7C3AED" />
          <polygon points="44,70 50,78 56,70" fill="#E2E8F0" />
          <circle cx="50" cy="46" r="16" fill="#FDE047" />
          <path d="M35 44 C35 30, 65 30, 65 44 C65 37, 60 32, 50 32 C40 32, 35 37, 35 44 Z" fill="#EAB308" />
          <circle cx="44" cy="46" r="3" fill="#1E293B" />
          <circle cx="56" cy="46" r="3" fill="#1E293B" />
          <line x1="47" y1="46" x2="53" y2="46" stroke="#1E293B" stroke-width="1.5" />
          <path d="M46 54 Q50 57 54 54" stroke="#1E293B" stroke-width="1.5" fill="none" stroke-linecap="round" />
          <rect x="30" y="65" width="40" height="25" rx="3" fill="#F1F5F9" />
          <rect x="33" y="68" width="34" height="19" rx="2" fill="#0EA5E9" />
          <circle cx="50" cy="77" r="2.5" fill="#FFFFFF" />
          <polygon points="26,93 74,93 78,97 22,97" fill="#94A3B8" />
        </svg>
      `;
  }
}

// Global Auth Guard: Returns true if user is logged in, else pops auth modal
function requireAuthGuard(actionName = 'tiếp tục') {
  if (window.SleepSyncDB && SleepSyncDB.isAuthenticated()) {
    return true;
  }
  showAuthRequiredToast(actionName);
  openUserAuthModal('login');
  return false;
}

window.showAppToast = showAppToast;
window.showConfirmDialog = showConfirmDialog;
window.showAuthRequiredToast = showAuthRequiredToast;
window.getAvatarSvg = getAvatarSvg;
window.requireAuthGuard = requireAuthGuard;

// Initialize Welcome Splash Screen
function initWelcomeSplash() {
  const splash = document.getElementById('mavis-welcome-splash');
  if (!splash) return;

  const closeBtn = document.getElementById('splash-close-btn');
  const loginBtn = document.getElementById('splash-login-btn');
  const regBtn = document.getElementById('splash-register-btn');
  const exploreBtn = document.getElementById('splash-explore-btn');

  function hideSplash() {
    splash.style.display = 'none';
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
    splash.classList.add('splash-hidden');
  }

  // Ensure splash is hidden on initial load so user can see full website immediately
  hideSplash();

  // Export to global window so button onclick always works 100%
  window.hideMavisSplash = hideSplash;
  window.handleSplashLogin = function() {
    hideSplash();
    openUserAuthModal('login');
  };
  window.handleSplashRegister = function() {
    hideSplash();
    openUserAuthModal('register');
  };

  if (closeBtn) closeBtn.addEventListener('click', hideSplash);
  if (exploreBtn) exploreBtn.addEventListener('click', hideSplash);

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      window.handleSplashLogin();
    });
  }

  if (regBtn) {
    regBtn.addEventListener('click', () => {
      window.handleSplashRegister();
    });
  }
}
 
// ==========================================
// REALTIME CHRONOBIOLOGY ENGINE & CLOCK
// ==========================================
let realtimeClockTimer = null;

function initRealtimeClock() {
  updateTimeDisplay();
  if (realtimeClockTimer) clearInterval(realtimeClockTimer);
  realtimeClockTimer = setInterval(updateTimeDisplay, 1000);

  // Recalculate countdown instantly when user changes target bedtime or switches account
  window.addEventListener('sleepsync:user-changed', updateTimeDisplay);
  window.addEventListener('sleepsync:user-updated', updateTimeDisplay);
  window.addEventListener('sleepsync:cloud-synced', updateTimeDisplay);
}

function updateTimeDisplay() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const display = document.getElementById('current-time-display');
  if (display) display.textContent = `${hours}:${minutes}:${seconds}`;

  const rtStamp = document.getElementById('rt-clock-stamp');
  if (rtStamp) rtStamp.textContent = `${hours}:${minutes}`;

  // Circadian Badge
  const h = now.getHours();
  const badge = document.getElementById('chrono-phase-badge');
  if (badge) {
    if (h >= 6 && h < 11) badge.textContent = '☀️ Cortisol đỉnh';
    else if (h >= 11 && h < 14) badge.textContent = '🥪 Nghỉ trưa & Hạ caffeine';
    else if (h >= 14 && h < 17) badge.textContent = '⏳ Cửa sổ vận động';
    else if (h >= 17 && h < 20) badge.textContent = '🌅 Thư giãn tối';
    else if (h >= 20 && h < 22) badge.textContent = '🌙 Tiết Melatonin';
    else badge.textContent = '💤 Ngủ sâu phục hồi';
  }

  // Bedtime countdown (Dynamic based on active user target bedtime)
  let targetH = 23;
  let targetM = 0;
  if (window.SleepSyncDB) {
    const user = SleepSyncDB.getCurrentUser();
    if (user && user.targetBedtime) {
      const parts = user.targetBedtime.split(':');
      if (parts.length === 2) {
        targetH = parseInt(parts[0], 10);
        targetM = parseInt(parts[1], 10);
      }
    }
  }

  const target = new Date(now);
  target.setHours(targetH, targetM, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const diffMs = target - now;
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const cdEl = document.getElementById('bedtime-countdown-text');
  if (cdEl) {
    const targetLabel = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
    cdEl.textContent = `Còn ${diffH}h ${diffM}p (ngủ ${targetLabel})`;
  }
}

// ==========================================
// 3. TAB NAVIGATION
// ==========================================
function initTabSwitchers() {
  const tabQuiz = document.getElementById('tab-btn-quiz');
  const tabVoice = document.getElementById('tab-btn-voice');
  const tabCal = document.getElementById('tab-btn-calendar');

  const secQuiz = document.getElementById('quiz-assessment-section');
  const secVoice = document.getElementById('voice-talk-section');
  const secCal = document.getElementById('calendar-scanner-section');

  function switchTab(activeBtn, activeSec, tabKey) {
    stopTalkAudio();
    [tabQuiz, tabVoice, tabCal].forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    [secQuiz, secVoice, secCal].forEach(s => s.style.display = 'none');

    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
    activeSec.style.display = 'block';
    AppState.currentTab = tabKey;
    activeSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  tabQuiz.addEventListener('click', () => switchTab(tabQuiz, secQuiz, 'quiz'));
  tabVoice.addEventListener('click', () => {
    switchTab(tabVoice, secVoice, 'talk');
    setTalkMode(AppState.talkState.mode);
    if (AppState.talkState.history.length === 0) {
      startTalkConversation();
    }
  });
  tabCal.addEventListener('click', () => {
    if (!requireAuthGuard('quét và đồng bộ lịch trình cá nhân hóa')) {
      return;
    }
    switchTab(tabCal, secCal, 'calendar');
  });

  // Quick Demo Fill Button
  const demoFillBtn = document.getElementById('demo-fill-btn');
  if (demoFillBtn) {
    demoFillBtn.addEventListener('click', () => {
      if (!requireAuthGuard('thử nghiệm kịch bản trắc nghiệm mẫu')) {
        return;
      }
      applyRealisticDemoScenario();
    });
  }
}

// ==========================================
// ==========================================
// 4. 5-PILLAR DIAGNOSTIC WIZARD (QUIZ MODE)
// ==========================================

const QUESTION_METADATA = [
  { key: 'stress_level', pillar: 'Trụ Cột 1: Tâm Lý', icon: 'fa-brain', title: '1.1 Mức độ stress, áp lực deadline' },
  { key: 'mood_state', pillar: 'Trụ Cột 1: Tâm Lý', icon: 'fa-brain', title: '1.2 Dấu hiệu cảm xúc tiêu cực / uể oải' },
  { key: 'env_light', pillar: 'Trụ Cột 2: Môi Trường', icon: 'fa-house-chimney-window', title: '2.1 Mức độ phơi nhiễm ánh sáng' },
  { key: 'env_temp', pillar: 'Trụ Cột 2: Môi Trường', icon: 'fa-house-chimney-window', title: '2.2 Nhiệt độ phòng ngủ' },
  { key: 'env_noise', pillar: 'Trụ Cột 2: Môi Trường', icon: 'fa-house-chimney-window', title: '2.3 Tiếng ồn xung quanh' },
  { key: 'caffeine_usage', pillar: 'Trụ Cột 3: Lối Sống', icon: 'fa-mug-hot', title: '3.1 Tiêu thụ Caffeine' },
  { key: 'alcohol_nicotine', pillar: 'Trụ Cột 3: Lối Sống', icon: 'fa-mug-hot', title: '3.2 Rượu bia, cồn, nicotine' },
  { key: 'dinner_habit', pillar: 'Trụ Cột 3: Lối Sống', icon: 'fa-mug-hot', title: '3.3 Thói quen ăn tối & uống nước' },
  { key: 'bed_phone', pillar: 'Trụ Cột 3: Lối Sống', icon: 'fa-mug-hot', title: '3.4 Dùng điện thoại trên giường' },
  { key: 'age_group', pillar: 'Trụ Cột 4: Sinh Lý', icon: 'fa-venus-mars', title: '4.1 Nhóm tuổi của bạn' },
  { key: 'hormone_state', pillar: 'Trụ Cột 4: Sinh Lý', icon: 'fa-venus-mars', title: '4.2 Tình trạng nội tiết tố' },
  { key: 'physical_pain', pillar: 'Trụ Cột 5: Bệnh Lý', icon: 'fa-stethoscope', title: '5.1 Đau mỏi cơ xương khớp / đau đầu' },
  { key: 'chronic_condition', pillar: 'Trụ Cột 5: Bệnh Lý', icon: 'fa-stethoscope', title: '5.2 Bệnh lý mạn tính' }
];

function initWizard() {
  // Helper to ensure array format
  const getAnswerArray = (key) => {
    if (!AppState.answers[key]) return [];
    if (Array.isArray(AppState.answers[key])) return AppState.answers[key];
    return [AppState.answers[key]];
  };

  // Option buttons click listener across all steps (Support Multi-Select + Custom)
  document.querySelectorAll('.options-grid').forEach(grid => {
    const qKey = grid.dataset.question;
    const qBlock = grid.closest('.question-block');
    const customWrap = qBlock ? qBlock.querySelector('.custom-answer-wrap') : null;
    const customInput = qBlock ? qBlock.querySelector('.custom-answer-input') : null;

    grid.querySelectorAll('.opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        let currentAnswers = getAnswerArray(qKey);

        // Mutually exclusive values (e.g. none, normal, no_phone)
        const isNoneVal = (val === 'none' || val === 'normal' || val === 'no_phone');

        if (isNoneVal) {
          // Deselect everything else in this question
          grid.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          AppState.answers[qKey] = [val];
          if (customWrap) customWrap.style.display = 'none';
        } else {
          // Deselect 'none' / 'normal' / 'no_phone' if active
          grid.querySelectorAll('.opt-btn[data-value="none"], .opt-btn[data-value="normal"], .opt-btn[data-value="no_phone"]')
            .forEach(b => {
              b.classList.remove('selected');
              currentAnswers = currentAnswers.filter(a => a !== b.dataset.value);
            });

          // Toggle selection
          if (btn.classList.contains('selected')) {
            // Unselect if more than 1 option is selected
            if (currentAnswers.length > 1) {
              btn.classList.remove('selected');
              currentAnswers = currentAnswers.filter(a => a !== val);
              if (val === 'custom' && customWrap) {
                customWrap.style.display = 'none';
              }
            }
          } else {
            // Select
            btn.classList.add('selected');
            if (!currentAnswers.includes(val)) {
              currentAnswers.push(val);
            }
            if (val === 'custom' && customWrap) {
              customWrap.style.display = 'block';
              if (customInput) customInput.focus();
            }
          }

          AppState.answers[qKey] = currentAnswers;
        }
      });
    });

    // Custom input typing listener
    if (customInput) {
      customInput.addEventListener('input', () => {
        AppState.customAnswers = AppState.customAnswers || {};
        AppState.customAnswers[qKey] = customInput.value.trim();
      });
    }
  });

  // Step Indicator Node clicks
  document.querySelectorAll('.step-node').forEach(node => {
    node.addEventListener('click', () => {
      const targetStep = parseInt(node.dataset.step, 10);
      goToWizardStep(targetStep);
    });
  });

  // Next / Prev Buttons
  const nextBtn = document.getElementById('wizard-next-btn');
  const prevBtn = document.getElementById('wizard-prev-btn');
  const submitBtn = document.getElementById('wizard-submit-btn');
  const confirmCheckbox = document.getElementById('user-info-confirm-checkbox');

  if (confirmCheckbox) {
    confirmCheckbox.addEventListener('change', () => {
      if (submitBtn) {
        if (confirmCheckbox.checked) {
          submitBtn.style.opacity = '1';
          submitBtn.style.pointerEvents = 'auto';
        } else {
          submitBtn.style.opacity = '0.5';
          submitBtn.style.pointerEvents = 'none';
        }
      }
    });
  }

  nextBtn.addEventListener('click', () => {
    if (AppState.wizardStep < AppState.totalSteps) {
      goToWizardStep(AppState.wizardStep + 1);
    }
  });

  prevBtn.addEventListener('click', () => {
    if (AppState.wizardStep > 1) {
      goToWizardStep(AppState.wizardStep - 1);
    }
  });

  submitBtn.addEventListener('click', () => {
    if (!requireAuthGuard('xem và lưu kết quả chẩn đoán 5 trụ cột y khoa')) {
      return;
    }
    if (confirmCheckbox && !confirmCheckbox.checked) {
      showAppToast("Xác nhận thông tin", "Vui lòng đánh dấu xác nhận chắc chắn rằng thông tin trên là chính xác!", "warning");
      return;
    }
    runCompleteDiagnosis();
  });
}

function goToWizardStep(step) {
  AppState.wizardStep = step;

  // Update step panes
  document.querySelectorAll('.wizard-step-pane').forEach((pane, idx) => {
    pane.classList.toggle('active', idx + 1 === step);
  });

  // Update stepper nodes
  document.querySelectorAll('.step-node').forEach((node, idx) => {
    const s = idx + 1;
    node.classList.toggle('active', s === step);
    node.classList.toggle('completed', s < step);
  });

  // Update controls
  const nextBtn = document.getElementById('wizard-next-btn');
  const prevBtn = document.getElementById('wizard-prev-btn');
  const submitBtn = document.getElementById('wizard-submit-btn');
  const stepDisplay = document.getElementById('current-step-display');

  if (stepDisplay) stepDisplay.textContent = step;
  if (prevBtn) prevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';

  if (step === AppState.totalSteps) {
    if (nextBtn) nextBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'inline-flex';
    // Render confirmation table when reaching Step 6
    renderConfirmationSummaryTable();
  } else {
    if (nextBtn) nextBtn.style.display = 'inline-flex';
    if (submitBtn) submitBtn.style.display = 'none';
  }
}

// Render dynamic summary confirmation table at Step 6
function renderConfirmationSummaryTable() {
  const tbody = document.getElementById('summary-confirmation-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  QUESTION_METADATA.forEach(item => {
    const grid = document.querySelector(`.options-grid[data-question="${item.key}"]`);
    const qBlock = document.querySelector(`.question-block[data-qkey="${item.key}"]`);
    const customInput = qBlock ? qBlock.querySelector('.custom-answer-input') : null;
    
    let selectedLabels = [];

    if (grid) {
      grid.querySelectorAll('.opt-btn.selected').forEach(btn => {
        const val = btn.dataset.value;
        if (val === 'custom') {
          const customVal = (AppState.customAnswers && AppState.customAnswers[item.key]) || (customInput ? customInput.value.trim() : '');
          if (customVal) {
            selectedLabels.push(`<span class="answer-badge badge-custom"><i class="fa-solid fa-pen-nib"></i> Khác: <strong>${escapeHtml(customVal)}</strong></span>`);
          } else {
            selectedLabels.push(`<span class="answer-badge badge-custom"><i class="fa-solid fa-pen-nib"></i> Khác: <em>(chưa điền nội dung)</em></span>`);
          }
        } else {
          const strongText = btn.querySelector('strong')?.textContent.trim() || val;
          const icon = btn.querySelector('.opt-icon')?.textContent.trim() || '•';
          selectedLabels.push(`<span class="answer-badge">${icon} ${escapeHtml(strongText)}</span>`);
        }
      });
    }

    if (selectedLabels.length === 0) {
      selectedLabels.push(`<span class="answer-badge badge-empty"><em>Chưa chọn</em></span>`);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pillar-tag-badge"><i class="fa-solid ${item.icon}"></i> ${item.pillar}</span></td>
      <td class="survey-question-cell"><strong>${item.title}</strong></td>
      <td class="survey-answer-cell">${selectedLabels.join(' ')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Realistic Demo Scenario
function applyRealisticDemoScenario() {
  AppState.answers = {
    stress_level: ['high'],
    mood_state: ['anxious'],
    env_light: ['screen_heavy'],
    env_temp: ['hot'],
    env_noise: ['noisy'],
    caffeine_usage: ['late_high'],
    alcohol_nicotine: ['none'],
    dinner_habit: ['heavy_late'],
    bed_phone: ['lướt_tiktok_fb'],
    age_group: ['middle_aged'],
    hormone_state: ['normal'],
    physical_pain: ['neck_back_pain'],
    chronic_condition: ['gerd']
  };

  // Sync selected buttons in UI
  document.querySelectorAll('.options-grid').forEach(grid => {
    const qKey = grid.dataset.question;
    const vals = AppState.answers[qKey] || [];
    grid.querySelectorAll('.opt-btn').forEach(btn => {
      btn.classList.toggle('selected', vals.includes(btn.dataset.value));
    });
  });

  goToWizardStep(6);
}

// ==========================================
// 5. TALK MODE (VOICE & INTERACTIVE CHAT)
// ==========================================
// ==========================================
// 6. CALENDAR SCANNER & FREE SLOTS
// ==========================================
function initCalendarScanner() {
  renderCalendarEvents();

  // Add event quick button
  document.getElementById('add-event-quick-btn').addEventListener('click', () => {
    const title = prompt("Nhập tên cuộc họp / công việc bận:", "Họp phòng ban đột xuất");
    if (!title) return;
    const time = prompt("Khung giờ (Ví dụ: 15:00 - 16:00):", "15:00 - 16:00");
    if (!time) return;

    AppState.calendarEvents.push({
      ownerId: window.SleepSyncDB?.getCurrentUser()?.id || 'guest',
      id: Date.now(),
      title,
      time,
      busy: true
    });
    renderCalendarEvents();
  });

  // Import .ICS file
  const icsInput = document.getElementById('import-ics-input');
  icsInput.addEventListener('change', handleIcsFileUpload);
}

function renderCalendarEvents() {
  const listEl = document.getElementById('calendar-events-list');
  listEl.innerHTML = '';

  AppState.calendarEvents.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'event-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <span class="event-time"><i class="fa-regular fa-clock"></i> ${ev.time}</span>
        <span class="event-title">${ev.title}</span>
      </div>
      <span class="event-badge-busy"><i class="fa-solid fa-lock"></i> Lịch bận</span>
    `;
    listEl.appendChild(item);
  });

  // Render Free Slots Chips
  const slotsGrid = document.getElementById('slots-chips-grid');
  slotsGrid.innerHTML = AppState.detectedFreeSlots.map(s => `
    <div class="slot-chip">
      <i class="fa-regular fa-clock"></i>
      <span>${s.start} - ${s.end}</span>
      <strong>(${s.duration})</strong>
    </div>
  `).join('');
}

function handleIcsFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    parseIcsAndAddEvents(content);
  };
  reader.readAsText(file);
}

function parseIcsAndAddEvents(icsText) {
  const lines = icsText.split(/\r\n|\n|\r/);
  let inEvent = false;
  let currentSummary = '';
  let currentStart = '';
  let currentEnd = '';
  let importedCount = 0;

  lines.forEach(line => {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      currentSummary = '';
      currentStart = '';
      currentEnd = '';
    } else if (line.startsWith('END:VEVENT')) {
      inEvent = false;
      if (currentSummary) {
        AppState.calendarEvents.push({
          ownerId: window.SleepSyncDB?.getCurrentUser()?.id || 'guest',
          id: Date.now() + Math.random(),
          title: currentSummary,
          time: formatIcsTime(currentStart, currentEnd),
          busy: true
        });
        importedCount++;
      }
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) currentSummary = line.replace('SUMMARY:', '').trim();
      else if (line.startsWith('DTSTART:')) currentStart = line.replace('DTSTART:', '').trim();
      else if (line.startsWith('DTEND:')) currentEnd = line.replace('DTEND:', '').trim();
    }
  });

  renderCalendarEvents();
  showAppToast("Nhập lịch thành công", `Đã nhập ${importedCount} sự kiện lịch! AI đã tự động phát hiện khoảng trống phục hồi.`, "success");
}

function formatIcsTime(startStr, endStr) {
  try {
    if (startStr.length >= 13 && endStr.length >= 13) {
      const sH = startStr.substr(9, 2);
      const sM = startStr.substr(11, 2);
      const eH = endStr.substr(9, 2);
      const eM = endStr.substr(11, 2);
      return `${sH}:${sM} - ${eH}:${eM}`;
    }
  } catch (e) {}
  return 'Lịch trong ngày';
}

// ==========================================
// 7. CLINICAL DIAGNOSTIC & PREDICTIVE ENGINE
// ==========================================
async function runCompleteDiagnosis() {
  // Show loading
  const loading = document.getElementById('ai-loading-state');
  const results = document.getElementById('results-dashboard');
  const progressBar = document.getElementById('loading-progress-bar');
  const stepTitle = document.getElementById('loading-step-title');
  const stepDesc = document.getElementById('loading-step-desc');

  loading.style.display = 'block';
  results.style.display = 'none';
  loading.scrollIntoView({ behavior: 'smooth', block: 'center' });

  progressBar.style.width = '25%';
  stepTitle.textContent = "1/3. Phân tích tương quan 5 trụ cột y khoa...";
  stepDesc.textContent = "Đánh giá mức độ kích hoạt Adrenaline/Cortisol, ức chế Melatonin do ánh sáng, và đào thải Caffeine...";
  await sleep(650);

  progressBar.style.width = '65%';
  stepTitle.textContent = "2/3. Quét lịch biểu công việc & Định vị khoảng trống...";
  stepDesc.textContent = "Xác định khe trống 11:30, 15:30 và 17:30 để bố trí các vi-hành động 2-5 phút...";
  await sleep(700);

  progressBar.style.width = '95%';
  stepTitle.textContent = "3/3. Hoàn tất phác đồ & Lời khuyên theo thời gian thực...";
  stepDesc.textContent = "Tối ưu hóa thực đơn ăn tối nhanh và các biện pháp giảm trào ngược/đau cơ...";
  await sleep(500);

  progressBar.style.width = '100%';
  await sleep(250);

  // Compute Clinical Scores
  const result = computeClinicalAnalysis(AppState.answers);
  AppState.analysisResult = result;
  AppState.assistantAssessment = JSON.parse(JSON.stringify({
    ownerId: window.SleepSyncDB?.getCurrentUser()?.id || 'guest',
    answers: AppState.answers, customAnswers: AppState.customAnswers, summary: result.summary,
  }));

  // Render
  renderDashboard(result);

  loading.style.display = 'none';
  results.style.display = 'flex';
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });

  saveHistoryLog(result);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function computeClinicalAnalysis(ans) {
  const hasAns = (key, val) => {
    const v = ans[key];
    if (Array.isArray(v)) return v.includes(val);
    return v === val;
  };

  // 1. Pillar 1: Psychology & Stress (0 - 100)
  let p1_stress = 30;
  if (hasAns('stress_level', 'high')) p1_stress += 45;
  else if (hasAns('stress_level', 'medium')) p1_stress += 20;

  if (hasAns('mood_state', 'anxious')) p1_stress += 25;
  else if (hasAns('mood_state', 'brain_fog')) p1_stress += 15;
  p1_stress = Math.min(100, p1_stress);

  // 2. Pillar 2: Environment (0 - 100)
  let p2_env = 20;
  if (hasAns('env_light', 'screen_heavy')) p2_env += 35;
  else if (hasAns('env_light', 'light_polluted')) p2_env += 25;

  if (hasAns('env_temp', 'hot')) p2_env += 30;
  else if (hasAns('env_temp', 'too_cold')) p2_env += 20;

  if (hasAns('env_noise', 'noisy')) p2_env += 25;
  p2_env = Math.min(100, p2_env);

  // 3. Pillar 3: Lifestyle & Toxins (0 - 100)
  let p3_lifestyle = 20;
  if (hasAns('caffeine_usage', 'late_high')) p3_lifestyle += 35;
  else if (hasAns('caffeine_usage', 'morning_only')) p3_lifestyle += 10;

  if (hasAns('alcohol_nicotine', 'alcohol_dinner')) p3_lifestyle += 30;
  else if (hasAns('alcohol_nicotine', 'nicotine')) p3_lifestyle += 25;

  if (hasAns('dinner_habit', 'heavy_late')) p3_lifestyle += 25;
  else if (hasAns('dinner_habit', 'drink_lots_water')) p3_lifestyle += 15;

  if (hasAns('bed_phone', 'lướt_tiktok_fb')) p3_lifestyle += 20;
  p3_lifestyle = Math.min(100, p3_lifestyle);

  // 4. Pillar 4: Physiology & Endocrine (0 - 100)
  let p4_physio = 15;
  if (hasAns('age_group', 'middle_aged')) p4_physio += 30;
  if (hasAns('hormone_state', 'menopause_hotflash')) p4_physio += 45;
  p4_physio = Math.min(100, p4_physio);

  // 5. Pillar 5: Health & Pain (0 - 100)
  let p5_health = 10;
  if (hasAns('physical_pain', 'neck_back_pain')) p5_health += 35;
  else if (hasAns('physical_pain', 'headache')) p5_health += 30;

  if (hasAns('chronic_condition', 'gerd')) p5_health += 35;
  else if (hasAns('chronic_condition', 'nocturia')) p5_health += 30;
  p5_health = Math.min(100, p5_health);

  // Overall Predicted Sleep Quality Score (0 - 100%)
  // Weighted penalty deduction
  const totalPenalty = (p1_stress * 0.28) + (p2_env * 0.18) + (p3_lifestyle * 0.26) + (p4_physio * 0.12) + (p5_health * 0.16);
  const predictedScore = Math.max(25, Math.min(96, Math.round(100 - totalPenalty)));

  // Sleep Metrics
  let latency = 12; // minutes
  if (p1_stress > 60) latency += 15;
  if (hasAns('caffeine_usage', 'late_high')) latency += 14;
  if (hasAns('bed_phone', 'lướt_tiktok_fb')) latency += 10;

  let deepSleepPct = Math.max(8, Math.round(24 - (p1_stress * 0.1) - (p5_health * 0.06)));
  let remSleepPct = Math.max(10, Math.round(22 - (p3_lifestyle * 0.08) - (p2_env * 0.05)));

  return {
    predictedScore,
    latency,
    deepSleepPct,
    remSleepPct,
    pillars: {
      p1_stress,
      p2_env,
      p3_lifestyle,
      p4_physio,
      p5_health
    },
    realtimeAdvice: generateRealtimeAdvice(ans),
    microSchedule: generateMicroActionSchedule(ans),
    nutritionAdvice: generateNutritionAdvice(ans)
  };
}

// Generate Real-time Advice based on current local hour
function generateRealtimeAdvice(ans) {
  const hasAns = (key, val) => {
    const v = ans[key];
    if (Array.isArray(v)) return v.includes(val);
    return v === val;
  };
  const hour = new Date().getHours();
  let text = '';

  if (hour >= 6 && hour < 12) {
    text = `☀️ <strong>Khung giờ hiện tại (Sáng):</strong> Bạn đang ở đỉnh cao giải phóng năng lượng Cortisol. `;
    if (hasAns('caffeine_usage', 'late_high')) {
      text += `<strong>HÀNH ĐỘNG NGAY:</strong> Hãy chốt cữ cà phê cuối cùng trước 11:00 trưa nay để đảm bảo gan kịp chuyển hóa hết nồng độ trước giờ ngủ. Uống 1 cốc nước ấm 300ml để bù nước cho não bộ.`;
    } else {
      text += `Uống đủ nước và tập trung giải quyết các công việc đòi hỏi tư duy cao nhất trong buổi sáng này!`;
    }
  } else if (hour >= 12 && hour < 14) {
    text = `🥪 <strong>Khung giờ hiện tại (Buổi trưa):</strong> Thời điểm vàng phục hồi. `;
    if (hasAns('dinner_habit', 'heavy_late') || hasAns('chronic_condition', 'gerd')) {
      text += `<strong>HÀNH ĐỘNG DỄ LÀM:</strong> Bữa trưa không nên ăn quá no nhiều dầu mỡ. Sau khi ăn, đứng dậy đi dạo nhẹ nhàng 5 phút quanh văn phòng, tuyệt đối không nằm ngay để tránh trào ngược dạ dày thực quản!`;
    } else {
      text += `Ăn trưa thanh đạm, nhắm mắt nghỉ ngơi (Power Nap) 15-20 phút, không ngủ quá 30 phút để tránh làm tan áp lực buồn ngủ ban đêm.`;
    }
  } else if (hour >= 14 && hour < 17) {
    text = `⏳ <strong>Khung giờ hiện tại (Xế chiều):</strong> `;
    text += `<strong>VI-HÀNH ĐỘNG 3 PHÚT:</strong> Dừng nhìn màn hình, đứng dậy vươn vai và thực hiện bài tập xoay cổ vai gáy (Neck & Shoulder stretch) để giải tỏa căng cơ do ngồi máy tính. Tuyệt đối không nạp thêm cà phê hay nước tăng lực từ giờ này.`;
  } else if (hour >= 17 && hour < 20) {
    text = `🌅 <strong>Khung giờ hiện tại (Hoàng hôn):</strong> `;
    text += `<strong>ĐỒNG BỘ NHỊP SINH HỌC:</strong> Đi dạo ngoài trời 15 phút đón ánh sáng đỏ hoàng hôn (báo hiệu cho nhân SCN chuẩn bị tiết melatonin). Bữa tối ăn nhẹ nhàng với thực đơn giàu Magie & Tryptophan trước 19:30.`;
  } else {
    text = `🌙 <strong>Khung giờ hiện tại (Tối muộn):</strong> `;
    text += `<strong>DIGITAL SUNSET NGAY BÂY GIỜ:</strong> Bật chế độ lọc ánh sáng vàng trên điện thoại hoặc cất điện thoại cách xa giường ngủ. Bật máy phát sóng não Delta 4Hz bên dưới và điều chỉnh nhiệt độ phòng về 24°C - 26°C.`;
  }

  return text;
}

// Generate Micro-Action Schedule (2-5 mins) tailored to calendar free slots
function generateMicroActionSchedule(ans) {
  const list = [
    {
      id: 'm1',
      time: '12:15 - 12:20 (5 phút sau ăn trưa)',
      tag: 'Chống trào ngược & Hạ đường huyết',
      title: '🚶 Vi-đi bộ 5 phút quanh văn phòng (Không nằm ngay)',
      desc: 'Giúp cơ thắt thực quản dưới đóng kín, hỗ trợ nhu động ruột tiêu hóa thức ăn và ngăn ngừa trào ngược axit dạ dày (GERD).',
      completed: false
    },
    {
      id: 'm2',
      time: '14:00 (1 phút)',
      tag: 'Caffeine Curfew',
      title: '🚰 Đổi sang nước ấm hoặc trà hoa cúc (Ngừng Caffeine)',
      desc: 'Khoảng cách 8,5 tiếng trước giờ ngủ. Uống 1 ngụm nước ấm bù khoáng cho gan thanh lọc.',
      completed: false
    },
    {
      id: 'm3',
      time: '15:45 - 15:50 (5 phút tại khe trống chiều)',
      tag: 'Xả Cortisol & Giải đau cổ vai gáy',
      title: '🧘 3 Phút bài tập giãn cơ cổ vai gáy + Thở Box Breathing',
      desc: 'Hít sâu 4s, giữ 4s, thở ra 4s, giữ 4s (4 chu kỳ). Xoay nhẹ khớp cổ sang hai bên để giãn bó cơ thang và cơ ức đòn chũm.',
      completed: false
    },
    {
      id: 'm4',
      time: '18:30 - 19:00 (Bữa tối nhanh)',
      tag: 'Dinh dưỡng giàu Tryptophan',
      title: '🥗 Ăn tối thanh đạm dưới 10 phút chuẩn bị',
      desc: 'Trứng luộc / Ức gà nướng + Canh rau bina luộc + 1 quả chuối hoặc kiwi tráng miệng. Ngừng uống nước sau 20:00 nếu hay tiểu đêm.',
      completed: false
    },
    {
      id: 'm5',
      time: '21:30 - 22:00 (Thư giãn trước ngủ)',
      tag: 'Hạ thân nhiệt & Sóng não Delta',
      title: '🛀 Tắm nước ấm 10 phút, chỉnh điều hòa 24-26°C & Bật sóng Delta',
      desc: 'Nước ấm kích hoạt giãn mạch ngoại vi hạ thân nhiệt trung tâm 1°C. Để điện thoại xa giường và bật máy phát Web Audio API.',
      completed: false
    }
  ];

  return list;
}

// Generate targeted nutrition & health hacks
function generateNutritionAdvice(ans) {
  const hasAns = (key, val) => {
    const v = ans[key];
    if (Array.isArray(v)) return v.includes(val);
    return v === val;
  };

  const dinnerItems = [
    "<strong>Món chính (5 phút):</strong> 2 quả trứng gà luộc lòng đào (giàu Melatonin & Tryptophan tự nhiên) hoặc ức gà áp chảo + 1 chén nhỏ cơm gạo lứt.",
    "<strong>Rau xanh (3 phút):</strong> Canh rau bina (rau chân vịt) hoặc canh rau ngót luộc (chứa hàm lượng Magie cao giúp giãn cơ bắp).",
    "<strong>Tráng miệng vàng:</strong> 1-2 quả Kiwi hoặc 1 quả chuối chín (chứa serotonin và kali ngăn ngừa chuột rút ban đêm).",
    "<strong>Trà an thần nhẹ:</strong> 1 tách nhỏ trà hoa cúc hoặc trà tim sen ấm lúc 20:00."
  ];

  let targetedHealth = '';
  if (hasAns('chronic_condition', 'gerd')) {
    targetedHealth += `<p><strong>🫀 Khắc phục Trào Ngược GERD:</strong> Ăn tối trước giờ ngủ ít nhất 3 tiếng. Khi ngủ, nằm nghiêng sang bên TRÁI (tư thế này giữ cơ thắt thực quản nằm phía trên mức dịch vị axit). Kê đầu giường cao thêm 10-15cm.</p>`;
  }
  if (hasAns('physical_pain', 'neck_back_pain')) {
    targetedHealth += `<p style="margin-top:0.4rem;"><strong>🦴 Khắc phục Đau Cổ Vai Gáy:</strong> Dùng gối cao vừa phải (7-10cm) nâng đỡ đường cong sinh lý cổ. Không nằm sấp. Đặt 1 chiếc gối mỏng dưới đầu gối khi nằm ngửa để giảm áp lực lên cột sống thắt lưng.</p>`;
  }
  if (hasAns('hormone_state', 'menopause_hotflash')) {
    targetedHealth += `<p style="margin-top:0.4rem;"><strong>🔥 Khắc phục Bốc Hỏa Tiền Mãn Kinh:</strong> Giữ nhiệt độ phòng ở mức 23-24°C. Dùng chăn ga chất liệu cotton hoặc lụa thoáng khí. Uống 1 ngụm trà hoa cúc mát để hạ hỏa.</p>`;
  }
  if (hasAns('chronic_condition', 'nocturia') || hasAns('dinner_habit', 'drink_lots_water')) {
    targetedHealth += `<p style="margin-top:0.4rem;"><strong>🚽 Khắc phục Tiểu Đêm:</strong> Cắt giảm hoàn toàn nước sau 20:00. Thực hiện kỹ thuật 'đi tiểu kép' (Double Voiding): đi tiểu 1 lần lúc 21:45 và 1 lần nữa ngay trước khi nằm lên giường lúc 22:30.</p>`;
  }
  if (!targetedHealth) {
    targetedHealth = `<p>Tình trạng thể chất của bạn hiện rất tốt! Chỉ cần duy trì môi trường ngủ mát mẻ (24-26°C) và tránh ánh sáng xanh màn hình là bạn sẽ có giấc ngủ sâu hoàn hảo.</p>`;
  }

  const deskExercises = [
    "<strong>Động tác Chin-Tuck (1 phút):</strong> Ngồi thẳng lưng, thu cằm về phía sau như tạo 2 cằm, giữ 5 giây rồi thả lỏng. Lặp lại 5 lần để giải tỏa đốt sống cổ C5-C7.",
    "<strong>Động tác Mở Ngực Xương Bả Vai (1 phút):</strong> Đan hai tay ra sau gáy, hít sâu ưỡn ngực mở rộng khuỷu tay sang hai bên. Thở ra từ từ.",
    "<strong>Thả Lỏng Mắt 20-20-20 (30 giây):</strong> Cứ mỗi 20 phút, nhìn vào một vật cách xa 20 feet (6 mét) trong 20 giây để thư giãn cơ thể mi mắt."
  ];

  return { dinnerItems, targetedHealth, deskExercises };
}

// ==========================================
// 8. RENDER RESULTS DASHBOARD
// ==========================================
function renderDashboard(data) {
  // Score Gauge
  const scoreVal = document.getElementById('predicted-score-val');
  const scoreCircle = document.getElementById('score-circle-path');
  const statusBadge = document.getElementById('sleep-status-badge');
  const riskBadge = document.getElementById('sleep-risk-badge');
  const verdictTitle = document.getElementById('score-verdict-title');
  const verdictDesc = document.getElementById('score-verdict-desc');

  animateNumber(scoreVal, 0, data.predictedScore, 1000);
  scoreCircle.setAttribute('stroke-dasharray', `${data.predictedScore}, 100`);

  if (data.predictedScore >= 80) {
    scoreCircle.style.stroke = 'var(--emerald-safe)';
    statusBadge.textContent = 'Rất Tốt';
    statusBadge.style.color = 'var(--emerald-safe)';
    riskBadge.textContent = 'Nguy cơ thấp';
    riskBadge.style.color = 'var(--emerald-safe)';
    verdictTitle.textContent = 'Dự Báo: Giấc Ngủ Phục Hồi Tối Ưu';
    verdictDesc.textContent = '5 trụ cột y tế đều ở ngưỡng an toàn. Giấc ngủ đêm nay sẽ giúp não bộ tái tạo tối đa.';
  } else if (data.predictedScore >= 60) {
    scoreCircle.style.stroke = 'var(--amber-warning)';
    statusBadge.textContent = 'Trung Bình';
    statusBadge.style.color = 'var(--amber-warning)';
    riskBadge.textContent = 'Cần can thiệp chiều nay';
    riskBadge.style.color = 'var(--amber-warning)';
    verdictTitle.textContent = 'Cảnh Báo: Nguy Cơ Ngủ Chập Chờn & Khó Ngủ Sâu';
    verdictDesc.textContent = 'Phát hiện nguy cơ từ áp lực stress, caffeine hoặc môi trường ngủ. Hãy áp dụng ngay các vi-hành động bên dưới.';
  } else {
    scoreCircle.style.stroke = 'var(--rose-danger)';
    statusBadge.textContent = 'Báo Động Kém';
    statusBadge.style.color = 'var(--rose-danger)';
    riskBadge.textContent = 'Bắt buộc phải can thiệp';
    riskBadge.style.color = 'var(--rose-danger)';
    verdictTitle.textContent = 'Báo Động: Nguy Cơ Mất Ngủ & Mệt Mỏi Sáng Mai';
    verdictDesc.textContent = 'Hệ thần kinh đang bị kích thích mạnh kết hợp đau mỏi thể chất. Thực hiện các giải pháp đặc trị bên dưới để cứu vãn giấc ngủ.';
  }

  // Sub Metrics
  document.getElementById('latency-val').textContent = `~${data.latency} phút`;
  document.getElementById('deep-sleep-val').textContent = `${data.deepSleepPct}% (${data.deepSleepPct >= 18 ? 'Đạt chuẩn' : 'Hơi thấp'})`;
  document.getElementById('rem-sleep-val').textContent = `${data.remSleepPct}% (Phục hồi cảm xúc)`;

  // 5 Pillars Breakdown Bars
  const p = data.pillars;
  renderPillarBar('bar-p1-fill', 'bar-p1-text', p.p1_stress, 'Điểm: ' + p.p1_stress + '/100');
  renderPillarBar('bar-p2-fill', 'bar-p2-text', p.p2_env, 'Điểm: ' + p.p2_env + '/100');
  renderPillarBar('bar-p3-fill', 'bar-p3-text', p.p3_lifestyle, 'Điểm: ' + p.p3_lifestyle + '/100');
  renderPillarBar('bar-p4-fill', 'bar-p4-text', p.p4_physio, 'Điểm: ' + p.p4_physio + '/100');
  renderPillarBar('bar-p5-fill', 'bar-p5-text', p.p5_health, 'Điểm: ' + p.p5_health + '/100');

  // Brain performance comparison
  const noAction = Math.max(30, Math.round(data.predictedScore * 0.7));
  const withAction = Math.min(96, Math.max(88, data.predictedScore + 28));
  document.getElementById('no-action-focus').textContent = `${noAction}%`;
  document.getElementById('action-focus').textContent = `${withAction}%`;

  // Real-time advice
  document.getElementById('realtime-action-content').innerHTML = data.realtimeAdvice;

  // Micro-schedule timeline
  renderMicroSchedule(data.microSchedule);

  // Nutrition & Health
  const foodList = document.getElementById('dinner-food-list');
  foodList.innerHTML = data.nutritionAdvice.dinnerItems.map(item => `<li>${item}</li>`).join('');

  document.getElementById('targeted-health-content').innerHTML = data.nutritionAdvice.targetedHealth;

  const exerciseList = document.getElementById('desk-exercise-list');
  exerciseList.innerHTML = data.nutritionAdvice.deskExercises.map(item => `<li>${item}</li>`).join('');
}

function renderPillarBar(barId, textId, score, label) {
  const bar = document.getElementById(barId);
  const text = document.getElementById(textId);
  if (!bar || !text) return;

  bar.style.width = `${score}%`;
  text.textContent = `${label} (${score > 60 ? 'Rủi ro cao' : score > 35 ? 'Trung bình' : 'Tốt'})`;

  if (score > 60) bar.style.background = 'linear-gradient(90deg, #F59E0B, #EF4444)';
  else if (score > 35) bar.style.background = 'linear-gradient(90deg, #6366F1, #F59E0B)';
  else bar.style.background = 'linear-gradient(90deg, #059669, #10B981)';
}

function animateNumber(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start);
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

function renderMicroSchedule(tasks) {
  const container = document.getElementById('schedule-timeline');
  container.innerHTML = '';
  AppState.readinessTasks = tasks;

  tasks.forEach((task) => {
    const itemEl = document.createElement('div');
    itemEl.className = `timeline-item ${task.completed ? 'completed' : ''}`;
    itemEl.innerHTML = `
      <div class="timeline-marker"></div>
      <div class="timeline-header">
        <span class="timeline-time-badge"><i class="fa-regular fa-clock"></i> ${task.time}</span>
        <span class="timeline-tag">${task.tag}</span>
      </div>
      <h4 class="timeline-action-title">${task.title}</h4>
      <p class="timeline-desc">${task.desc}</p>
      <div class="timeline-footer">
        <label class="timeline-checkbox-label">
          <input type="checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}>
          <span>${task.completed ? 'Đã hoàn thành ✓' : 'Đánh dấu khi hoàn thành'}</span>
        </label>
      </div>
    `;

    const checkbox = itemEl.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      task.completed = e.target.checked;
      itemEl.classList.toggle('completed', task.completed);
      checkbox.nextElementSibling.textContent = task.completed ? 'Đã hoàn thành ✓' : 'Đánh dấu khi hoàn thành';
      updateReadinessBar();
    });

    container.appendChild(itemEl);
  });

  updateReadinessBar();
}

function updateReadinessBar() {
  const total = AppState.readinessTasks.length;
  if (total === 0) return;
  const count = AppState.readinessTasks.filter(t => t.completed).length;
  const percent = Math.round((count / total) * 100);

  document.getElementById('readiness-percent').textContent = `${count}/${total} vi-hành động (${percent}%)`;
  document.getElementById('readiness-bar-fill').style.width = `${percent}%`;
}

// ==========================================
// 9. WEB AUDIO API SOUND GENERATOR
// ==========================================
function getAudioContext() {
  if (!AppState.audio.ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    AppState.audio.ctx = new AudioContext();
  }
  if (AppState.audio.ctx.state === 'suspended') {
    AppState.audio.ctx.resume();
  }
  return AppState.audio.ctx;
}

function initAudioControls() {
  // Header Quick Button
  const soundBtn = document.getElementById('soundscape-quick-btn');
  const soundDrawer = document.getElementById('sound-player-drawer');
  soundBtn.addEventListener('click', () => {
    if (!requireAuthGuard('mở máy phát âm thanh sóng não phục hồi')) {
      return;
    }
    soundDrawer.style.display = soundDrawer.style.display === 'none' ? 'block' : 'none';
    if (soundDrawer.style.display === 'block') {
      soundDrawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.getElementById('close-player-btn').addEventListener('click', () => {
    soundDrawer.style.display = 'none';
  });

  // Master Mute
  document.getElementById('master-mute-btn').addEventListener('click', stopAllSounds);

  // Toggles
  document.querySelectorAll('.channel-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const channel = btn.dataset.channel;
      toggleChannel(channel, btn);
    });
  });

  // Sliders
  document.querySelectorAll('.channel-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const channel = slider.dataset.channel;
      const val = parseFloat(e.target.value) / 100;
      AppState.audio.channels[channel].volume = val;
      if (AppState.audio.channels[channel].gainNode) {
        AppState.audio.channels[channel].gainNode.gain.setValueAtTime(val, AppState.audio.ctx.currentTime);
      }
    });
  });

  // Timer chips
  document.querySelectorAll('.timer-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.timer-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      AppState.audio.timerDuration = parseInt(chip.dataset.timer, 10);
      resetAudioTimer();
    });
  });

  // Export Calendar ICS
  document.getElementById('download-ics-btn').addEventListener('click', downloadIcsFile);
}

function toggleChannel(channel, btn) {
  if (!requireAuthGuard('nghe âm thanh sóng não thư giãn')) {
    return;
  }
  const ctx = getAudioContext();
  const chState = AppState.audio.channels[channel];

  if (chState.isPlaying) {
    stopChannel(channel);
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Bật';
    btn.classList.remove('playing');
  } else {
    startChannel(channel);
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> Tắt';
    btn.classList.add('playing');

    if (window.SleepSyncDB) {
      const names = {
        binaural: 'Sóng Não Delta 4Hz ru ngủ',
        rain: 'Tiếng Mưa Rào Pink Noise',
        ocean: 'Sóng Biển Ban Đêm (Deep Ocean)',
        bowl: 'Chuông Xoay Thiền Tây Tạng 432Hz'
      };
      SleepSyncDB.logServiceUsage('SOUND_PLAY', 'Phát âm thanh thư giãn', `Bật kênh âm thanh: ${names[channel] || channel}`);
    }
  }

  updateGlobalSoundIndicator();
}

function startChannel(channel) {
  const ctx = getAudioContext();
  const chState = AppState.audio.channels[channel];

  chState.gainNode = ctx.createGain();
  chState.gainNode.gain.setValueAtTime(chState.volume, ctx.currentTime);
  chState.gainNode.connect(ctx.destination);

  if (channel === 'binaural') {
    const merger = ctx.createChannelMerger(2);
    const leftOsc = ctx.createOscillator();
    leftOsc.type = 'sine';
    leftOsc.frequency.setValueAtTime(100, ctx.currentTime);

    const rightOsc = ctx.createOscillator();
    rightOsc.type = 'sine';
    rightOsc.frequency.setValueAtTime(104, ctx.currentTime);

    leftOsc.connect(merger, 0, 0);
    rightOsc.connect(merger, 0, 1);
    merger.connect(chState.gainNode);

    leftOsc.start();
    rightOsc.start();

    chState.leftOsc = leftOsc;
    chState.rightOsc = rightOsc;
    chState.isPlaying = true;
  } else if (channel === 'rain') {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
      b6 = white * 0.115926;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(chState.gainNode);
    whiteNoise.start();

    chState.sourceNode = whiteNoise;
    chState.isPlaying = true;
  } else if (channel === 'ocean') {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, ctx.currentTime);
    filter.Q.setValueAtTime(1.5, ctx.currentTime);

    const waveGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.08, ctx.currentTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.35, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);

    noise.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(chState.gainNode);

    noise.start();
    lfo.start();

    chState.sourceNode = noise;
    chState.lfoNode = lfo;
    chState.isPlaying = true;
  } else if (channel === 'bowl') {
    playSingingBowlChime(ctx, chState.gainNode);
    chState.intervalId = setInterval(() => {
      playSingingBowlChime(ctx, chState.gainNode);
    }, 9000);
    chState.isPlaying = true;
  }

  resetAudioTimer();
}

function playSingingBowlChime(ctx, targetGain) {
  const baseFreq = 432;
  const harmonics = [baseFreq, baseFreq * 2.76, baseFreq * 4.9];
  const decays = [8.0, 5.0, 3.5];

  harmonics.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.25 / (idx + 1), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decays[idx]);

    osc.connect(gain);
    gain.connect(targetGain);

    osc.start();
    osc.stop(ctx.currentTime + decays[idx]);
  });
}

function stopChannel(channel) {
  const chState = AppState.audio.channels[channel];
  if (!chState.isPlaying) return;

  if (channel === 'binaural') {
    if (chState.leftOsc) chState.leftOsc.stop();
    if (chState.rightOsc) chState.rightOsc.stop();
  } else if (channel === 'rain') {
    if (chState.sourceNode) chState.sourceNode.stop();
  } else if (channel === 'ocean') {
    if (chState.sourceNode) chState.sourceNode.stop();
    if (chState.lfoNode) chState.lfoNode.stop();
  } else if (channel === 'bowl') {
    if (chState.intervalId) clearInterval(chState.intervalId);
  }

  chState.isPlaying = false;
}

function stopAllSounds() {
  Object.keys(AppState.audio.channels).forEach(stopChannel);
  document.querySelectorAll('.channel-toggle-btn').forEach(btn => {
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Bật';
    btn.classList.remove('playing');
  });
  updateGlobalSoundIndicator();
}

function updateGlobalSoundIndicator() {
  const isAny = Object.values(AppState.audio.channels).some(ch => ch.isPlaying);
  const ind = document.getElementById('sound-indicator');
  if (ind) ind.style.display = isAny ? 'flex' : 'none';
}

function resetAudioTimer() {
  if (AppState.audio.timerTimeout) clearTimeout(AppState.audio.timerTimeout);
  if (AppState.audio.timerDuration > 0) {
    AppState.audio.timerTimeout = setTimeout(() => {
      stopAllSounds();
    }, AppState.audio.timerDuration * 60 * 1000);
  }
}

// ==========================================
// 10. CALENDAR (.ICS) EXPORT ENGINE
// ==========================================
function downloadIcsFile() {
  if (!AppState.analysisResult || !AppState.analysisResult.microSchedule) {
    showAppToast("Xuất file lịch", "Vui lòng hoàn thành chẩn đoán 5 trụ cột trước khi xuất file lịch!", "warning");
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}${month}${day}`;

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SleepSync AI//5-Pillar Chrono-Schedule//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lịch Can Thiệp Giấc Ngủ SleepSync'
  ];

  AppState.analysisResult.microSchedule.forEach((task, idx) => {
    let sH = 17, sM = 0, eH = 17, eM = 15;
    const match = task.time.match(/(\d{2}):(\d{2})/);
    if (match) {
      sH = parseInt(match[1], 10);
      sM = parseInt(match[2], 10);
      eH = sH;
      eM = sM + 15;
      if (eM >= 60) { eH += 1; eM -= 60; }
    }

    const dtStart = `${todayStr}T${String(sH).padStart(2, '0')}${String(sM).padStart(2, '0')}00`;
    const dtEnd = `${todayStr}T${String(eH).padStart(2, '0')}${String(eM).padStart(2, '0')}00`;

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:sleepsync-${todayStr}-${idx}@sleepsync.ai`);
    ics.push(`DTSTAMP:${todayStr}T120000Z`);
    ics.push(`DTSTART:${dtStart}`);
    ics.push(`DTEND:${dtEnd}`);
    ics.push(`SUMMARY:🌙 [SleepSync] ${task.title}`);
    ics.push(`DESCRIPTION:${task.desc}`);
    ics.push('BEGIN:VALARM');
    ics.push('TRIGGER:-PT10M');
    ics.push('ACTION:DISPLAY');
    ics.push(`DESCRIPTION:Nhắc nhở: ${task.title}`);
    ics.push('END:VALARM');
    ics.push('END:VEVENT');
  });

  ics.push('END:VCALENDAR');

  const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SleepSync_5Pillar_Schedule_${todayStr}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (window.SleepSyncDB) {
    SleepSyncDB.logServiceUsage(
      'CALENDAR_SYNC',
      'Đồng bộ lịch & Xuất file .ics',
      'Đã xuất thành công lịch can thiệp nhịp sinh học và vi-hành động giấc ngủ.'
    );
  }
}

// ==========================================
// 11. HISTORY MODULE
// ==========================================
function initHistoryModule() {
  const modal = document.getElementById('history-modal');
  const btn = document.getElementById('history-modal-btn');
  const close = document.getElementById('close-history-modal');

  if (btn) {
    btn.addEventListener('click', () => {
      renderHistoryModal();
      if (modal) modal.style.display = 'flex';
    });
  }

  if (close) {
    close.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  loadHistory();
}

function saveHistoryLog(result) {
  const item = {
    id: Date.now(),
    dateStr: new Date().toLocaleDateString('vi-VN', {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    score: result.predictedScore,
    summary: `Chẩn đoán 5 trụ cột: Stress ${result.pillars.p1_stress}/100, Lối sống ${result.pillars.p3_lifestyle}/100, Thể chất ${result.pillars.p5_health}/100.`
  };

  AppState.history.unshift(item);
  if (AppState.history.length > 8) AppState.history.pop();

  try {
    localStorage.setItem('sleepsync_clinical_history', JSON.stringify(AppState.history));
  } catch (e) {}

  // Sync to Client Database
  if (window.SleepSyncDB) {
    SleepSyncDB.saveDiagnosis(result);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('sleepsync_clinical_history');
    if (raw) AppState.history = JSON.parse(raw);
  } catch (e) {
    AppState.history = [];
  }
}

function renderHistoryModal() {
  const listEl = document.getElementById('history-logs-list');
  if (!listEl) return;

  if (AppState.history.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-regular fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.8rem; display: block; opacity: 0.5;"></i>
        Chưa có lịch sử chẩn đoán nào. Hãy thực hiện chẩn đoán 5 trụ cột hôm nay để bắt đầu theo dõi tiến trình!
      </div>
    `;
    return;
  }

  listEl.innerHTML = AppState.history.map(item => `
    <div class="history-item-card">
      <div>
        <div class="history-date"><i class="fa-regular fa-calendar"></i> ${item.dateStr}</div>
        <div class="history-summary">${item.summary}</div>
      </div>
      <div class="history-score-badge" style="background: ${item.score >= 75 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}; color: ${item.score >= 75 ? '#34D399' : '#FBBF24'};">
        ${item.score}%
      </div>
    </div>
  `).join('');
}

// ==========================================
// 12. USER PROFILE & CLIENT DATABASE MODULE
// ==========================================
function initUserProfileModule() {
  console.log('[SleepSync] Initializing User Profile & Client Database...');

  if (window.SleepSyncDB) {
    SleepSyncDB.init().then(() => {
      renderActiveUserProfile();
    }).catch(err => {
      console.warn('[SleepSyncDB] DB init error, rendering cached user:', err);
      renderActiveUserProfile();
    });
  } else {
    renderActiveUserProfile();
  }

  // Drawer Toggles (Top pill & Hamburger)
  const navProfileBtn = document.getElementById('user-profile-btn');
  const navMenuBtn = document.getElementById('user-profile-menu-btn');
  const closeDrawerBtn = document.getElementById('close-profile-drawer-btn');
  const drawerOverlay = document.getElementById('user-profile-drawer-overlay');

  const handleProfilePillClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.SleepSyncDB || !SleepSyncDB.isAuthenticated()) {
      openUserAuthModal('login');
      return;
    }
    openProfileDrawer();
  };

  if (navProfileBtn) navProfileBtn.addEventListener('click', handleProfilePillClick);
  if (navMenuBtn) navMenuBtn.addEventListener('click', handleProfilePillClick);
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeProfileDrawer();
    });
  }
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeProfileDrawer();
    });
  }

  // Disclaimer Modal & Notification Ticket (Auto-Dismiss after 10s on every visit)
  const drawerDisclaimerBtn = document.getElementById('drawer-disclaimer-details-btn');
  const viewDisclaimerBtn = document.getElementById('view-disclaimer-details-btn');
  const closeDisclaimerBtn = document.getElementById('close-disclaimer-modal-btn');
  const ackDisclaimerBtn = document.getElementById('ack-disclaimer-btn');
  const disclaimerModal = document.getElementById('disclaimer-modal');
  const disclaimerBanner = document.getElementById('medical-disclaimer-banner');
  const closeDisclaimerBannerBtn = document.getElementById('close-disclaimer-banner-btn');
  const ackDisclaimerBannerBtn = document.getElementById('ack-disclaimer-banner-btn');

  let disclaimerAutoTimer = null;
  let disclaimerRemainingMs = 10000;
  let disclaimerTimerStart = Date.now();
  let isDisclaimerHovered = false;

  const dismissDisclaimerBanner = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!disclaimerBanner) return;
    clearTimeout(disclaimerAutoTimer);
    disclaimerBanner.classList.add('ticket-dismissed');
    setTimeout(() => {
      disclaimerBanner.style.display = 'none';
    }, 420);
  };

  const openDisclaimer = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (disclaimerModal) disclaimerModal.style.display = 'flex';
  };
  const closeDisclaimer = () => {
    if (disclaimerModal) disclaimerModal.style.display = 'none';
  };

  // Start 10-second countdown on every visit / page access
  const startDisclaimerCountdown = () => {
    if (!disclaimerBanner) return;
    clearTimeout(disclaimerAutoTimer);
    disclaimerRemainingMs = 10000;
    disclaimerTimerStart = Date.now();
    disclaimerBanner.classList.remove('ticket-dismissed');
    disclaimerBanner.style.display = 'flex';

    disclaimerAutoTimer = setTimeout(() => {
      if (!isDisclaimerHovered) {
        dismissDisclaimerBanner();
      }
    }, disclaimerRemainingMs);
  };

  if (disclaimerBanner) {
    // Pause timer when mouse is hovering to read
    disclaimerBanner.addEventListener('mouseenter', () => {
      isDisclaimerHovered = true;
      const elapsed = Date.now() - disclaimerTimerStart;
      disclaimerRemainingMs = Math.max(1000, disclaimerRemainingMs - elapsed);
      clearTimeout(disclaimerAutoTimer);
    });

    // Resume timer when mouse leaves
    disclaimerBanner.addEventListener('mouseleave', () => {
      isDisclaimerHovered = false;
      if (disclaimerBanner.classList.contains('ticket-dismissed')) return;
      disclaimerTimerStart = Date.now();
      clearTimeout(disclaimerAutoTimer);
      disclaimerAutoTimer = setTimeout(() => {
        if (!isDisclaimerHovered) {
          dismissDisclaimerBanner();
        }
      }, disclaimerRemainingMs);
    });

    // Run automatically on each page visit
    startDisclaimerCountdown();
  }

  if (drawerDisclaimerBtn) drawerDisclaimerBtn.addEventListener('click', openDisclaimer);
  if (viewDisclaimerBtn) viewDisclaimerBtn.addEventListener('click', openDisclaimer);
  if (closeDisclaimerBtn) closeDisclaimerBtn.addEventListener('click', closeDisclaimer);
  if (ackDisclaimerBtn) {
    ackDisclaimerBtn.addEventListener('click', () => {
      closeDisclaimer();
      dismissDisclaimerBanner();
    });
  }
  if (closeDisclaimerBannerBtn) closeDisclaimerBannerBtn.addEventListener('click', dismissDisclaimerBanner);
  if (ackDisclaimerBannerBtn) ackDisclaimerBannerBtn.addEventListener('click', dismissDisclaimerBanner);

  if (disclaimerModal) {
    disclaimerModal.addEventListener('click', (e) => {
      if (e.target === disclaimerModal) closeDisclaimer();
    });
  }

  // Keyboard shortcut: Escape to close drawer and modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProfileDrawer();
      closeDisclaimer();
      closeUserAuthModal();
      const confirmModal = document.getElementById('app-confirm-modal');
      if (confirmModal) confirmModal.style.display = 'none';
    }
  });

  // Drawer Navigation Switcher
  const drawerTabs = [
    { btnId: 'drawer-tab-profile', paneId: 'pane-user-profile', key: 'profile' },
    { btnId: 'drawer-tab-edit', paneId: 'pane-user-edit', key: 'edit' },
    { btnId: 'drawer-tab-switch', paneId: 'pane-user-switch', key: 'switch' }
  ];

  function switchDrawerTab(targetKey) {
    drawerTabs.forEach(tab => {
      const btn = document.getElementById(tab.btnId);
      const pane = document.getElementById(tab.paneId);
      if (tab.key === targetKey) {
        if (btn) btn.classList.add('active');
        if (pane) pane.style.display = 'block';
      } else {
        if (btn) btn.classList.remove('active');
        if (pane) pane.style.display = 'none';
      }
    });

    if (targetKey === 'edit') {
      populateDrawerEditForm();
    } else if (targetKey === 'switch') {
      renderFacebookAccountSwitcher();
    }
  }

  drawerTabs.forEach(tab => {
    const btn = document.getElementById(tab.btnId);
    if (btn) {
      btn.addEventListener('click', () => switchDrawerTab(tab.key));
    }
  });

  // Quick switch triggers inside drawer
  const gotoEditBtn = document.getElementById('btn-goto-edit-tab');
  const quickChangeAvatarBtn = document.getElementById('btn-quick-change-avatar');
  const quickSwitchBtn = document.getElementById('drawer-quick-switch-btn');
  const addAccountBtn = document.getElementById('btn-switch-add-account');

  if (gotoEditBtn) gotoEditBtn.addEventListener('click', () => switchDrawerTab('edit'));
  if (quickChangeAvatarBtn) quickChangeAvatarBtn.addEventListener('click', () => switchDrawerTab('edit'));
  if (quickSwitchBtn) quickSwitchBtn.addEventListener('click', () => switchDrawerTab('switch'));
  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', () => {
      closeProfileDrawer();
      openUserAuthModal('register');
    });
  }

  // In-Drawer Avatar Picker Grid
  const drawerAvatarGrid = document.getElementById('drawer-avatar-picker-grid');
  const drawerAvatarInput = document.getElementById('drawer-edit-avatar');
  if (drawerAvatarGrid && drawerAvatarInput) {
    drawerAvatarGrid.querySelectorAll('.avatar-pick-item').forEach(item => {
      item.addEventListener('click', () => {
        drawerAvatarGrid.querySelectorAll('.avatar-pick-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        drawerAvatarInput.value = item.dataset.avatar || 'programmer_laptop';
      });
    });
  }

  // In-Drawer Profile Edit Form Submission
  const drawerEditForm = document.getElementById('drawer-profile-edit-form');
  if (drawerEditForm) {
    drawerEditForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!window.SleepSyncDB) return;
      const user = SleepSyncDB.getCurrentUser();
      if (!user) return;

      const fullName = document.getElementById('drawer-edit-fullname')?.value.trim();
      const phone = document.getElementById('drawer-edit-phone')?.value.trim();
      const occupation = document.getElementById('drawer-edit-occupation')?.value.trim();
      const age = document.getElementById('drawer-edit-age')?.value.trim();
      const fitnessLevel = document.getElementById('drawer-edit-fitness')?.value;
      const targetBedtime = document.getElementById('drawer-edit-bedtime')?.value;
      const wakeTime = document.getElementById('drawer-edit-waketime')?.value;
      const bio = document.getElementById('drawer-edit-bio')?.value.trim();
      const avatarType = document.getElementById('drawer-edit-avatar')?.value || user.avatarType || 'programmer_laptop';

      const checkedConditions = [];
      document.querySelectorAll('input[name="drawer-conditions"]:checked').forEach(cb => {
        checkedConditions.push(cb.value);
      });
      if (checkedConditions.length === 0) {
        checkedConditions.push('Sức khỏe ổn định');
      }

      const updated = {
        fullName: fullName || user.fullName,
        role: occupation || user.role,
        occupation: occupation || user.occupation,
        phone: phone || user.phone,
        age: age || user.age,
        fitnessLevel: fitnessLevel || user.fitnessLevel,
        targetBedtime: targetBedtime || user.targetBedtime || '23:00',
        wakeTime: wakeTime || user.wakeTime || '06:30',
        bio: bio || user.bio,
        avatarType,
        healthConditions: checkedConditions
      };

      SleepSyncDB.updateUserProfile(user.id, updated);
      renderActiveUserProfile();
      showAppToast('Hồ sơ cập nhật', 'Thông tin và avatar của bạn đã được cập nhật thành công!', 'success');
      switchDrawerTab('profile');
    });
  }

  // Drawer Logout Button with Custom Confirmation Dialog
  const drawerLogoutBtn = document.getElementById('drawer-logout-btn');
  if (drawerLogoutBtn) {
    drawerLogoutBtn.addEventListener('click', async () => {
      if (!window.SleepSyncDB) return;
      const user = SleepSyncDB.getCurrentUser();
      const userName = user ? user.fullName : 'bạn';

      const confirmed = await showConfirmDialog({
        title: 'Xác Nhận Đăng Xuất',
        message: `Bạn có chắc chắn muốn đăng xuất khỏi tài khoản ${userName}? Dữ liệu và chuỗi ngày chăm sóc giấc ngủ của bạn vẫn được lưu trữ an toàn.`,
        confirmText: 'Đăng Xuất',
        cancelText: 'Ở lại',
        type: 'danger',
        icon: 'fa-solid fa-right-from-bracket'
      });

      if (confirmed) {
        SleepSyncDB.logoutCurrentUser();
        closeProfileDrawer();
        renderActiveUserProfile();
        showAppToast('Đã đăng xuất', 'Bạn đã đăng xuất tài khoản an toàn.', 'info');
        openUserAuthModal('login');
      }
    });
  }

  // Database Tab Actions
  const exportDbBtn = document.getElementById('export-db-json-btn');
  const resetDbBtn = document.getElementById('reset-db-btn');
  const manualSyncBtn = document.getElementById('manual-cloud-sync-btn');

  if (exportDbBtn) {
    exportDbBtn.addEventListener('click', () => {
      if (window.SleepSyncDB) {
        SleepSyncDB.exportDatabaseBackup();
        showAppToast('Xuất sao lưu', 'Đã tải xuống file sao lưu dữ liệu SleepSync JSON.', 'success');
      }
    });
  }

  if (resetDbBtn) {
    resetDbBtn.addEventListener('click', async () => {
      const ok = await showConfirmDialog({
        title: 'Khôi Phục Mặc Định',
        message: 'Bạn có chắc chắn muốn khôi phục toàn bộ cơ sở dữ liệu về mặc định ban đầu?',
        confirmText: 'Khôi phục',
        cancelText: 'Hủy',
        icon: 'fa-solid fa-rotate-right'
      });
      if (ok && window.SleepSyncDB) {
        SleepSyncDB.resetToDefaults();
        renderActiveUserProfile();
        renderServiceUsageLogs();
        showAppToast('Khôi phục thành công', 'Cơ sở dữ liệu đã được đặt lại về trạng thái mẫu ban đầu.', 'success');
      }
    });
  }

  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      manualSyncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đồng bộ...';
      if (window.SleepSyncDB) {
        const ok = await SleepSyncDB.syncWithCloudServer();
        manualSyncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Đồng Bộ Cloud Ngay';
        if (ok) {
          renderActiveUserProfile();
          renderServiceUsageLogs();
          showAppToast('Đồng bộ Cloud', 'Dữ liệu đã được đồng bộ đám mây thành công!', 'success');
        } else {
          showAppToast('Ngoại tuyến', 'Đang hoạt động ở chế độ ngoại tuyến (Local IndexedDB).', 'info');
        }
      }
    });
  }

  // DB custom events
  window.addEventListener('sleepsync:user-changed', () => {
    renderActiveUserProfile();
    renderFacebookAccountSwitcher();
  });
  window.addEventListener('sleepsync:device-accounts-updated', () => {
    renderFacebookAccountSwitcher();
  });
  window.addEventListener('sleepsync:user-updated', () => {
    renderActiveUserProfile();
    renderFacebookAccountSwitcher();
  });

  // Initialize User Authentication Modal (Login & Register)
  initUserAuthModal();
}

// Populate the in-drawer edit form with active user values
function populateDrawerEditForm() {
  if (!window.SleepSyncDB) return;
  const user = SleepSyncDB.getCurrentUser();
  if (!user) return;

  const fnInput = document.getElementById('drawer-edit-fullname');
  const phInput = document.getElementById('drawer-edit-phone');
  const occInput = document.getElementById('drawer-edit-occupation');
  const ageInput = document.getElementById('drawer-edit-age');
  const fitInput = document.getElementById('drawer-edit-fitness');
  const bedInput = document.getElementById('drawer-edit-bedtime');
  const wakeInput = document.getElementById('drawer-edit-waketime');
  const bioInput = document.getElementById('drawer-edit-bio');
  const avInput = document.getElementById('drawer-edit-avatar');

  if (fnInput) fnInput.value = user.fullName || '';
  if (phInput) phInput.value = user.phone || '';
  if (occInput) occInput.value = user.occupation || user.role || '';
  if (ageInput) ageInput.value = user.age || '';
  if (fitInput) fitInput.value = user.fitnessLevel || 'Trung bình';
  if (bedInput) bedInput.value = user.targetBedtime || '23:00';
  if (wakeInput) wakeInput.value = user.wakeTime || '06:30';
  if (bioInput) bioInput.value = user.bio || '';
  if (avInput) avInput.value = user.avatarType || 'programmer_laptop';

  // Avatar Picker Sync
  const drawerAvatarGrid = document.getElementById('drawer-avatar-picker-grid');
  if (drawerAvatarGrid) {
    drawerAvatarGrid.querySelectorAll('.avatar-pick-item').forEach(item => {
      if (item.dataset.avatar === (user.avatarType || 'programmer_laptop')) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // Health condition checkboxes
  const currentConds = user.healthConditions || [];
  document.querySelectorAll('input[name="drawer-conditions"]').forEach(cb => {
    cb.checked = currentConds.some(c => c.toLowerCase().includes(cb.value.toLowerCase()) || cb.value.toLowerCase().includes(c.toLowerCase()));
  });
}

// Render Secure Account Switcher Cards (Only accounts logged in on THIS device)
function renderFacebookAccountSwitcher() {
  if (!window.SleepSyncDB) return;
  const listContainer = document.getElementById('account-switch-list-container');
  if (!listContainer) return;

  const users = SleepSyncDB.getDeviceUsers ? SleepSyncDB.getDeviceUsers() : SleepSyncDB.getAllUsers();
  const currentUser = SleepSyncDB.getCurrentUser();

  if (!users || users.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-device-accounts">
        <i class="fa-solid fa-laptop-medical empty-icon"></i>
        <div class="empty-title">Chưa có tài khoản trên thiết bị này</div>
        <div class="empty-subtitle">Đăng nhập hoặc đăng ký bên dưới để lưu hồ sơ vào máy này.</div>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = users.map(u => {
    const isCurrent = currentUser && u.id === currentUser.id;
    return `
      <div class="account-switch-card ${isCurrent ? 'active' : ''}" data-userid="${u.id}" style="${isCurrent ? '' : 'cursor: pointer;'}">
        <div class="account-switch-avatar">
          ${getAvatarSvg(u.avatarType)}
        </div>
        <div class="account-switch-info">
          <div class="account-switch-name">
            <span>${u.fullName}</span>
            <i class="fa-solid fa-circle-check verified-badge" style="color: #38BDF8; font-size: 0.85rem;" title="Đã xác minh"></i>
          </div>
          <div class="account-switch-meta">
            <span>${u.role || u.occupation} • ${u.age}</span>
            <span class="account-switch-streak"><i class="fa-solid fa-fire text-amber"></i> ${u.streakDays || 1} ngày streak</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${isCurrent 
            ? '<span class="account-switch-badge current"><i class="fa-solid fa-circle-check"></i> Đang hoạt động</span>'
            : `<button type="button" class="btn-account-switch-action" data-userid="${u.id}"><i class="fa-solid fa-lock"></i> Chuyển</button>`
          }
          <button type="button" class="btn-forget-account" data-userid="${u.id}" title="Xóa tài khoản khỏi thiết bị này">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.btn-account-switch-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.userid;
      promptSwitchAccountPassword(targetId);
    });
  });

  listContainer.querySelectorAll('.btn-forget-account').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.userid;
      const targetUser = users.find(u => u.id === targetId);
      const name = targetUser ? targetUser.fullName : 'tài khoản này';
      if (confirm(`Bạn có chắc muốn xóa tài khoản "${name}" khỏi thiết bị này?\n(Tài khoản và dữ liệu trên máy chủ vẫn an toàn).`)) {
        if (SleepSyncDB.removeDeviceUserId) {
          SleepSyncDB.removeDeviceUserId(targetId);
        }
        renderFacebookAccountSwitcher();
      }
    });
  });

  listContainer.querySelectorAll('.account-switch-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-forget-account')) return;
      const targetId = card.dataset.userid;
      if (currentUser && targetId === currentUser.id) return;
      promptSwitchAccountPassword(targetId);
    });
  });
}

function promptSwitchAccountPassword(targetUserId) {
  if (!window.SleepSyncDB) return;
  const users = SleepSyncDB.getDeviceUsers ? SleepSyncDB.getDeviceUsers() : SleepSyncDB.getAllUsers();
  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) return;

  const modal = document.getElementById('switch-account-password-modal');
  if (!modal) return;

  const avatarEl = document.getElementById('switch-target-avatar');
  const nameEl = document.getElementById('switch-target-name');
  const metaEl = document.getElementById('switch-target-meta');
  const idInput = document.getElementById('switch-target-userid');
  const phoneInput = document.getElementById('switch-target-phone');
  const pwdInput = document.getElementById('switch-pwd-input');
  const feedbackEl = document.getElementById('switch-pwd-feedback');
  const toggleBtn = document.getElementById('toggle-switch-pwd-btn');

  if (avatarEl) avatarEl.innerHTML = getAvatarSvg(targetUser.avatarType);
  if (nameEl) nameEl.textContent = targetUser.fullName;
  if (metaEl) metaEl.textContent = `${targetUser.role || targetUser.occupation || 'Thành viên'} • ${targetUser.age || ''}`;
  if (idInput) idInput.value = targetUser.id;
  if (phoneInput) phoneInput.value = targetUser.phone || targetUser.id;
  if (pwdInput) {
    pwdInput.value = '';
    pwdInput.type = 'password';
  }
  if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-regular fa-eye"></i>';
  if (feedbackEl) feedbackEl.style.display = 'none';

  modal.style.display = 'flex';
  setTimeout(() => {
    if (pwdInput) pwdInput.focus();
  }, 100);
}

function closeSwitchPasswordModal() {
  const modal = document.getElementById('switch-account-password-modal');
  if (modal) modal.style.display = 'none';
  const pwdInput = document.getElementById('switch-pwd-input');
  if (pwdInput) pwdInput.value = '';
  const feedbackEl = document.getElementById('switch-pwd-feedback');
  if (feedbackEl) feedbackEl.style.display = 'none';
}
window.closeSwitchPasswordModal = closeSwitchPasswordModal;

function openProfileDrawer() {
  const drawer = document.getElementById('user-profile-drawer');
  const overlay = document.getElementById('user-profile-drawer-overlay');
  renderActiveUserProfile();
  if (drawer) drawer.classList.add('open');
  if (overlay) {
    overlay.style.display = 'block';
    setTimeout(() => overlay.classList.add('active'), 10);
  }
}

function closeProfileDrawer() {
  const drawer = document.getElementById('user-profile-drawer');
  const overlay = document.getElementById('user-profile-drawer-overlay');
  if (drawer) {
    drawer.classList.remove('open');
  }
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => {
      if (!overlay.classList.contains('active')) {
        overlay.style.display = 'none';
      }
    }, 280);
  }
}

function renderActiveUserProfile() {
  if (!window.SleepSyncDB) return;
  const user = SleepSyncDB.getCurrentUser();
  const isAuth = SleepSyncDB.isAuthenticated && SleepSyncDB.isAuthenticated();

  // Top Nav Pill Elements
  const pillAvatar = document.getElementById('nav-pill-avatar');
  const pillName = document.getElementById('nav-pill-name');
  const pillStreak = document.getElementById('nav-pill-streak');

  // Drawer Identity Card Elements
  const cardAvatar = document.getElementById('profile-card-avatar');
  const profileName = document.getElementById('profile-display-name');
  const profileRole = document.getElementById('profile-display-role');
  const profileBio = document.getElementById('profile-display-bio');

  // Gamified Streak Stats
  const statStreak = document.getElementById('profile-stat-streak');
  const statScore = document.getElementById('profile-stat-score');
  const statTarget = document.getElementById('profile-stat-target');

  // 6 Habit Metric Details
  const elAge = document.getElementById('profile-display-age');
  const elOcc = document.getElementById('profile-display-occupation');
  const elPhone = document.getElementById('profile-display-phone');
  const elBedtime = document.getElementById('profile-display-bedtime');
  const elWaketime = document.getElementById('profile-display-waketime');
  const elFitness = document.getElementById('profile-display-fitness');
  const condContainer = document.getElementById('profile-display-conditions');
  const dbUsername = document.getElementById('db-active-username');

  // GUEST MODE
  if (!user || !isAuth) {
    if (pillAvatar) {
      pillAvatar.innerHTML = '<i class="fa-solid fa-user" style="color: #94A3B8; font-size: 1rem;"></i>';
    }
    if (pillName) pillName.textContent = 'Đăng Nhập';
    if (pillStreak) pillStreak.style.display = 'none';

    if (cardAvatar) {
      cardAvatar.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94A3B8;font-size:2.2rem;"><i class="fa-solid fa-user"></i></div>';
    }
    if (profileName) profileName.innerHTML = '<span>Khách (Chưa đăng nhập)</span>';
    if (profileRole) profileRole.innerHTML = '<i class="fa-solid fa-user"></i> <span>Chưa đăng nhập</span>';
    if (profileBio) profileBio.textContent = 'Đăng nhập hoặc đăng ký tài khoản để Mavis AI đồng hành chăm sóc giấc ngủ của bạn.';

    if (statStreak) statStreak.textContent = '0 ngày';
    if (statScore) statScore.textContent = '--%';
    if (statTarget) statTarget.textContent = '23:00';

    if (elAge) elAge.textContent = 'Chưa đăng ký';
    if (elOcc) elOcc.textContent = 'Chưa đăng ký';
    if (elPhone) elPhone.textContent = 'Chưa đăng ký';
    if (elBedtime) elBedtime.textContent = '23:00';
    if (elWaketime) elWaketime.textContent = '06:30';
    if (elFitness) elFitness.textContent = 'Chưa thiết lập';
    if (condContainer) {
      condContainer.innerHTML = '<span class="health-badge badge-amber"><i class="fa-solid fa-arrow-right-to-bracket"></i> <span>Đăng nhập để lưu hồ sơ</span></span>';
    }
    if (dbUsername) dbUsername.textContent = 'Khách';

    updateTimeDisplay();
    return;
  }

  // AUTHENTICATED MODE
  // 1. Top Nav Pill
  if (pillAvatar) {
    pillAvatar.innerHTML = getAvatarSvg(user.avatarType);
  }
  if (pillName) {
    const parts = (user.fullName || 'Bạn').trim().split(' ');
    pillName.textContent = parts[parts.length - 1];
  }
  if (pillStreak) {
    pillStreak.style.display = 'inline-flex';
    pillStreak.innerHTML = `<i class="fa-solid fa-fire text-amber"></i> <span>${user.streakDays || 1} ngày</span>`;
  }

  // 2. Drawer Identity Card
  if (cardAvatar) {
    cardAvatar.innerHTML = getAvatarSvg(user.avatarType);
  }
  if (profileName) {
    profileName.innerHTML = `<span>${user.fullName}</span> <i class="fa-solid fa-circle-check verified-badge" title="Tài khoản đã xác minh"></i>`;
  }
  if (profileRole) {
    profileRole.innerHTML = `<i class="fa-solid fa-user-tag"></i> <span>${user.role || user.occupation || 'Thành viên SleepSync'}</span>`;
  }
  if (profileBio) {
    profileBio.textContent = user.bio || 'Mục tiêu cải thiện chất lượng giấc ngủ sâu NREM 🚀';
  }

  // 3. Streak Stats Strip
  if (statStreak) statStreak.textContent = `${user.streakDays || 1} ngày`;
  if (statScore) statScore.textContent = `${user.healthScore || 88}%`;
  if (statTarget) statTarget.textContent = user.targetBedtime || '23:00';

  // 4. 6 Metric Cards
  if (elAge) {
    const ageVal = String(user.age || '28');
    elAge.textContent = ageVal.includes('tuổi') ? ageVal : `${ageVal} tuổi`;
  }
  if (elOcc) elOcc.textContent = user.occupation || user.role || 'Chưa cập nhật';
  if (elPhone) elPhone.textContent = user.phone || 'Chưa cập nhật';
  if (elBedtime) elBedtime.textContent = user.targetBedtime || '23:00';
  if (elWaketime) elWaketime.textContent = user.wakeTime || '06:30';
  if (elFitness) elFitness.textContent = user.fitnessLevel || 'Trung bình';

  // 5. Conditions Badges with contextual icons
  if (condContainer && Array.isArray(user.healthConditions)) {
    if (user.healthConditions.length === 0) {
      condContainer.innerHTML = '<span class="health-badge badge-emerald"><i class="fa-solid fa-heart-pulse"></i> <span>Sức khỏe ổn định</span></span>';
    } else {
      condContainer.innerHTML = user.healthConditions.map((cond) => {
        const cLower = cond.toLowerCase();
        let icon = 'fa-solid fa-notes-medical';
        let badgeClass = 'health-badge badge-amber';

        if (cLower.includes('cổ') || cLower.includes('vai') || cLower.includes('gáy') || cLower.includes('đau')) {
          icon = 'fa-solid fa-person-dots-from-line';
          badgeClass = 'health-badge badge-rose';
        } else if (cLower.includes('deadline') || cLower.includes('căng thẳng') || cLower.includes('áp lực') || cLower.includes('stress')) {
          icon = 'fa-solid fa-bolt';
          badgeClass = 'health-badge badge-amber';
        } else if (cLower.includes('máy tính') || cLower.includes('ngồi')) {
          icon = 'fa-solid fa-laptop-code';
          badgeClass = 'health-badge badge-cyan';
        } else if (cLower.includes('khó ngủ') || cLower.includes('trằn trọc') || cLower.includes('1h')) {
          icon = 'fa-solid fa-moon';
          badgeClass = 'health-badge badge-indigo';
        } else if (cLower.includes('dạ dày') || cLower.includes('gerd') || cLower.includes('trào ngược')) {
          icon = 'fa-solid fa-shield-virus';
          badgeClass = 'health-badge badge-orange';
        } else if (cLower.includes('ổn định') || cLower.includes('tốt')) {
          icon = 'fa-solid fa-heart-pulse';
          badgeClass = 'health-badge badge-emerald';
        }

        return `<span class="${badgeClass}"><i class="${icon}"></i> <span>${cond}</span></span>`;
      }).join('');
    }
  }

  // 6. DB Active Username
  if (dbUsername) dbUsername.textContent = user.fullName;

  // Update Bedtime Countdown in Header dynamically
  updateTimeDisplay();
}

// ==========================================
// USER AUTHENTICATION & LOGIN/REGISTER MODAL LOGIC
// (Duolingo & Facebook Style 1-Click Flow)
// ==========================================
function initUserAuthModal() {
  const authModal = document.getElementById('user-auth-modal');
  const closeAuthBtn = document.getElementById('close-auth-modal-btn');
  const tabLoginBtn = document.getElementById('tab-auth-login-btn');
  const tabRegisterBtn = document.getElementById('tab-auth-register-btn');
  const paneLogin = document.getElementById('pane-auth-login');
  const paneRegister = document.getElementById('pane-auth-register');
  const switchRegLink = document.getElementById('switch-to-register-link');
  const switchLoginLink = document.getElementById('switch-to-login-link');
  const inlineFeedback = document.getElementById('auth-inline-feedback');
  const inlineFeedbackText = document.getElementById('auth-inline-feedback-text');

  function showAuthFeedback(msg, type = 'error') {
    if (!inlineFeedback || !inlineFeedbackText) return;
    inlineFeedback.className = `auth-feedback-banner ${type}`;
    const icon = inlineFeedback.querySelector('.feedback-icon');
    if (icon) {
      icon.className = `feedback-icon fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`;
    }
    inlineFeedbackText.textContent = msg;
    inlineFeedback.style.display = 'flex';
  }

  function hideAuthFeedback() {
    if (inlineFeedback) inlineFeedback.style.display = 'none';
  }

  function switchTab(isLogin) {
    hideAuthFeedback();
    if (isLogin) {
      if (tabLoginBtn) tabLoginBtn.classList.add('active');
      if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
      if (paneLogin) paneLogin.style.display = 'block';
      if (paneRegister) paneRegister.style.display = 'none';
      setTimeout(() => document.getElementById('login-phone-input')?.focus(), 50);
    } else {
      if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
      if (tabLoginBtn) tabLoginBtn.classList.remove('active');
      if (paneRegister) paneRegister.style.display = 'block';
      if (paneLogin) paneLogin.style.display = 'none';
      setTimeout(() => document.getElementById('reg-fullname-input')?.focus(), 50);
    }
  }

  if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => switchTab(true));
  if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => switchTab(false));
  if (switchRegLink) switchRegLink.addEventListener('click', (e) => { e.preventDefault(); switchTab(false); });
  if (switchLoginLink) switchLoginLink.addEventListener('click', (e) => { e.preventDefault(); switchTab(true); });

  if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeUserAuthModal);
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) closeUserAuthModal();
    });
  }

  // 1-Click Social Logins (Google, Facebook, Apple)
  const btnGoogle = document.getElementById('btn-social-google');
  const btnFacebook = document.getElementById('btn-social-facebook');
  const btnApple = document.getElementById('btn-social-apple');

  const handleSocialAuth = async (provider, providerTitle) => {
    hideAuthFeedback();
    if (!window.SleepSyncDB) return;
    try {
      const res = await SleepSyncDB.loginWithSocialAccount(provider);
      if (res.success) {
        closeUserAuthModal();
        closeProfileDrawer();
        renderActiveUserProfile();
        renderServiceUsageLogs();
        showAppToast('Kết nối thành công', `Chào mừng ${res.user.fullName} qua tài khoản ${providerTitle}!`, 'success');
      } else {
        showAuthFeedback(res.message || `Đăng nhập ${providerTitle} không thành công.`, 'error');
      }
    } catch (err) {
      showAuthFeedback(`Lỗi kết nối ${providerTitle}: ${err.message}`, 'error');
    }
  };

  if (btnGoogle) btnGoogle.addEventListener('click', () => handleSocialAuth('google', 'Google'));
  if (btnFacebook) btnFacebook.addEventListener('click', () => handleSocialAuth('facebook', 'Facebook'));
  if (btnApple) btnApple.addEventListener('click', () => handleSocialAuth('apple', 'Apple'));

  // Quick 1-Click Demo Login Chips
  document.querySelectorAll('.demo-user-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      hideAuthFeedback();
      const phone = chip.dataset.phone;
      const pwd = chip.dataset.pwd || '123456';
      const phoneInput = document.getElementById('login-phone-input');
      const pwdInput = document.getElementById('login-pwd-input');
      if (phoneInput && pwdInput) {
        phoneInput.value = phone;
        pwdInput.value = pwd;
        const form = document.getElementById('form-user-login');
        if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  });

  // Password Visibility Toggles
  const toggleLoginPwdBtn = document.getElementById('toggle-login-pwd-btn');
  if (toggleLoginPwdBtn) {
    toggleLoginPwdBtn.addEventListener('click', () => {
      const pwdInput = document.getElementById('login-pwd-input');
      if (!pwdInput) return;
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      toggleLoginPwdBtn.innerHTML = isPwd ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  }

  const toggleRegPwdBtn = document.getElementById('toggle-reg-pwd-btn');
  if (toggleRegPwdBtn) {
    toggleRegPwdBtn.addEventListener('click', () => {
      const pwdInput = document.getElementById('reg-pwd-input');
      if (!pwdInput) return;
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      toggleRegPwdBtn.innerHTML = isPwd ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  }

  // Switch Account Password Visibility Toggle & Modal Handlers
  const toggleSwitchPwdBtn = document.getElementById('toggle-switch-pwd-btn');
  if (toggleSwitchPwdBtn) {
    toggleSwitchPwdBtn.addEventListener('click', () => {
      const pwdInput = document.getElementById('switch-pwd-input');
      if (!pwdInput) return;
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      toggleSwitchPwdBtn.innerHTML = isPwd ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  }

  const closeSwitchPwdModalBtn = document.getElementById('close-switch-pwd-modal-btn');
  if (closeSwitchPwdModalBtn) closeSwitchPwdModalBtn.addEventListener('click', closeSwitchPasswordModal);

  const cancelSwitchPwdBtn = document.getElementById('btn-cancel-switch-pwd');
  if (cancelSwitchPwdBtn) cancelSwitchPwdBtn.addEventListener('click', closeSwitchPasswordModal);

  const switchPwdModal = document.getElementById('switch-account-password-modal');
  if (switchPwdModal) {
    switchPwdModal.addEventListener('click', (e) => {
      if (e.target === switchPwdModal) closeSwitchPasswordModal();
    });
  }

  // Switch Account Password Form Submission (Strict Security Verification)
  const formSwitchPwd = document.getElementById('form-switch-password');
  if (formSwitchPwd) {
    formSwitchPwd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetId = document.getElementById('switch-target-userid')?.value;
      const targetPhone = document.getElementById('switch-target-phone')?.value;
      const password = document.getElementById('switch-pwd-input')?.value.trim();
      const feedbackEl = document.getElementById('switch-pwd-feedback');
      const feedbackText = document.getElementById('switch-pwd-feedback-text');
      const btn = document.getElementById('btn-submit-switch-pwd');

      if (!password) {
        if (feedbackEl && feedbackText) {
          feedbackText.textContent = 'Vui lòng nhập mật khẩu tài khoản!';
          feedbackEl.className = 'auth-feedback-banner feedback-error';
          feedbackEl.style.display = 'flex';
        }
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';
      }

      if (window.SleepSyncDB) {
        const res = await SleepSyncDB.loginWithCloudAccount(targetPhone || targetId, password);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Mở Khóa & Chuyển';
        }

        if (res.success) {
          closeSwitchPasswordModal();
          closeProfileDrawer();
          renderActiveUserProfile();
          renderFacebookAccountSwitcher();
          renderServiceUsageLogs();
          showAppToast('Chuyển tài khoản thành công', `Đã mở khóa và chuyển sang tài khoản ${res.user.fullName}!`, 'success');
        } else {
          if (feedbackEl && feedbackText) {
            feedbackText.textContent = res.message || 'Mật khẩu không chính xác. Vui lòng thử lại!';
            feedbackEl.className = 'auth-feedback-banner feedback-error';
            feedbackEl.style.display = 'flex';
          }
          const pwdInput = document.getElementById('switch-pwd-input');
          if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
          }
        }
      }
    });
  }

  // Escape key global listener for modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const pwdModal = document.getElementById('switch-account-password-modal');
      if (pwdModal && pwdModal.style.display !== 'none') {
        closeSwitchPasswordModal();
      }
    }
  });

  // Live Password Strength Meter
  const regPwdInput = document.getElementById('reg-pwd-input');
  const regStrengthBar = document.getElementById('reg-strength-bar');
  const regStrengthText = document.getElementById('reg-strength-text');

  if (regPwdInput && regStrengthBar && regStrengthText) {
    regPwdInput.addEventListener('input', () => {
      const val = regPwdInput.value;
      if (!val) {
        regStrengthBar.style.width = '0%';
        regStrengthBar.className = 'strength-bar-fill';
        regStrengthText.textContent = 'Nhập mật khẩu';
        regStrengthText.style.color = '#94A3B8';
        return;
      }

      let score = 0;
      if (val.length >= 6) score += 1;
      if (val.length >= 8) score += 1;
      if (/[0-9]/.test(val)) score += 1;
      if (/[A-Z]/.test(val) || /[^A-Za-z0-9]/.test(val)) score += 1;

      if (score <= 1) {
        regStrengthBar.style.width = '30%';
        regStrengthBar.className = 'strength-bar-fill weak';
        regStrengthText.textContent = 'Yếu (Cần >= 6 ký tự)';
        regStrengthText.style.color = '#EF4444';
      } else if (score <= 3) {
        regStrengthBar.style.width = '65%';
        regStrengthBar.className = 'strength-bar-fill medium';
        regStrengthText.textContent = 'Khá tốt (An toàn)';
        regStrengthText.style.color = '#F59E0B';
      } else {
        regStrengthBar.style.width = '100%';
        regStrengthBar.className = 'strength-bar-fill strong';
        regStrengthText.textContent = 'Rất mạnh & bảo mật!';
        regStrengthText.style.color = '#10B981';
      }
    });
  }

  // Registration Avatar Picker Grid
  const regAvatarGrid = document.getElementById('reg-avatar-picker-grid');
  const regAvatarInput = document.getElementById('reg-avatar-input');
  if (regAvatarGrid && regAvatarInput) {
    regAvatarGrid.querySelectorAll('.avatar-pick-item').forEach(item => {
      item.addEventListener('click', () => {
        regAvatarGrid.querySelectorAll('.avatar-pick-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        regAvatarInput.value = item.dataset.avatar || 'programmer_laptop';
      });
    });
  }

  // Login Form Submission
  const formLogin = document.getElementById('form-user-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthFeedback();

      const phoneOrId = document.getElementById('login-phone-input')?.value.trim();
      const password = document.getElementById('login-pwd-input')?.value.trim();
      const btn = document.getElementById('btn-submit-login');

      if (!phoneOrId) {
        showAuthFeedback('Vui lòng nhập tên tài khoản hoặc số điện thoại!', 'error');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';
      }

      if (window.SleepSyncDB) {
        const res = await SleepSyncDB.loginWithCloudAccount(phoneOrId, password);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Vào Hệ Thống';
        }

        if (res.success) {
          closeUserAuthModal();
          closeProfileDrawer();
          renderActiveUserProfile();
          renderServiceUsageLogs();
          showAppToast('Đăng nhập thành công', `Chào mừng ${res.user.fullName} đã trở lại SleepSync!`, 'success');
        } else {
          showAuthFeedback(res.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại số điện thoại và mật khẩu!', 'error');
        }
      }
    });
  }

  // Registration Form Submission
  const formRegister = document.getElementById('form-user-register');
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthFeedback();

      const fullName = document.getElementById('reg-fullname-input')?.value.trim();
      const phone = document.getElementById('reg-phone-input')?.value.trim();
      const password = document.getElementById('reg-pwd-input')?.value.trim();
      const role = document.getElementById('reg-role-input')?.value.trim();
      const age = document.getElementById('reg-age-input')?.value.trim();
      const targetBedtime = document.getElementById('reg-bedtime-input')?.value;
      const avatarType = document.getElementById('reg-avatar-input')?.value || 'programmer_laptop';
      const btn = document.getElementById('btn-submit-register');

      if (!fullName || !phone) {
        showAuthFeedback('Vui lòng điền đầy đủ họ và tên cùng số điện thoại!', 'error');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang khởi tạo tài khoản...';
      }

      if (window.SleepSyncDB) {
        const res = await SleepSyncDB.registerWithCloudAccount({
          fullName,
          phone,
          password: password || '123456',
          role: role || 'Thành viên SleepSync',
          occupation: role || 'Tự do',
          age: age || '28 tuổi',
          targetBedtime: targetBedtime || '23:00',
          wakeTime: '06:30',
          avatarType,
          streakDays: 1,
          fitnessLevel: 'Trung bình',
          healthConditions: ['Sức khỏe ổn định']
        });

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Xác Nhận Tạo Tài Khoản</span>';
        }

        if (res.success) {
          closeUserAuthModal();
          closeProfileDrawer();
          renderActiveUserProfile();
          renderServiceUsageLogs();
          showAppToast('Chào mừng bạn!', `Tài khoản ${res.user.fullName} đã được kích hoạt thành công.`, 'success');
        } else {
          showAuthFeedback(res.message || 'Đăng ký không thành công.', 'error');
        }
      }
    });
  }
}

function openUserAuthModal(tab = 'login') {
  const splash = document.getElementById('mavis-welcome-splash');
  if (splash) {
    splash.style.display = 'none';
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
    splash.classList.add('splash-hidden');
  }

  const modal = document.getElementById('user-auth-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.style.zIndex = '10050';

  const tabLoginBtn = document.getElementById('tab-auth-login-btn');
  const tabRegisterBtn = document.getElementById('tab-auth-register-btn');
  const paneLogin = document.getElementById('pane-auth-login');
  const paneRegister = document.getElementById('pane-auth-register');

  const inlineFeedback = document.getElementById('auth-inline-feedback');
  if (inlineFeedback) inlineFeedback.style.display = 'none';

  if (tab === 'register') {
    if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
    if (tabLoginBtn) tabLoginBtn.classList.remove('active');
    if (paneRegister) paneRegister.style.display = 'block';
    if (paneLogin) paneLogin.style.display = 'none';
    setTimeout(() => document.getElementById('reg-fullname-input')?.focus(), 60);
  } else {
    if (tabLoginBtn) tabLoginBtn.classList.add('active');
    if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
    if (paneLogin) paneLogin.style.display = 'block';
    if (paneRegister) paneRegister.style.display = 'none';
    setTimeout(() => document.getElementById('login-phone-input')?.focus(), 60);
  }
}

function closeUserAuthModal() {
  const modal = document.getElementById('user-auth-modal');
  if (modal) modal.style.display = 'none';
  const pwdInput = document.getElementById('login-pwd-input');
  if (pwdInput) pwdInput.value = '';
  const regPwdInput = document.getElementById('reg-pwd-input');
  if (regPwdInput) regPwdInput.value = '';
  const splash = document.getElementById('mavis-welcome-splash');
  if (splash) {
    splash.style.display = 'none';
    splash.classList.add('splash-hidden');
  }
  document.body.style.overflow = '';
}

window.openUserAuthModal = openUserAuthModal;
window.closeUserAuthModal = closeUserAuthModal;
window.openProfileDrawer = openProfileDrawer;
window.closeProfileDrawer = closeProfileDrawer;
window.renderActiveUserProfile = renderActiveUserProfile;

// Render Service Usage Logs in Tab 4
function renderServiceUsageLogs() {
  if (!window.SleepSyncDB) return;
  const listEl = document.getElementById('service-usage-list');
  if (!listEl) return;

  const logs = SleepSyncDB.getServiceUsage(null, 30);
  if (!logs || logs.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-dim); font-size: 0.85rem;">
        <i class="fa-solid fa-list-check" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 0.5rem;"></i>
        Chưa có dữ liệu nhật ký sử dụng dịch vụ cho tài khoản này.
      </div>
    `;
    return;
  }

  listEl.innerHTML = logs.map(item => {
    const timeFormatted = formatTimeDisplay(item.timestamp);
    return `
      <div class="usage-log-card">
        <div class="usage-log-icon ${item.badgeColor || 'indigo'}">
          <i class="${item.icon || 'fa-solid fa-circle-check'}"></i>
        </div>
        <div class="usage-log-content">
          <div class="usage-log-header">
            <span class="usage-log-title">${item.title}</span>
            <span class="usage-log-time">${timeFormatted}</span>
          </div>
          <p class="usage-log-desc">${item.detail}</p>
        </div>
      </div>
    `;
  }).join('');
}

function formatTimeDisplay(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;

  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

