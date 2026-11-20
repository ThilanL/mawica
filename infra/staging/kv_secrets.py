#!/usr/bin/env python3
"""Complete, fail-closed inventory of Key Vault secret NAMES through the Azure management API (control plane; values are never read).

The list API is paged (it returns as few as 3 names per page plus a nextLink). Every caller that decides "does this secret exist?"
must see the WHOLE inventory, or a run-once guard can be bypassed and a secret overwritten. So this helper:
  - follows nextLink until it is absent, null or empty;
  - refuses a nextLink that is not https://management.azure.com/..., or that repeats (loop), or more than MAX_PAGES pages;
  - refuses malformed pages (not an object, no "value" list, an item without a string "name");
  - treats ANY failure as an error (exit 1). An incomplete or failed listing is never reported as "no secrets".

  kv_secrets.py list  <first-page-url>               -> JSON array of names on stdout, exit 0
  kv_secrets.py guard-absent <first-page-url> NAME...  -> exit 0 if none of NAME exists, 4 if any exists (names printed), 1 on error
  kv_secrets.py require <first-page-url> NAME...       -> exit 0 if all NAME exist, 5 if any is missing (names printed), 1 on error
Uses the caller's `az` login (AZURE_CONFIG_DIR). Prints nothing but names.
"""
import json
import subprocess
import sys

MAX_PAGES = 100
ARM = "https://management.azure.com/"


class InventoryError(Exception):
    pass


def fetch(url):
    try:
        out = subprocess.run(["az", "rest", "--method", "get", "--url", url, "-o", "json"], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise InventoryError("az rest could not be run: %s" % type(e).__name__)
    if out.returncode != 0:
        raise InventoryError("az rest failed (exit %d)" % out.returncode)
    try:
        return json.loads(out.stdout)
    except ValueError:
        raise InventoryError("response is not JSON")


def secret_names(first_url, fetch=fetch):
    if not isinstance(first_url, str) or not first_url.startswith(ARM):
        raise InventoryError("first page URL must start with " + ARM)
    names, seen, url = [], set(), first_url
    while url:
        if url in seen:
            raise InventoryError("nextLink repeats; refusing to loop")
        if len(seen) >= MAX_PAGES:
            raise InventoryError("more than %d pages" % MAX_PAGES)
        seen.add(url)
        page = fetch(url)
        if not isinstance(page, dict) or not isinstance(page.get("value"), list):
            raise InventoryError("malformed page (no 'value' list)")
        for item in page["value"]:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"]:
                raise InventoryError("malformed item (no name)")
            names.append(item["name"])
        nxt = page.get("nextLink")
        if nxt in (None, ""):
            url = None
        elif isinstance(nxt, str) and nxt.startswith(ARM):
            url = nxt
        else:
            raise InventoryError("malformed nextLink")
    if len(names) != len(set(names)):
        raise InventoryError("duplicate names across pages")
    return names


def main(argv):
    if len(argv) < 2 or argv[0] not in ("list", "guard-absent", "require") or (argv[0] != "list" and len(argv) < 3):
        print("usage: kv_secrets.py list|guard-absent|require <first-page-url> [NAME...]", file=sys.stderr)
        return 2
    try:
        names = secret_names(argv[1])
    except InventoryError as e:
        print("STOP: Key Vault secret inventory could not be verified: %s" % e, file=sys.stderr)
        return 1
    if argv[0] == "list":
        print(json.dumps(sorted(names), separators=(",", ":")))
        return 0
    wanted = argv[2:]
    if argv[0] == "guard-absent":
        present = [n for n in wanted if n in names]
        if present:
            print("present: " + " ".join(present), file=sys.stderr)
            return 4
        return 0
    missing = [n for n in wanted if n not in names]
    if missing:
        print("missing: " + " ".join(missing), file=sys.stderr)
        return 5
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
