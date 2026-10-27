/* Resample microphone input to little-endian PCM16 at 16 kHz off the UI thread. */
class SleepVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
    this.samples = [];
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      for (const value of input) {
        this.sum += value;
        this.count++;
        this.position++;
        if (this.position >= this.ratio) {
          this.samples.push(Math.max(-1, Math.min(1, this.sum / this.count)));
          this.position -= this.ratio;
          this.sum = 0;
          this.count = 0;
        }
        if (this.samples.length === 1600) {
          const buffer = new ArrayBuffer(3200);
          const view = new DataView(buffer);
          this.samples.forEach((sample, index) => view.setInt16(index * 2,
            Math.round(sample * (sample < 0 ? 32768 : 32767)), true));
          this.port.postMessage(buffer, [buffer]);
          this.samples = [];
        }
      }
    }
    return true;
  }
}
registerProcessor('sleep-voice-processor', SleepVoiceProcessor);
