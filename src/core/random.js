/** Mulberry32 with explicit state for deterministic daily challenges and resumable runs. */
export class Random {
  constructor(seed = 1) { this.state = seed >>> 0; }
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  shuffle(array) { const a = [...array]; for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}
export function hashSeed(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function dailyKey(date = new Date()) { return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
export function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
