/**
 * The snowstorm's sound: a soft glass-and-bells shimmer synthesised with Web Audio (no audio file to download). Played only after the
 * recipient turns sound on, and only in response to their own tap or shake (browsers need a user gesture for audio anyway).
 */
let ctx: AudioContext | null = null;
const NOTES = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186]; // a high pentatonic set: G6–C8

export function playShimmer(intensity = 1) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0.05 * intensity; out.connect(ctx.destination);
    for (let i = 0; i < 14; i++) {
      const at = now + i * 0.045 + Math.random() * 0.05, f = NOTES[(Math.random() * NOTES.length) | 0] * (Math.random() < 0.3 ? 0.5 : 1);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.6 + Math.random() * 0.4, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, at + 0.9 + Math.random() * 0.8);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 1.8);
    }
  } catch { /* no audio: the storm is just silent */ }
}
