#!/usr/bin/env python3
"""Mawica staging COST GUARD (Azure Automation Python 3 runbook; standard library only, so it also runs locally).

Every run: read the subscription budget "budget-mawica-sub" (AUD). If actual month-to-date spend >= AUD 55:
  1. stop the web container app ca-mawica-stg (no replicas, no compute billing; configuration, revisions and secrets are kept);
  2. switch any SCHEDULED or EVENT-driven Container Apps job in the Mawica resource group to Manual, unless it is tagged
     costguard=essential (the original trigger is kept in tags so it can be restored). Manual jobs are left alone, and running
     executions are never killed (a migration must never be interrupted).
Never: deletes anything, touches PostgreSQL, Key Vault, networking, DNS, ACR, Log Analytics or role assignments.

Idempotent: an already stopped app or an already manual job is skipped. Bounded: every HTTP call has a 30 s timeout and the run
stops itself after 5 minutes. Scope: the Mawica subscription and resource group are fixed below; anything else is refused.
The activity-log alert "alert-mawica-costguard" emails the owner whenever this identity stops the app or changes a job.

Modes:
  (no arguments)             live run (Azure Automation, every 4 hours; managed identity)
  --dry-run                  read everything, print what WOULD happen, change nothing
  --simulate-spend AUD       dry run as if the budget showed this spend (tests the trigger path)
  --old-budget               (dry runs only) read the old resource-group budget, for testing before the new one exists
  --restore                  owner recovery: start the app and restore job triggers (run locally with the owner's az login)
Recovery override: `costguard.sh override HOURS` (1-72) tags the web app with costguard-override-until; until then the guard
does not stop the app again (job handling is unchanged). It expires by itself; the guard ignores values more than 72 h ahead.
Locally the token comes from `az account get-access-token` (isolated AZURE_CONFIG_DIR); in Automation from the managed identity.
"""
import datetime
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SUBSCRIPTION = "d5b6244c-44ac-49fb-9e93-a628acfea802"
TENANT = "82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8"
RESOURCE_GROUP = "rg-mawica-staging-aue"
BUDGET = "budget-mawica-sub"
APP = "ca-mawica-stg"
THRESHOLD_AUD = 55.0
OVERRIDE_MAX_HOURS = 72
ARM = "https://management.azure.com"
APP_API = "2024-03-01"
BUDGET_API = "2023-11-01"
DEADLINE = time.monotonic() + 300
RG_ID = "/subscriptions/%s/resourceGroups/%s" % (SUBSCRIPTION, RESOURCE_GROUP)


def log(msg):
    print("[costguard] " + msg, flush=True)


def token():
    if os.environ.get("IDENTITY_ENDPOINT"):  # Azure Automation managed identity
        url = os.environ["IDENTITY_ENDPOINT"] + "?" + urllib.parse.urlencode({"resource": ARM + "/", "api-version": "2019-08-01"})
        req = urllib.request.Request(url, headers={"X-IDENTITY-HEADER": os.environ["IDENTITY_HEADER"], "Metadata": "true"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)["access_token"]
    env = dict(os.environ, AZURE_CONFIG_DIR=os.environ.get("AZURE_CONFIG_DIR") or os.path.expanduser("~/.azure-mawica"))  # never the default login
    out = subprocess.run(["az", "account", "get-access-token", "--subscription", SUBSCRIPTION, "--query", "accessToken", "-o", "tsv"],
                         capture_output=True, text=True, timeout=60, check=True, env=env)
    return out.stdout.strip()


class Arm:
    def __init__(self):
        self.tok = token()

    def call(self, method, path, api, body=None):
        if time.monotonic() > DEADLINE:
            raise SystemExit("[costguard] STOP: 5-minute limit reached")
        if not (path.lower().startswith(RG_ID.lower()) or path.lower() == ("/subscriptions/%s/providers/Microsoft.Consumption/budgets/%s" % (SUBSCRIPTION, BUDGET)).lower()):
            raise SystemExit("[costguard] STOP: refusing a path outside the Mawica resource group: " + path)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request("%s%s?api-version=%s" % (ARM, path, api), data=data, method=method,
                                     headers={"Authorization": "Bearer " + self.tok, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            return e.code, {}


def budget_spend(arm, simulate, dry):
    path = "/subscriptions/%s/providers/Microsoft.Consumption/budgets/%s" % (SUBSCRIPTION, BUDGET)
    if dry and "--old-budget" in sys.argv:  # dry-run test before the new budget exists: read the old resource-group budget instead
        path = RG_ID + "/providers/Microsoft.Consumption/budgets/budget-mawica-stg"
    status, b = arm.call("GET", path, BUDGET_API)
    if status != 200:
        raise SystemExit("[costguard] STOP: budget %s not readable (HTTP %s)" % (path.rsplit("/", 1)[-1], status))
    spend = b["properties"].get("currentSpend") or {}
    if spend.get("unit") != "AUD":
        raise SystemExit("[costguard] STOP: budget currency is %r, expected AUD" % spend.get("unit"))
    actual = float(spend.get("amount") or 0)
    log("budget %s: actual AUD %.2f of %.2f (threshold AUD %.2f)" % (b["name"], actual, b["properties"]["amount"], THRESHOLD_AUD))
    if simulate is not None:
        log("SIMULATION: treating spend as AUD %.2f" % simulate)
        return simulate
    return actual


def override_until(tags):
    """Owner recovery override: tag costguard-override-until=<UTC ISO time> on the web app (set by `costguard.sh override HOURS`).
    Honoured only while in the future and at most OVERRIDE_MAX_HOURS ahead; anything else (expired, malformed, too far) is ignored."""
    raw = tags.get("costguard-override-until")
    if not raw:
        return None
    try:
        until = datetime.datetime.strptime(raw, "%Y-%m-%dT%H:%MZ").replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        log("ignoring malformed override tag %r" % raw); return None
    now = datetime.datetime.now(datetime.timezone.utc)
    if until <= now:
        log("override expired at %s: ignored" % raw); return None
    if until > now + datetime.timedelta(hours=OVERRIDE_MAX_HOURS):
        log("override %s is more than %d hours ahead: ignored" % (raw, OVERRIDE_MAX_HOURS)); return None
    return until


def guard(arm, dry):
    acted = []
    status, app = arm.call("GET", "%s/providers/Microsoft.App/containerApps/%s" % (RG_ID, APP), APP_API)
    if status == 404:
        log("web app %s does not exist: nothing to stop" % APP)
    elif status != 200:
        log("WARNING: cannot read %s (HTTP %s)" % (APP, status))
    else:
        running = app["properties"].get("runningStatus", "Running")
        until = override_until(app.get("tags") or {})
        if until:
            log("web app %s: owner override active until %s UTC: not stopping" % (APP, until.strftime("%Y-%m-%d %H:%M")))
        elif running == "Stopped":
            log("web app %s already stopped: skip" % APP)
        elif dry:
            log("DRY RUN: would STOP web app %s (now %s)" % (APP, running))
        else:
            s, _ = arm.call("POST", "%s/providers/Microsoft.App/containerApps/%s/stop" % (RG_ID, APP), APP_API)
            log("stopped web app %s (HTTP %s)" % (APP, s)); acted.append("stopped " + APP)

    status, jobs = arm.call("GET", "%s/providers/Microsoft.App/jobs" % RG_ID, APP_API)
    for job in (jobs.get("value") or []) if status == 200 else []:
        name, cfg, tags = job["name"], job["properties"]["configuration"], job.get("tags") or {}
        trig = cfg.get("triggerType")
        if trig == "Manual":
            log("job %s: manual trigger, runs only when started by a person: leave" % name); continue
        if tags.get("costguard") == "essential":
            log("job %s: %s trigger, tagged essential: leave" % (name, trig)); continue
        original = json.dumps(cfg.get("scheduleTriggerConfig") or cfg.get("eventTriggerConfig") or {}, separators=(",", ":"))
        if dry:
            log("DRY RUN: would switch job %s from %s to Manual" % (name, trig)); continue
        tags.update({"costguard-original-trigger": trig, "costguard-original-config": original[:256]})
        s, _ = arm.call("PATCH", "%s/providers/Microsoft.App/jobs/%s" % (RG_ID, name), APP_API,
                        {"tags": tags, "properties": {"configuration": {"triggerType": "Manual", "replicaTimeout": cfg.get("replicaTimeout", 300),
                                                                        "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1}}}})
        log("job %s: switched %s -> Manual (HTTP %s)" % (name, trig, s)); acted.append("job %s %s->Manual" % (name, trig))
    if status != 200:
        log("WARNING: cannot list jobs (HTTP %s)" % status)
    return acted


def restore(arm):
    s, _ = arm.call("POST", "%s/providers/Microsoft.App/containerApps/%s/start" % (RG_ID, APP), APP_API)
    log("start web app %s: HTTP %s" % (APP, s))
    status, jobs = arm.call("GET", "%s/providers/Microsoft.App/jobs" % RG_ID, APP_API)
    for job in (jobs.get("value") or []) if status == 200 else []:
        tags = job.get("tags") or {}
        trig = tags.get("costguard-original-trigger")
        if not trig:
            continue
        key = "scheduleTriggerConfig" if trig == "Schedule" else "eventTriggerConfig"
        cfg = json.loads(tags.get("costguard-original-config") or "{}")
        for k in ("costguard-original-trigger", "costguard-original-config"):
            tags.pop(k, None)
        s, _ = arm.call("PATCH", "%s/providers/Microsoft.App/jobs/%s" % (RG_ID, job["name"]), APP_API,
                        {"tags": tags, "properties": {"configuration": {"triggerType": trig, key: cfg}}})
        log("job %s: restored %s trigger (HTTP %s)" % (job["name"], trig, s))


def main(argv):
    dry = "--dry-run" in argv
    simulate = None
    if "--simulate-spend" in argv:
        simulate = float(argv[argv.index("--simulate-spend") + 1]); dry = True
    arm = Arm()
    if "--restore" in argv:
        restore(arm); return 0
    spend = budget_spend(arm, simulate, dry)
    if spend < THRESHOLD_AUD:
        log("below threshold: no action")
        return 0
    log("THRESHOLD REACHED: protecting the budget" + (" (dry run)" if dry else ""))
    acted = guard(arm, dry)
    log("done: " + ("; ".join(acted) if acted else "nothing changed"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
