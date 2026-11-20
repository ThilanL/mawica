/**
 * Local smoke for the Mawica Admin image (R1). Does not touch Azure.
 *
 *   docker build -f admin/Dockerfile -t mawica-admin:local .
 *   npx tsx scripts/admin-container-smoke.mts
 *
 * Requires Docker and (for readiness) local Postgres on TEST_DATABASE_URL / :5433.
 */
import { execFileSync, spawnSync } from "node:child_process";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* optional */
}

const IMAGE = process.env.ADMIN_SMOKE_IMAGE ?? "mawica-admin:local";
const HOST_PORT = process.env.ADMIN_SMOKE_PORT ?? "18080";
const dbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://mawica_app:mawica@127.0.0.1:5433/mawica_test?schema=public";

function sh(cmd: string, args: string[], opts?: { allowFail?: boolean }) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0 && !opts?.allowFail) {
    throw new Error(`${cmd} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  }
  return r;
}

function curl(
  path: string,
  init?: { method?: string; headersOnly?: boolean },
): { status: number; body: string; headers: string } {
  const args = ["-sS", "-o", "/tmp/admin-smoke-body", "-w", "%{http_code}"];
  if (init?.headersOnly) args.push("-I");
  if (init?.method) args.push("-X", init.method);
  args.push(`http://127.0.0.1:${HOST_PORT}${path}`);
  const r = spawnSync("curl", args, { encoding: "utf8" });
  const status = Number((r.stdout || "").trim());
  const body = init?.headersOnly ? "" : execFileSync("cat", ["/tmp/admin-smoke-body"], { encoding: "utf8" });
  const headers =
    init?.headersOnly
      ? r.stdout + r.stderr
      : spawnSync("curl", ["-sSI", `http://127.0.0.1:${HOST_PORT}${path}`], { encoding: "utf8" }).stdout || "";
  return { status, body, headers };
}

console.log(`Smoke image=${IMAGE} port=${HOST_PORT}`);

sh("docker", ["image", "inspect", IMAGE]);

const run = sh("docker", [
  "run",
  "-d",
  "--rm",
  "--name",
  "mawica-admin-smoke",
  "--add-host=host.docker.internal:host-gateway",
  "-e",
  "NODE_ENV=production",
  "-e",
  `DATABASE_URL=${dbUrl.replace("127.0.0.1", "host.docker.internal").replace("localhost", "host.docker.internal")}`,
  "-e",
  "RATE_LIMIT_SALT=smoke-salt-smoke-salt",
  "-e",
  "ADMIN_SESSION_SECRET=smoke-session-secret-smoke-session-secret-00",
  "-e",
  `ADMIN_APP_URL=http://127.0.0.1:${HOST_PORT}`,
  "-e",
  "ADMIN_ENTRA_TENANT_ID=smoke-tenant",
  "-e",
  "ADMIN_ENTRA_CLIENT_ID=smoke-client",
  "-e",
  "ADMIN_ENTRA_CLIENT_SECRET=smoke-secret",
  "-e",
  `ADMIN_ENTRA_REDIRECT_URI=http://127.0.0.1:${HOST_PORT}/api/auth/callback`,
  "-e",
  "ADMIN_STAFF_ALLOWLIST=smoke@mawica.local:OWNER",
  "-e",
  "TRUSTED_PROXY_HOPS=1",
  "-p",
  `${HOST_PORT}:8080`,
  IMAGE,
]);
const cid = (run.stdout || "").trim();
console.log(`container ${cid.slice(0, 12)}`);

const cleanup = () => {
  sh("docker", ["stop", "-t", "15", cid], { allowFail: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

let liveOk = false;
for (let i = 0; i < 60; i++) {
  try {
    const live = curl("/api/health");
    if (live.status === 200 && live.body.includes('"check":"process"')) {
      liveOk = true;
      break;
    }
  } catch {
    /* starting */
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
if (!liveOk) {
  sh("docker", ["logs", cid], { allowFail: true });
  throw new Error("liveness timeout");
}
console.log("OK liveness");

const ready = curl("/api/health/ready");
if (![200, 503].includes(ready.status)) throw new Error(`ready status ${ready.status}`);
if (/postgresql:\/\/|password=/i.test(ready.body)) throw new Error("ready leaked secrets");
console.log(`OK readiness status=${ready.status}`);

const dev = curl("/api/auth/dev", { method: "POST" });
if (dev.status !== 403) throw new Error(`dev auth expected 403, got ${dev.status}`);
console.log("OK production rejects dev auth");

// Unauthenticated console: Next may return RSC HTML with NEXT_REDIRECT (not raw 307).
const cms = curl("/cms");
const cmsGuarded =
  [302, 303, 307, 308].includes(cms.status) ||
  (/NEXT_REDIRECT/i.test(cms.body) && /sign-in/i.test(cms.body)) ||
  (/http-equiv="refresh"/i.test(cms.body) && /sign-in/i.test(cms.body));
if (!cmsGuarded || /Staff operations for Mawica|Open reports|CmsEditor/i.test(cms.body)) {
  throw new Error(`console expected sign-in redirect without staff UI, status=${cms.status}`);
}
console.log(`OK unauthenticated console boundary (status=${cms.status})`);

const hdr = spawnSync("curl", ["-sSI", `http://127.0.0.1:${HOST_PORT}/api/health`], {
  encoding: "utf8",
});
if (!/x-robots-tag:.*noindex/i.test(hdr.stdout || "")) {
  throw new Error("missing X-Robots-Tag noindex");
}
console.log("OK noindex header");

// Misconfig: ADMIN_DEV_AUTH=1 must refuse to stay up
const bad = sh("docker", [
  "run",
  "-d",
  "--name",
  "mawica-admin-smoke-devauth",
  "-p",
  "18082:8080",
  "-e",
  "NODE_ENV=production",
  "-e",
  "DATABASE_URL=postgresql://x:x@127.0.0.1:5433/x",
  "-e",
  "RATE_LIMIT_SALT=smoke-salt-smoke-salt",
  "-e",
  "ADMIN_SESSION_SECRET=smoke-session-secret-smoke-session-secret-00",
  "-e",
  "ADMIN_APP_URL=http://127.0.0.1:8080",
  "-e",
  "ADMIN_DEV_AUTH=1",
  "-e",
  "ADMIN_ENTRA_TENANT_ID=t",
  "-e",
  "ADMIN_ENTRA_CLIENT_ID=c",
  "-e",
  "ADMIN_ENTRA_CLIENT_SECRET=s",
  "-e",
  "ADMIN_ENTRA_REDIRECT_URI=http://127.0.0.1:8080/api/auth/callback",
  "-e",
  "ADMIN_STAFF_ALLOWLIST=a@b.com:OWNER",
  IMAGE,
]);
const badId = (bad.stdout || "").trim();
let refused = false;
for (let i = 0; i < 20; i++) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  const inspect = sh("docker", ["inspect", "-f", "{{.State.Status}} {{.State.ExitCode}}", badId], {
    allowFail: true,
  });
  const line = (inspect.stdout || "").trim();
  if (!line || line.startsWith("exited") || /\bexited\b/i.test(line) || /^exited/.test(line)) {
    refused = true;
    break;
  }
  // Next may keep the process up until instrumentation runs on first request — poke it.
  spawnSync("curl", ["-sS", "-m", "2", "http://127.0.0.1:18082/api/health"], { encoding: "utf8" });
  const again = sh("docker", ["inspect", "-f", "{{.State.Running}}", badId], { allowFail: true });
  if ((again.stdout || "").trim() === "false") {
    refused = true;
    break;
  }
}
const logs = sh("docker", ["logs", badId], { allowFail: true });
sh("docker", ["rm", "-f", badId], { allowFail: true });
if (!refused && !/ADMIN_DEV_AUTH cannot be enabled/i.test(`${logs.stdout}\n${logs.stderr}`)) {
  throw new Error("expected production refusal for ADMIN_DEV_AUTH=1");
}
console.log("OK production refuses ADMIN_DEV_AUTH=1");

cleanup();
process.off("exit", cleanup);
console.log("OK graceful docker stop");
console.log("admin container smoke passed");
