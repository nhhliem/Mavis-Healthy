/* Gemini client. Long-lived credentials remain on the Python server. */
window.SleepAssistant = (() => {
  async function request(path, body, signal) {
    let response;
    try {
      response = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Không kết nối được máy chủ. Hãy mở web qua server.py và kiểm tra mạng.');
    }
    let data;
    try { data = await response.json(); } catch {
      throw new Error('Máy chủ chưa hỗ trợ Gemini. Hãy chạy python server.py và mở địa chỉ máy chủ.');
    }
    if (!response.ok || !data.success) throw new Error(data.error || 'Gemini chưa phản hồi. Vui lòng thử lại.');
    return data;
  }

  // One session owns every audio resource, including permission/connection races.
  class LiveConversation {
    constructor(callbacks) {
      this.callbacks = callbacks;
      this.closed = false;
      this.ready = false;
      this.sources = new Set();
      this.nextPlayTime = 0;
      this.replayBuffers = [];
      this.lastReplyBuffers = [];
      this.abortController = new AbortController();
      this.waiters = new Set();
    }

    waitForStep(promise, milliseconds, message) {
      return new Promise((resolve, reject) => {
        let timer;
        const cancel = () => {
          clearTimeout(timer);
          this.waiters.delete(cancel);
          reject(new DOMException('Session closed', 'AbortError'));
        };
        this.waiters.add(cancel);
        timer = setTimeout(() => {
          this.waiters.delete(cancel);
          reject(new Error(message));
        }, milliseconds);
        Promise.resolve(promise).then(resolve, reject).finally(() => {
          clearTimeout(timer);
          this.waiters.delete(cancel);
        });
      });
    }

    async start(body) {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Micro cần HTTPS hoặc localhost. Hãy mở web bằng địa chỉ an toàn.');
      }
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audio = new AudioContextClass({ sampleRate: 24000 });
        // Start resume during the click, but don't let autoplay block the mic prompt.
        const audioReady = this.audio.resume().then(() => null, error => error);
        this.callbacks.status('Đang xin quyền micro. Bấm Cho phép trong thông báo của trình duyệt.');
        const microphone = navigator.mediaDevices.getUserMedia({ audio: {
          channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        } }).then(stream => {
          if (this.closed) {
            stream.getTracks().forEach(track => track.stop());
            throw new DOMException('Session closed', 'AbortError');
          }
          return stream;
        });
        const stream = await this.waitForStep(microphone, 20000,
          'Chưa mở được micro. Bấm biểu tượng quyền cạnh địa chỉ web, cho phép micro rồi thử lại.');
        this.stream = stream;
        if (this.closed) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream.getTracks().forEach(track => {
          track.onended = () => this.fail('Micro đã ngắt kết nối. Bấm micro để bắt đầu lại.');
        });
        this.callbacks.status('Đã mở micro. Đang kích hoạt âm thanh...');
        const audioError = await this.waitForStep(audioReady, 5000,
          'Trình duyệt chưa bật âm thanh. Mở trang trực tiếp trong Chrome/Edge, bấm lại micro và giữ tab này ở phía trước.');
        if (audioError) throw audioError;
        if (this.closed) return;
        this.callbacks.status('Đã mở micro. Đang tạo phiên Gemini Live...');
        const data = await this.waitForStep(request('/api/ai/live-token', body, this.abortController.signal), 20000,
          'Máy chủ chưa tạo được phiên Gemini Live sau 20 giây. Kiểm tra kết nối rồi bấm micro để thử lại.');
        if (this.closed) return;
        this.callbacks.status('Đang kết nối giọng nói với Gemini Live...');
        const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(data.token);
        this.socket = new WebSocket(url);
        // Serialize Blob decoding so audio/transcripts cannot arrive out of order.
        this.messageQueue = Promise.resolve();
        await new Promise((resolve, reject) => {
          this.rejectSetup = reject;
          this.setupTimer = setTimeout(() => reject(new Error('Kết nối Voice quá lâu. Vui lòng thử lại.')), 15000);
          this.socket.onopen = () => {
            if (!this.closed) this.socket.send(JSON.stringify({ setup: { model: 'models/' + data.model } }));
          };
          this.socket.onmessage = event => {
            this.messageQueue = this.messageQueue.then(async () => {
              if (this.closed) return;
              const text = typeof event.data === 'string' ? event.data : await event.data.text();
              const message = JSON.parse(text);
              if (message.error) {
                throw new Error('Gemini Live không mở được phiên. Kiểm tra quyền API và hạn mức Voice.');
              }
              if (message.setupComplete) {
                clearTimeout(this.setupTimer);
                this.ready = true;
                this.rejectSetup = null;
                resolve();
              }
              this.receive(message);
            }).catch(error => {
              reject(error);
              if (this.ready) this.fail(error.message);
            });
          };
          this.socket.onerror = () => {
            const error = new Error('Không kết nối được Gemini Live. Kiểm tra mạng hoặc quyền API.');
            if (!this.ready) reject(error); else this.fail(error.message);
          };
          this.socket.onclose = () => {
            if (this.closed) return;
            const error = new Error('Phiên Voice đã kết thúc. Bấm micro để kết nối lại.');
            if (!this.ready) reject(error); else this.fail(error.message);
          };
        });
        if (this.closed) return;
        this.callbacks.status('Đã kết nối Gemini Live. Đang khởi động thu âm...');
        await this.capture();
        if (!this.closed) this.callbacks.status('Đang nghe. Bạn có thể nói chuyện với Mavis.');
      } catch (error) {
        this.close();
        if (error.name === 'NotAllowedError') throw new Error('Chưa được cấp quyền micro. Hãy cho phép micro trong trình duyệt rồi thử lại.');
        if (error.name === 'NotFoundError') throw new Error('Không tìm thấy micro. Kết nối micro rồi thử lại.');
        if (error.name === 'NotReadableError') throw new Error('Không đọc được micro. Kiểm tra micro trong Windows hoặc đóng ứng dụng đang chiếm micro rồi thử lại.');
        throw error;
      }
    }

    async capture() {
      await this.waitForStep(this.audio.audioWorklet.addModule('/voice-processor.js?v=6'), 10000,
        'Chưa tải được bộ thu âm. Nhấn Ctrl+F5 để tải lại trang rồi thử Voice lại.');
      if (this.closed) return;
      this.input = this.audio.createMediaStreamSource(this.stream);
      this.processor = new AudioWorkletNode(this.audio, 'sleep-voice-processor');
      this.silentGain = this.audio.createGain();
      this.silentGain.gain.value = 0;
      this.processor.port.onmessage = event => {
        if (this.closed || !this.ready || this.socket.readyState !== WebSocket.OPEN) return;
        if (this.socket.bufferedAmount > 256000) {
          this.fail('Mạng quá chậm để truyền giọng nói. Hãy kết nối lại hoặc chuyển sang Chat.');
          return;
        }
        const bytes = new Uint8Array(event.data);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        this.socket.send(JSON.stringify({ realtimeInput: { audio: {
          data: btoa(binary), mimeType: 'audio/pcm;rate=16000',
        } } }));
      };
      this.input.connect(this.processor);
      this.processor.connect(this.silentGain);
      this.silentGain.connect(this.audio.destination);
    }

    receive(message) {
      const content = message.serverContent;
      if (!content || this.closed) return;
      if (content.interrupted) {
        this.stopPlayback();
        this.callbacks.interrupted();
      }
      if (content.inputTranscription?.text) this.callbacks.transcript('user', content.inputTranscription.text);
      if (content.outputTranscription?.text) this.callbacks.transcript('ai', content.outputTranscription.text);
      for (const part of content.modelTurn?.parts || []) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
          const rate = Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
          const binary = atob(part.inlineData.data);
          const view = new DataView(new ArrayBuffer(binary.length));
          for (let index = 0; index < binary.length; index++) view.setUint8(index, binary.charCodeAt(index));
          const buffer = this.audio.createBuffer(1, Math.floor(binary.length / 2), rate);
          const samples = buffer.getChannelData(0);
          for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
          this.replayBuffers.push(buffer);
          this.play(buffer);
          this.callbacks.status('Mavis đang trả lời. Bạn có thể nói xen vào.');
        }
      }
      if (content.turnComplete) {
        if (this.replayBuffers.length) this.lastReplyBuffers = this.replayBuffers;
        this.replayBuffers = [];
        this.callbacks.turnComplete();
        this.callbacks.status('Đang trò chuyện. Nói tiếp khi bạn sẵn sàng.');
      }
    }

    play(buffer) {
      if (this.closed) return;
      const source = this.audio.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audio.destination);
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); };
      const when = Math.max(this.audio.currentTime + 0.02, this.nextPlayTime);
      source.start(when);
      this.nextPlayTime = when + buffer.duration;
    }

    replay() {
      if (!this.lastReplyBuffers.length || this.closed) return false;
      this.stopPlayback();
      this.lastReplyBuffers.forEach(buffer => this.play(buffer));
      return true;
    }

    stopPlayback() {
      for (const source of this.sources) { try { source.stop(); } catch {} }
      this.sources.clear();
      this.nextPlayTime = 0;
      this.replayBuffers = [];
    }

    fail(message) {
      if (this.closed) return;
      this.close();
      this.callbacks.error(message);
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      for (const cancel of this.waiters) cancel();
      this.waiters.clear();
      clearTimeout(this.setupTimer);
      this.abortController.abort();
      this.rejectSetup?.(new DOMException('Session closed', 'AbortError'));
      this.rejectSetup = null;
      this.stopPlayback();
      if (this.processor) { this.processor.port.onmessage = null; this.processor.disconnect(); }
      this.input?.disconnect();
      this.silentGain?.disconnect();
      this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
      if (this.socket) { this.socket.onclose = null; this.socket.onerror = null; this.socket.close(); }
      this.audio?.close().catch(() => {});
    }
  }

  return { chat: (body, signal) => request('/api/ai/chat', body, signal), LiveConversation };
})();
