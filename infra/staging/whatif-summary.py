"""Summarise `az deployment group what-if -o json` (stdin): change type, resource, changed property paths. Prints no property values."""
import json
import sys

for c in json.load(sys.stdin)["changes"]:
    paths = ", ".join(d["path"] for d in (c.get("delta") or []))
    print("%-9s %s  %s" % (c["changeType"], c["resourceId"].split("/providers/", 1)[-1], paths))
