/* One conversation shared by the floating assistant, Chat and Gemini Live. */
let talkRequest = null;
let liveConversation = null;
let conversationOwner = null;
let liveBubbles = {};

function currentTalkOwner() {
  const user = window.SleepSyncDB?.isAuthenticated() ? SleepSyncDB.getCurrentUser() : null;
  return user?.id || 'guest';
}

function saveTalkHistory() {
  if (!conversationOwner) return;
  try {
    localStorage.setItem('sleepsync_conversation_' + conversationOwner,
      JSON.stringify(AppState.talkState.history.slice(-40)));
  } catch { /* Conversation still works when browser storage is unavailable. */ }
}

function buildTalkContext() {
  const db = window.SleepSyncDB;
  const user = db?.isAuthenticated() ? db.getCurrentUser() : null;
  const profile = user ? Object.fromEntries([
    'fullName', 'age', 'occupation', 'targetBedtime', 'wakeTime', 'healthConditions', 'bio', 'fitnessLevel',
  ].filter(key => user[key] !== undefined).map(key => [key, user[key]])) : null;
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
    profile,
    assessment: AppState.assistantAssessment?.ownerId === currentTalkOwner() ? {
      answers: AppState.assistantAssessment.answers, customAnswers: AppState.assistantAssessment.customAnswers,
      summary: AppState.assistantAssessment.summary,
    } : null,
    recentSleepRecords: db?.getCurrentUserDiagnoses?.().slice(0, 5).map(record => ({
      timestamp: record.timestamp, answers: record.answers, customAnswers: record.customAnswers,
      summary: record.summary,
    })) || [],
    calendar: AppState.calendarEvents.filter(event => event.ownerId === currentTalkOwner())
      .map(event => ({ title: event.title, time: event.time, busy: event.busy })),
  };
}

function renderTalkContext() {
  const context = buildTalkContext();
  const box = document.getElementById('talk-context-summary');
  box.replaceChildren();
  const lines = [
    context.profile ? `Hồ sơ: ${context.profile.fullName || 'Tài khoản hiện tại'}` : 'Đang trò chuyện ở chế độ khách',
    `Múi giờ: ${context.timezone}`,
    context.assessment ? 'Có dữ liệu đánh giá hiện tại' : 'Chưa có đánh giá được xác nhận trong phiên này',
    `Nhật ký gần đây: ${context.recentSleepRecords.length}`,
    `Sự kiện đã nhập trong phiên này: ${context.calendar.length}`,
    'Nội dung hội thoại được lưu trên trình duyệt này, riêng theo tài khoản.',
  ];
  lines.forEach(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    box.appendChild(paragraph);
  });
}

function initTalkMode() {
  const input = document.getElementById('talk-text-input');
  const send = document.getElementById('talk-send-btn');
  send.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text || AppState.talkState.pending) return;
    input.value = '';
    handleUserTalkInput(text);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); send.click(); }
  });
  ['voice', 'chat'].forEach(mode => {
    document.getElementById(`talk-mode-${mode}`).addEventListener('click', () => setTalkMode(mode));
  });
  document.getElementById('talk-mic-btn').addEventListener('click', toggleTalkMic);
  document.getElementById('restart-talk-btn').addEventListener('click', () => startTalkConversation(true));
  document.getElementById('voice-replay-btn').addEventListener('click', () => {
    if (!liveConversation?.replay()) updateVoiceStatus('Chưa có âm thanh để nghe lại trong phiên Voice này.');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTalkAudio(); });
  window.addEventListener('pagehide', stopTalkAudio);
  const syncOwner = () => {
    if (currentTalkOwner() !== conversationOwner) startTalkConversation();
    else renderTalkContext();
  };
  ['sleepsync:user-changed', 'sleepsync:user-logged-out', 'sleepsync:cloud-synced'].forEach(name =>
    window.addEventListener(name, syncOwner));
  window.addEventListener('sleepsync:user-updated', () => {
    stopTalkAudio();
    renderTalkContext();
  });
}

function startTalkConversation(reset = false) {
  stopTalkAudio();
  talkRequest?.abort();
  talkRequest = null;
  setTalkPending(false);
  document.getElementById('talk-messages-box').querySelector('.talk-pending')?.remove();
  conversationOwner = currentTalkOwner();
  let history = [];
  if (!reset) {
    try {
      history = JSON.parse(localStorage.getItem('sleepsync_conversation_' + conversationOwner) || '[]');
      if (!Array.isArray(history)) history = [];
      history = history.filter(message => ['user', 'ai'].includes(message?.role) &&
        typeof message.text === 'string' && message.text.length <= 12000).slice(-40);
    } catch { history = []; }
  }
  AppState.talkState.history = history;
  const box = document.getElementById('talk-messages-box');
  box.replaceChildren();
  history.forEach(message => renderTalkMessage(message.role, message.text));
  if (!history.length) {
    addAiTalkMessage('Chào bạn, mình là Mavis. Bạn muốn trao đổi về giấc ngủ hay sắp xếp sinh hoạt hôm nay?');
  }
  saveTalkHistory();
  renderTalkContext();
}

function renderTalkMessage(role, text) {
  const box = document.getElementById('talk-messages-box');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ' + (role === 'ai' ? 'ai' : 'user');
  if (role === 'ai') {
    const label = document.createElement('strong');
    label.textContent = 'Mavis';
    bubble.append(label, document.createElement('br'));
  }
  const content = document.createElement('span');
  content.className = 'talk-message-text';
  content.textContent = text;
  bubble.append(content);
  box.append(bubble);
  box.scrollTop = box.scrollHeight;
  return content;
}

function addAiTalkMessage(text) {
  AppState.talkState.history.push({ role: 'ai', text });
  renderTalkMessage('ai', text);
  saveTalkHistory();
}

function addUserTalkMessage(text) {
  AppState.talkState.history.push({ role: 'user', text });
  renderTalkMessage('user', text);
  saveTalkHistory();
}

function setTalkPending(pending) {
  AppState.talkState.pending = pending;
  const sendBtn = document.getElementById('talk-send-btn');
  const micBtn = document.getElementById('talk-mic-btn');
  const box = document.getElementById('talk-messages-box');
  if (sendBtn) sendBtn.disabled = pending;
  if (micBtn) micBtn.disabled = pending;
  if (box) box.setAttribute('aria-busy', String(pending));
}

async function handleUserTalkInput(text, reuseFailedTurn = false) {
  if (AppState.talkState.pending || !text.trim()) return;
  if (text.length > 12000) {
    showAppToast('Tin nhắn quá dài', 'Hãy gửi tối đa 12.000 ký tự mỗi lần.', 'info');
    return;
  }
  stopTalkAudio();
  if (!reuseFailedTurn) addUserTalkMessage(text);
  const failedTurn = AppState.talkState.history.at(-1);
  setTalkPending(true);
  const pending = document.createElement('div');
  pending.className = 'talk-pending';
  pending.setAttribute('role', 'status');
  pending.textContent = 'Mavis đang trả lời...';
  const box = document.getElementById('talk-messages-box');
  box.append(pending);
  box.scrollTop = box.scrollHeight;
  const controller = new AbortController();
  talkRequest = controller;
  const timeout = setTimeout(() => controller.abort('timeout'), 50000);
  try {
    const data = await SleepAssistant.chat({
      history: AppState.talkState.history.slice(-40), context: buildTalkContext(),
    }, controller.signal);
    if (controller.signal.aborted || talkRequest !== controller) return;
    addAiTalkMessage(data.answer);
  } catch (error) {
    if (talkRequest !== controller) return;
    if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
    const message = controller.signal.reason === 'timeout' ? 'Gemini phản hồi quá lâu. Bạn có thể thử lại.' : error.message;
    const errorBox = document.createElement('div');
    errorBox.className = 'talk-error';
    errorBox.setAttribute('role', 'alert');
    const label = document.createElement('p');
    label.textContent = message;
    const retry = document.createElement('button');
    retry.className = 'btn-secondary';
    retry.textContent = 'Thử lại';
    retry.onclick = () => {
      if (AppState.talkState.pending) return;
      errorBox.remove();
      // Reuse only this failed turn; older retry buttons never delete later replies.
      handleUserTalkInput(text, AppState.talkState.history.at(-1) === failedTurn);
    };
    errorBox.append(label, retry);
    box.append(errorBox);
  } finally {
    clearTimeout(timeout);
    pending.remove();
    if (talkRequest === controller) { talkRequest = null; setTalkPending(false); }
  }
}

function updateVoiceStatus(text) {
  document.getElementById('voice-status').textContent = text;
}

function flushLiveTranscripts() {
  liveBubbles = {};
  saveTalkHistory();
}

function stopTalkAudio() {
  if (liveConversation) { liveConversation.close(); liveConversation = null; }
  flushLiveTranscripts();
  AppState.talkState.isListening = false;
  const button = document.getElementById('talk-mic-btn');
  button.classList.remove('recording');
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'Bắt đầu cuộc trò chuyện giọng nói');
  document.getElementById('voice-mic-label').textContent = 'Bắt đầu trò chuyện';
  document.getElementById('voice-replay-btn').disabled = true;
  updateVoiceStatus('Bấm micro để bắt đầu cuộc trò chuyện.');
}

function setTalkMode(mode) {
  window.closeChatbot?.(false);
  stopTalkAudio();
  AppState.talkState.mode = mode;
  ['voice', 'chat'].forEach(key => {
    const button = document.getElementById(`talk-mode-${key}`);
    button.classList.toggle('active', key === mode);
    button.setAttribute('aria-pressed', String(key === mode));
  });
  const voice = mode === 'voice';
  document.getElementById('voice-controls').hidden = !voice;
  document.getElementById('chat-controls').hidden = voice;
  document.getElementById('talk-mode-title').textContent = voice ? 'Voice · Trò chuyện với Mavis' : 'Chat · Trò chuyện với Mavis';
  document.getElementById('talk-mode-description').textContent = voice
    ? 'Bắt đầu phiên nói chuyện trực tiếp. Mavis tiếp nối nội dung bạn đã chat.'
    : 'Nhắn cho Mavis về giấc ngủ hoặc lịch sinh hoạt của bạn.';
  if (!voice) document.getElementById('talk-text-input').focus({ preventScroll: true });
  renderTalkContext();
}

async function toggleTalkMic() {
  window.stopFloatingChatMic?.();
  if (AppState.currentTab !== 'talk' || AppState.talkState.mode !== 'voice' || AppState.talkState.pending) return;
  if (liveConversation) { stopTalkAudio(); return; }
  const session = new SleepAssistant.LiveConversation({
    status: updateVoiceStatus,
    transcript: (role, text) => {
      if (liveConversation !== session) return;
      // A new user turn can interrupt an AI turn before turnComplete arrives.
      if (role === 'user' && liveBubbles.ai) flushLiveTranscripts();
      if (!liveBubbles[role]) {
        const message = { role, text: '' };
        AppState.talkState.history.push(message);
        liveBubbles[role] = { message, element: renderTalkMessage(role, '') };
      }
      liveBubbles[role].message.text += text;
      liveBubbles[role].element.textContent = liveBubbles[role].message.text;
      saveTalkHistory();
      const box = document.getElementById('talk-messages-box');
      box.scrollTop = box.scrollHeight;
    },
    interrupted: flushLiveTranscripts,
    turnComplete: () => {
      flushLiveTranscripts();
      document.getElementById('voice-replay-btn').disabled = !session.lastReplyBuffers.length;
    },
    error: message => { if (liveConversation === session) { stopTalkAudio(); updateVoiceStatus(message); } },
  });
  liveConversation = session;
  const button = document.getElementById('talk-mic-btn');
  button.setAttribute('aria-pressed', 'true');
  button.setAttribute('aria-label', 'Kết thúc cuộc trò chuyện giọng nói');
  button.classList.add('recording');
  document.getElementById('voice-mic-label').textContent = 'Kết thúc trò chuyện';
  updateVoiceStatus('Đang mở micro và kết nối Gemini Live...');
  try {
    await session.start({ history: AppState.talkState.history.slice(-40), context: buildTalkContext() });
    if (liveConversation === session) AppState.talkState.isListening = true;
  } catch (error) {
    if (liveConversation !== session) return;
    stopTalkAudio();
    updateVoiceStatus(error.message);
  }
}

// Floating Chatbot: Mavis - Trợ Lý Giấc Ngủ (hoạt động độc lập, không đồng bộ nội dung khi voice trò chuyện với Mavis)
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('ai-chatbot-window');
  const fab = document.getElementById('floating-profile-fab');
  const chatbotMessagesBox = document.getElementById('chatbot-messages');
  const input = document.getElementById('chatbot-text-input');
  const mic = document.getElementById('chatbot-mic-btn');
  const status = document.getElementById('chatbot-mic-status');
  const sendBtn = document.getElementById('chatbot-send-btn');

  let chatbotOwner = null;
  let chatbotHistory = [];
  let chatbotPending = false;
  let chatbotRequest = null;
  let recognition = null;
  let pointer = null;
  let dragged = false;

  function currentChatbotOwner() {
    const user = window.SleepSyncDB?.isAuthenticated() ? SleepSyncDB.getCurrentUser() : null;
    return user?.id || 'guest';
  }

  function saveChatbotHistory() {
    if (!chatbotOwner) return;
    try {
      localStorage.setItem('sleepsync_chatbot_history_' + chatbotOwner,
        JSON.stringify(chatbotHistory.slice(-30)));
    } catch { /* Fallback when storage is unavailable */ }
  }

  function renderChatbotMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (role === 'ai' ? 'ai' : 'user');
    if (role === 'ai') {
      const label = document.createElement('strong');
      label.textContent = 'Mavis';
      bubble.append(label, document.createElement('br'));
    }
    const content = document.createElement('span');
    content.className = 'talk-message-text';
    content.textContent = text;
    bubble.append(content);
    chatbotMessagesBox.append(bubble);
    chatbotMessagesBox.scrollTop = chatbotMessagesBox.scrollHeight;
    return content;
  }

  function loadChatbotHistory(reset = false) {
    chatbotRequest?.abort();
    chatbotRequest = null;
    setChatbotPending(false);
    chatbotOwner = currentChatbotOwner();
    let history = [];
    if (!reset) {
      try {
        history = JSON.parse(localStorage.getItem('sleepsync_chatbot_history_' + chatbotOwner) || '[]');
        if (!Array.isArray(history)) history = [];
        history = history.filter(message => ['user', 'ai'].includes(message?.role) &&
          typeof message.text === 'string' && message.text.length <= 12000).slice(-30);
      } catch { history = []; }
    }
    chatbotHistory = history;
    chatbotMessagesBox.replaceChildren();
    if (!history.length) {
      const greeting = 'Chào bạn! Mình là Mavis - Trợ lý giấc ngủ. Bạn muốn hỏi hay tra cứu thông tin gì về giấc ngủ hôm nay? 🌙';
      chatbotHistory.push({ role: 'ai', text: greeting });
      renderChatbotMessage('ai', greeting);
    } else {
      history.forEach(message => renderChatbotMessage(message.role, message.text));
    }
    saveChatbotHistory();
    syncBadge();
  }

  function setChatbotPending(pending) {
    chatbotPending = pending;
    if (sendBtn) sendBtn.disabled = pending;
    if (mic) mic.disabled = pending;
    panel.querySelectorAll('.quick-chip').forEach(button => { button.disabled = pending; });
    chatbotMessagesBox.setAttribute('aria-busy', String(pending));
  }

  async function handleChatbotInput(text, reuseFailedTurn = false) {
    if (chatbotPending || !text.trim()) return;
    if (text.length > 12000) {
      if (typeof showAppToast === 'function') {
        showAppToast('Tin nhắn quá dài', 'Hãy gửi tối đa 12.000 ký tự mỗi lần.', 'info');
      }
      return;
    }
    stopMic();
    showStatus('');
    if (!reuseFailedTurn) {
      chatbotHistory.push({ role: 'user', text });
      renderChatbotMessage('user', text);
      saveChatbotHistory();
    }
    const failedTurn = chatbotHistory.at(-1);
    setChatbotPending(true);

    const pending = document.createElement('div');
    pending.className = 'talk-pending';
    pending.setAttribute('role', 'status');
    pending.textContent = 'Mavis đang trả lời...';
    chatbotMessagesBox.append(pending);
    chatbotMessagesBox.scrollTop = chatbotMessagesBox.scrollHeight;

    const controller = new AbortController();
    chatbotRequest = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 50000);

    try {
      const data = await SleepAssistant.chat({
        history: chatbotHistory.slice(-30),
        context: buildTalkContext()
      }, controller.signal);

      if (controller.signal.aborted || chatbotRequest !== controller) return;
      chatbotHistory.push({ role: 'ai', text: data.answer });
      renderChatbotMessage('ai', data.answer);
      saveChatbotHistory();
    } catch (error) {
      if (chatbotRequest !== controller) return;
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      const message = controller.signal.reason === 'timeout'
        ? 'Gemini phản hồi quá lâu. Bạn có thể thử lại.'
        : error.message;
      const errorBox = document.createElement('div');
      errorBox.className = 'talk-error';
      errorBox.setAttribute('role', 'alert');
      const label = document.createElement('p');
      label.textContent = message;
      const retry = document.createElement('button');
      retry.className = 'btn-secondary';
      retry.textContent = 'Thử lại';
      retry.onclick = () => {
        if (chatbotPending) return;
        errorBox.remove();
        handleChatbotInput(text, chatbotHistory.at(-1) === failedTurn);
      };
      errorBox.append(label, retry);
      chatbotMessagesBox.append(errorBox);
    } finally {
      clearTimeout(timeout);
      pending.remove();
      if (chatbotRequest === controller) {
        chatbotRequest = null;
        setChatbotPending(false);
      }
    }
  }

  function placeFab(left, top) {
    const width = fab.offsetWidth, height = fab.offsetHeight;
    fab.style.setProperty('left', Math.max(8, Math.min(innerWidth - width - 8, left)) + 'px', 'important');
    fab.style.setProperty('top', Math.max(8, Math.min(innerHeight - height - 8, top)) + 'px', 'important');
    fab.style.setProperty('right', 'auto', 'important');
    fab.style.setProperty('bottom', 'auto', 'important');
  }

  try {
    const saved = JSON.parse(localStorage.getItem('sleepsync_fab_pos_v2') || 'null');
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) placeFab(saved.left, saved.top);
  } catch { /* Default to bottom left via CSS */ }

  function showStatus(text) {
    status.textContent = text;
    status.hidden = !text;
  }

  function stopMic() {
    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.abort();
      recognition = null;
    }
    mic.classList.remove('listening');
    mic.setAttribute('aria-pressed', 'false');
    mic.setAttribute('aria-label', 'Nhập bằng giọng nói');
    showStatus('');
  }
  window.stopFloatingChatMic = stopMic;

  function syncBadge() {
    const profile = buildTalkContext().profile;
    const badge = document.getElementById('chatbot-user-sync-badge');
    if (!badge) return;
    badge.textContent = profile
      ? `🟢 Mavis: ${profile.fullName || 'Tài khoản hiện tại'} (${profile.targetBedtime || 'chưa đặt giờ ngủ'})`
      : '🟢 Sẵn sàng hỗ trợ · Chế độ khách';
  }

  function positionPanel() {
    if (panel.hidden) return;
    const height = window.visualViewport?.height || innerHeight;
    if (innerWidth <= 768) {
      panel.style.setProperty('top', 'auto', 'important');
      panel.style.setProperty('bottom', '0', 'important');
      panel.style.setProperty('left', '0', 'important');
      panel.style.setProperty('right', '0', 'important');
      panel.style.setProperty('width', '100vw', 'important');
      panel.style.setProperty('max-width', '100vw', 'important');
      panel.style.setProperty('height', Math.round(height * 0.85) + 'px', 'important');
      panel.style.setProperty('max-height', Math.round(height * 0.85) + 'px', 'important');
      panel.style.setProperty('border-radius', '20px 20px 0 0', 'important');
      return;
    }
    const width = Math.min(420, innerWidth - 32);
    const panelHeight = Math.min(590, height - 112);
    const star = fab.getBoundingClientRect();
    const isLeft = (star.left + star.width / 2) < (innerWidth / 2);
    const left = isLeft
      ? Math.max(16, Math.min(innerWidth - width - 16, star.left))
      : Math.max(16, Math.min(innerWidth - width - 16, star.right - width));
    const top = Math.max(16, Math.min(height - panelHeight - 16, star.top - panelHeight - 12));
    for (const [key, value] of Object.entries({ left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto', height: `${panelHeight}px`, 'max-height': `${panelHeight}px` })) {
      panel.style.setProperty(key, value, 'important');
    }
    panel.style.transformOrigin = isLeft ? 'bottom left' : 'bottom right';
  }

  function open() {
    if (chatbotOwner !== currentChatbotOwner() || !chatbotHistory.length) {
      loadChatbotHistory();
    }
    panel.hidden = false;
    panel.classList.add('active');
    fab.setAttribute('aria-expanded', 'true');
    syncBadge();
    positionPanel();
    chatbotMessagesBox.scrollTop = chatbotMessagesBox.scrollHeight;
    input.focus({ preventScroll: true });
  }

  function close(returnFocus = true) {
    if (panel.hidden) return;
    stopMic();
    showStatus('');
    panel.hidden = true;
    panel.classList.remove('active');
    fab.setAttribute('aria-expanded', 'false');
    if (returnFocus) fab.focus({ preventScroll: true });
  }

  window.openChatbot = open;
  window.closeChatbot = close;
  window.toggleChatbot = () => panel.hidden ? open() : close();

  fab.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    window.toggleChatbot();
  });
  document.getElementById('close-chatbot-btn').addEventListener('click', () => close());
  document.getElementById('clear-chat-btn').addEventListener('click', () => {
    stopMic();
    showStatus('');
    input.value = '';
    loadChatbotHistory(true);
    syncBadge();
    input.focus();
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  document.getElementById('chatbot-input-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || chatbotPending) return;
    stopMic();
    showStatus('');
    input.value = '';
    handleChatbotInput(text);
  });
  panel.querySelectorAll('.quick-chip').forEach(button => {
    button.addEventListener('click', () => {
      stopMic();
      showStatus('');
      handleChatbotInput(button.dataset.query);
    });
  });

  mic.addEventListener('click', () => {
    if (recognition) { stopMic(); showStatus('Đã dừng micro.'); return; }
    if (chatbotPending) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showStatus('Trình duyệt chưa hỗ trợ nhận diện giọng nói. Bạn có thể gõ bằng bàn phím.');
      return;
    }
    const current = new SpeechRecognition();
    recognition = current;
    current.lang = 'vi-VN';
    current.continuous = false;
    current.interimResults = true;
    current.onstart = () => {
      if (recognition !== current) return;
      mic.classList.add('listening');
      mic.setAttribute('aria-pressed', 'true');
      mic.setAttribute('aria-label', 'Dừng nói');
      showStatus('Đang lắng nghe câu hỏi của bạn...');
    };
    current.onresult = event => {
      if (recognition !== current || panel.hidden) return;
      let text = '';
      for (let index = 0; index < event.results.length; index++) text += event.results[index][0].transcript;
      input.value = text;
      if (event.results[event.results.length - 1].isFinal && text.trim()) {
        stopMic();
        showStatus('');
        input.value = '';
        handleChatbotInput(text.trim());
      }
    };
    current.onerror = event => {
      if (recognition !== current) return;
      stopMic();
      showStatus(event.error === 'not-allowed'
        ? 'Chưa được cấp quyền micro. Hãy cấp quyền trong trình duyệt rồi thử lại.'
        : 'Chưa nhận diện được giọng nói. Bạn có thể gõ bằng bàn phím.');
    };
    current.onend = () => {
      if (recognition !== current) return;
      stopMic();
      showStatus('');
    };
    try { current.start(); } catch { stopMic(); showStatus('Không mở được micro.'); }
  });

  fab.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    dragged = false;
    fab.setPointerCapture(event.pointerId);
  });
  fab.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!dragged && Math.hypot(dx, dy) < 6) return;
    dragged = true;
    fab.classList.add('is-dragging');
    placeFab(pointer.left + dx, pointer.top + dy);
    positionPanel();
  });
  function endDrag() {
    if (dragged) {
      try {
        localStorage.setItem('sleepsync_fab_pos_v2', JSON.stringify({
          left: parseFloat(fab.style.left), top: parseFloat(fab.style.top),
        }));
      } catch { /* Storage fallback */ }
    }
    pointer = null;
    fab.classList.remove('is-dragging');
  }
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => {
    if (fab.style.left) placeFab(parseFloat(fab.style.left), parseFloat(fab.style.top));
    positionPanel();
  });
  window.visualViewport?.addEventListener('resize', positionPanel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMic(); });
  window.addEventListener('pagehide', stopMic);
  ['sleepsync:user-changed', 'sleepsync:user-updated', 'sleepsync:user-logged-out'].forEach(name =>
    window.addEventListener(name, () => {
      stopMic();
      if (!panel.hidden) {
        if (currentChatbotOwner() !== chatbotOwner) loadChatbotHistory();
        syncBadge();
      }
    }));
  window.addEventListener('sleepsync:cloud-synced', () => {
    if (!panel.hidden) syncBadge();
  });
});
