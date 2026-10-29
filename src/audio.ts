/**
 * Procedural WebAudio sound effects (no audio files). Each effect is a few
 * oscillators/noise bursts routed through an HRTF panner that sits on the
 * snail, so sounds come from the table in front of the player.
 */
import { Object3D, Quaternion, Vector3 } from 'three';

export class Sfx {
  private ctx: AudioContext | null = null;
  private panner: PannerNode | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly tmp = new Vector3();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly q = new Quaternion();

  /** Must be called from a user gesture (or once an XR session starts). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.panner = this.ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 0.4;
    this.panner.connect(this.master);
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Place the emitter at `source` and the listener at `head`. */
  updateSpatial(source: Vector3, head: Object3D) {
    const ctx = this.ctx;
    if (!ctx || !this.panner) return;
    const l = ctx.listener;
    head.getWorldPosition(this.tmp);
    this.fwd.set(0, 0, -1).applyQuaternion(head.getWorldQuaternion(this.q));
    this.up.set(0, 1, 0);
    if (l.positionX) {
      l.positionX.value = this.tmp.x;
      l.positionY.value = this.tmp.y;
      l.positionZ.value = this.tmp.z;
      l.forwardX.value = this.fwd.x;
      l.forwardY.value = this.fwd.y;
      l.forwardZ.value = this.fwd.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
    this.panner.positionX.value = source.x;
    this.panner.positionY.value = source.y;
    this.panner.positionZ.value = source.z;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.panner) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.panner);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number) {
    const ctx = this.ctx;
    if (!ctx || !this.panner || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.panner);
    src.start(t);
    src.stop(t + dur);
  }

  stretch(amount: number) {
    this.tone(180 + amount * 900, 0.06, 'triangle', 0.08);
  }
  launch(power: number) {
    this.tone(220, 0.35, 'square', 0.12, 220 + power * 3000);
    this.burst(0.25, 0.25, 1800);
  }
  boost(combo: number, perfect: boolean) {
    const base = 520 * Math.pow(1.122, Math.min(combo, 10));
    this.tone(base, 0.18, 'triangle', 0.22, base * 2);
    if (perfect) this.tone(base * 1.5, 0.22, 'sine', 0.18, base * 3, 0.06);
  }
  miss() {
    this.tone(160, 0.16, 'sawtooth', 0.1, 90);
  }
  smash() {
    this.burst(0.6, 0.6, 900);
    this.burst(0.35, 0.4, 3200);
    this.tone(1400, 0.5, 'square', 0.08, 300);
  }
  tick() {
    this.tone(1200, 0.05, 'sine', 0.1);
  }
  place() {
    this.tone(660, 0.12, 'sine', 0.18);
    this.tone(990, 0.16, 'sine', 0.16, undefined, 0.09);
  }
  finish(win: boolean) {
    const notes = win ? [523, 659, 784, 1046] : [392, 330, 262];
    notes.forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.2, undefined, i * 0.12));
  }
}
