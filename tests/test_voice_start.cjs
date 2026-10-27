const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ stalledAudio = false, stalledPermission = false, stalledToken = false } = {}) {
  let resolveAudio, resolveMicrophone;
  const state = { microphoneRequested: false, stopped: false, statuses: [] };
  const track = { stop() { state.stopped = true; } };
  const stream = { getTracks: () => [track] };
  class AudioContext {
    resume() { return stalledAudio ? new Promise(resolve => { resolveAudio = resolve; }) : Promise.resolve(); }
    close() { resolveAudio?.(); return Promise.resolve(); }
  }
  const sandbox = {
    window: { isSecureContext: true, AudioContext },
    navigator: { mediaDevices: { getUserMedia() {
      state.microphoneRequested = true;
      return stalledPermission ? new Promise(resolve => { resolveMicrophone = resolve; }) : Promise.resolve(stream);
    } } },
    fetch: () => stalledToken ? new Promise(() => {}) : Promise.resolve({
      ok: false, json: async () => ({ success: false, error: 'Provider test error' }),
    }),
    AbortController, DOMException, setTimeout: (callback, milliseconds) => setTimeout(callback, Math.min(milliseconds, 30)),
    clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../rag.js'), 'utf8'), sandbox);
  const session = new sandbox.window.SleepAssistant.LiveConversation({ status: text => state.statuses.push(text) });
  return { session, state, allowMicrophone: () => resolveMicrophone(stream) };
}

test('request microphone even when browser audio resume is waiting', async () => {
  const { session, state } = fixture({ stalledAudio: true });
  const pending = session.start({}).catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  const requestedBeforeAudioResumed = state.microphoneRequested;
  session.close();
  await pending;
  assert.equal(requestedBeforeAudioResumed, true);
});

test('unanswered microphone prompt times out and releases a late stream', async () => {
  const { session, state, allowMicrophone } = fixture({ stalledPermission: true });
  const result = await Promise.race([
    session.start({}).then(() => ({ resolved: true }), error => ({ error: error.message })),
    new Promise(resolve => setTimeout(() => resolve({ hung: true }), 150)),
  ]);
  session.close();
  allowMicrophone();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.hung, undefined);
  assert.match(result.error, /micro/i);
  assert.equal(state.stopped, true);
});

test('token request has a deadline and closes the microphone on failure', async () => {
  const { session, state } = fixture({ stalledToken: true });
  const result = await Promise.race([
    session.start({}).then(() => ({ resolved: true }), error => ({ error: error.message })),
    new Promise(resolve => setTimeout(() => resolve({ hung: true }), 150)),
  ]);
  session.close();
  assert.equal(result.hung, undefined);
  assert.match(result.error, /Gemini/i);
  assert.equal(state.stopped, true);
});
