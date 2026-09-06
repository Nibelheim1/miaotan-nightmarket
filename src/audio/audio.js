/** Original procedural pentatonic music + synth foley. Audio is never started before a gesture. */
export class AudioEngine {
  constructor() { this.context = null; this.master = null; this.enabled = true; this.music = true; this.volume = .42; this.voices = 0; this.lastHit = -10; this.note = 0; this.nextNote = 0; this.paused = false; }
  async unlock() {
    if (!this.enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!this.context) { this.context = new Audio(); this.master = this.context.createGain(); this.master.gain.value = this.volume; this.master.connect(this.context.destination); }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Silent play remains fully functional on blocked/unsupported audio. */ }
  }
  setEnabled(on) { this.enabled = !!on; if (this.master && this.context) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.context.currentTime, .025); }
  setVolume(n) { this.volume = Math.max(0, Math.min(1, Number(n) || 0)); if (this.master && this.context) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, .025); }
  tone(freq, duration = .1, kind = 'sine', gain = .12, slide = null, delay = 0) {
    const a = this.context; if (!a || !this.enabled || this.paused || a.state !== 'running' || this.voices >= 18) return;
    try {
      const osc = a.createOscillator(), envelope = a.createGain(), t = a.currentTime + delay;
      this.voices++; osc.type = kind; osc.frequency.setValueAtTime(freq, t); if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + duration);
      envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(gain, t + .006); envelope.gain.exponentialRampToValueAtTime(.001, t + duration);
      osc.connect(envelope); envelope.connect(this.master); osc.start(t); osc.stop(t + duration + .025);
      osc.onended = () => { osc.disconnect(); envelope.disconnect(); this.voices = Math.max(0, this.voices - 1); };
    } catch { this.voices = Math.max(0, this.voices - 1); }
  }
  effect(name, value = 0) {
    if (name === 'hit') { const t = this.context?.currentTime || 0; if (t - this.lastHit < .035) return; this.lastHit = t; this.tone([330, 392, 440, 523, 587][value % 5], .065, 'triangle', .07); }
    if (name === 'shot' || name === 'click') this.tone(name === 'shot' ? 470 : 630, .09, 'sine', .15, 260);
    if (name === 'kill') this.tone(680, .09, 'triangle', .1, 1020);
    if (name === 'boom') { this.tone(110, .22, 'triangle', .22, 34); this.tone(60, .18, 'sawtooth', .04, 30); }
    if (name === 'upgrade' || name === 'gift' || name === 'synergy') [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .2, 'sine', .09, null, i * .065));
    if (name === 'damage') { this.tone(180, .25, 'sawtooth', .1, 65); }
    if (name === 'win') [523, 659, 784, 1047, 1318].forEach((f, i) => this.tone(f, .42, 'triangle', .12, null, i * .12));
    if (name === 'lose') [392, 330, 262, 196].forEach((f, i) => this.tone(f, .3, 'sine', .12, null, i * .15));
  }
  update() {
    if (!this.music || !this.enabled || this.paused || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime;
    if (t < this.nextNote) return;
    const melody = [523, 0, 659, 784, 0, 659, 587, 0, 440, 0, 523, 659, 0, 587, 392, 0];
    const f = melody[this.note % melody.length]; if (f) this.tone(f, .28, 'sine', .035);
    if (this.note % 4 === 0) this.tone([131, 110, 98, 110][Math.floor(this.note / 4) % 4], .42, 'triangle', .04);
    this.note++; this.nextNote = t + .25;
  }
  pause(on) { this.paused = on; if (this.master && this.context) this.master.gain.setTargetAtTime(on || !this.enabled ? 0 : this.volume, this.context.currentTime, .025); }
}
