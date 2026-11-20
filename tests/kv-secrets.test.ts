// Key Vault secret inventory (infra/staging/kv_secrets.py) and the app.sh run-once guards, against a fake `az` that serves mocked
// Azure management API pages. Nothing here talks to Azure.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const HELPER = join(ROOT, "infra/staging/kv_secrets.py");
const APP_SH = join(ROOT, "infra/staging/app.sh");
const SUB = "d5b6244c-44ac-49fb-9e93-a628acfea802";
const TENANT = "82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8";
const FIRST = `https://management.azure.com/subscriptions/${SUB}/resourceGroups/rg-mawica-staging-aue/providers/Microsoft.KeyVault/vaults/kv-mawica-stg-urw2b/secrets?api-version=2023-07-01`;
const page = (n: number) => `${FIRST}&$skiptoken=page${n}`;
const names = (...n: string[]) => n.map((name) => ({ name, properties: { attributes: { enabled: true } } }));

// Fake az: `rest --method get --url U` answers from AZ_PAGES (url -> JSON body, or "ERROR"); `account show` returns the Mawica ids;
// every invocation is appended to AZ_LOG so tests can prove nothing was deployed.
const FAKE_AZ = `#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
open(os.environ["AZ_LOG"], "a").write(" ".join(a) + "\\n")
if a[:2] == ["account", "show"]:
    print("${SUB}"); print("${TENANT}"); sys.exit(0)
if a[:1] == ["rest"] and "--url" in a:
    body = json.load(open(os.environ["AZ_PAGES"])).get(a[a.index("--url") + 1])
    if body is None or body == "ERROR":
        print("ERROR: (InternalServerError) mocked failure", file=sys.stderr); sys.exit(1)
    print(body if isinstance(body, str) else json.dumps(body)); sys.exit(0)
print("unexpected az call: " + " ".join(a), file=sys.stderr); sys.exit(9)
`;

let dir = "";
const env = () => ({ ...process.env, PATH: `${dir}:${process.env.PATH}`, AZ_PAGES: join(dir, "pages.json"), AZ_LOG: join(dir, "az.log") });
const serve = (pages: Record<string, unknown>) => writeFileSync(join(dir, "pages.json"), JSON.stringify(pages));
const helper = (...args: string[]) => spawnSync("python3", ["-I", HELPER, ...args], { env: env(), encoding: "utf8" });
const appSh = (...args: string[]) => spawnSync("bash", [APP_SH, ...args], { env: { ...env(), AZURE_CONFIG_DIR: dir, ROTATE: "" }, encoding: "utf8" });
const azCalls = () => readFileSync(join(dir, "az.log"), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kvsecrets-"));
  writeFileSync(join(dir, "az"), FAKE_AZ);
  chmodSync(join(dir, "az"), 0o755);
  writeFileSync(join(dir, "az.log"), "");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ALL_EIGHT = ["better-auth-secret", "database-app-url", "database-migrate-url", "database-url", "pg-app-password", "pg-migrate-password", "rate-limit-salt", "welcome-pepper"];
const threePages = () => ({
  [FIRST]: { value: names("better-auth-secret", "database-app-url", "database-migrate-url"), nextLink: page(2) },
  [page(2)]: { value: names("database-url", "pg-app-password", "pg-migrate-password"), nextLink: page(3) },
  [page(3)]: { value: names("rate-limit-salt", "welcome-pepper") },
});

describe("kv_secrets.py inventory", () => {
  it("zero secrets: an empty, complete listing", () => {
    serve({ [FIRST]: { value: [] } });
    const r = helper("list", FIRST);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it("one page, nextLink absent or null", () => {
    serve({ [FIRST]: { value: names("a", "b"), nextLink: null } });
    expect(JSON.parse(helper("list", FIRST).stdout)).toEqual(["a", "b"]);
  });

  it("multiple pages: all names from every page", () => {
    serve(threePages());
    const r = helper("list", FIRST);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(ALL_EIGHT);
  });

  it("finds targets on page 2 and later", () => {
    serve(threePages());
    expect(helper("guard-absent", FIRST, "pg-app-password").status).toBe(4);
    expect(helper("guard-absent", FIRST, "welcome-pepper").status).toBe(4);
    expect(helper("require", FIRST, "pg-migrate-password", "welcome-pepper").status).toBe(0);
    expect(helper("guard-absent", FIRST, "not-there").status).toBe(0);
    expect(helper("require", FIRST, "not-there").status).toBe(5);
  });

  it("malformed nextLink (not the management API) fails closed", () => {
    serve({ [FIRST]: { value: names("a"), nextLink: "https://evil.example/next" } });
    const r = helper("list", FIRST);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("nextLink pointing to a page that is missing fails closed", () => {
    serve({ [FIRST]: { value: names("a"), nextLink: page(2) } });
    expect(helper("list", FIRST).status).toBe(1);
  });

  it("repeated nextLink (loop) fails closed", () => {
    serve({ [FIRST]: { value: names("a"), nextLink: page(2) }, [page(2)]: { value: names("b"), nextLink: FIRST } });
    const r = helper("list", FIRST);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/repeats/);
  });

  it("an API error midway through pagination fails closed (never a partial or empty answer)", () => {
    serve({ [FIRST]: { value: names("better-auth-secret"), nextLink: page(2) }, [page(2)]: "ERROR" });
    for (const args of [["list"], ["guard-absent"], ["require"]]) {
      const r = helper(args[0], FIRST, ...(args[0] === "list" ? [] : ["pg-app-password"]));
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
    }
  });

  it("malformed pages fail closed", () => {
    for (const bad of ["not json", { nope: [] }, { value: [{ nameless: true }] }, { value: "x" }, [1, 2]]) {
      serve({ [FIRST]: bad });
      expect(helper("list", FIRST).status).toBe(1);
    }
  });

  it("never prints anything but names (no values, no tokens)", () => {
    serve({ [FIRST]: { value: [{ name: "a", properties: { value: "SHOULD-NOT-APPEAR" } }] } });
    const r = helper("list", FIRST);
    expect(r.stdout + r.stderr).not.toContain("SHOULD-NOT-APPEAR");
  });
});

describe("app.sh rotation guards (full inventory)", () => {
  it("roles refuses when pg-app-password exists on page 2, and deploys nothing", () => {
    serve(threePages());
    const r = appSh("roles", "94d717a919ee");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/already exist/);
    expect(azCalls()).not.toMatch(/deployment group (create|what-if)|acr import|job start/);
  });

  it("roles fails closed when the inventory cannot be verified", () => {
    serve({ [FIRST]: { value: [], nextLink: page(2) }, [page(2)]: "ERROR" });
    const r = appSh("roles", "94d717a919ee");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not verify/);
    expect(azCalls()).not.toMatch(/deployment group create/);
  });

  it("pepper always refuses and never writes; existing welcome-pepper on page 3 is detected", () => {
    serve(threePages());
    const r = appSh("pepper");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/welcome-pepper already exists/);
    expect(azCalls()).not.toMatch(/deployment group create/);
  });

  it("pepper refuses even when welcome-pepper is missing", () => {
    serve({ [FIRST]: { value: names("database-url") } });
    const r = appSh("pepper");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no longer does it/);
    expect(azCalls()).not.toMatch(/deployment group create/);
  });

  it("roles-resume requires the complete set of role secrets (non-rotating)", () => {
    serve({ [FIRST]: { value: names("pg-app-password", "pg-migrate-password"), nextLink: page(2) }, [page(2)]: { value: names("database-app-url") } });
    const r = appSh("roles-resume", "94d717a919ee");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/incomplete/);
    expect(azCalls()).not.toMatch(/deployment group create/);
  });

  it("the script is syntactically valid", () => {
    expect(() => execFileSync("bash", ["-n", APP_SH])).not.toThrow();
  });
});
