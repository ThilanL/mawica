"""Summarise `az deployment group what-if -o json` (stdin): change type, resource, changed property paths. Prints no property values.
"Potential" changes are resources whose condition or properties ARM can only settle at deployment time (e.g. Key Vault secrets behind a
condition on a secure parameter); they are listed separately so they are never hidden."""
import json
import sys

d = json.load(sys.stdin)
for label, changes in (("", d.get("changes") or []), ("potential ", d.get("potentialChanges") or [])):
    for c in changes:
        paths = ", ".join(x["path"] for x in (c.get("delta") or []))
        print("%s%-9s %s  %s" % (label, c["changeType"], c["resourceId"].split("/providers/", 1)[-1], paths))
for x in d.get("diagnostics") or []:
    print("diagnostic %s %s %s" % (x.get("level", ""), x.get("code", ""), (x.get("message") or "")[:200]))
