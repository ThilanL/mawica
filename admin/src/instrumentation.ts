/**
 * Runs once when the Node server starts (ACA / Docker).
 * Forces production env validation before serving traffic.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
}
