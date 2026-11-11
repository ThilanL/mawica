/** Which renderer to use. Pure so it can be tested; the browser probe feeds it. */
export type RenderChoice = "webgl" | "webgl-static" | "fallback-2d";

export function chooseRenderer(o: { webgl: boolean; reducedMotion: boolean; contextLost?: boolean; failed?: boolean }): RenderChoice {
  if (!o.webgl || o.contextLost || o.failed) return "fallback-2d";
  return o.reducedMotion ? "webgl-static" : "webgl";
}

/** Probes WebGL once without keeping a context alive. */
export function probeWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // release the probe context immediately
    return true;
  } catch {
    return false;
  }
}

/** Reading time for the message: short messages continue by themselves, long ones wait for the recipient. */
export function autoAdvanceSeconds(message: string): number | null {
  const chars = message.trim().length;
  if (chars > 140) return null; // long content: the recipient decides (Continue)
  return Math.max(12, 6 + chars * 0.09);
}
