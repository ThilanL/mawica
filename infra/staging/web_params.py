#!/usr/bin/env python3
"""Decide the web app's URL and custom-domain template parameters for a FULL deployment of infra/staging/app.json.

A full deployment replaces the container app's ingress and environment. Anything not passed is lost, so by default this helper
CARRIES FORWARD the live values (custom domain + certificate, site URL, extra trusted origins) and only changes them when asked.

stdin JSON:
  {"envId": "/subscriptions/.../managedEnvironments/cae-mawica-stg",
   "azureDefaultUrl": "https://ca-mawica-stg.<env default domain>",
   "live": {"exists": bool, "customDomains": [{"name", "certificateId", "bindingType"}], "env": {"NEXT_PUBLIC_SITE_URL", "AUTH_TRUSTED_ORIGINS"}},
   "request": {"SITE_URL", "AUTH_TRUSTED_ORIGINS", "CUSTOM_DOMAIN", "CUSTOM_DOMAIN_CERT_ID", "REPLACE_DOMAIN"}}   (empty = not requested)
stdout JSON: {"siteUrl", "authTrustedOrigins", "customDomainName", "customDomainCertificateId"}; exit 1 with "STOP: ..." on stderr.

Rules:
  - siteUrl "" means the Azure default (the template computes it), so the default deployment stays byte-identical.
  - AUTH_TRUSTED_ORIGINS="none" clears the live value; otherwise every entry must be an https origin (no path, no wildcard).
  - A live custom domain is kept unless CUSTOM_DOMAIN names it again (optionally with a new certificate) or REPLACE_DOMAIN=yes.
  - A certificate must be a resource of THIS environment (managedCertificates/ or certificates/). More than one live domain: STOP.
"""
import json
import re
import sys

HOST = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+"
ORIGIN = re.compile(r"^https://" + HOST + r"(?::\d{1,5})?$")


class Stop(Exception):
    pass


def origin(value, what):
    if not ORIGIN.match(value or ""):
        raise Stop("%s must be an https origin like https://staging.mawica.com (no path, no wildcard): %r" % (what, value))
    return value


def decide(d):
    env_id = d["envId"].rstrip("/")
    default = origin(d["azureDefaultUrl"], "azureDefaultUrl")
    live = d.get("live") or {}
    req = {k: (v or "").strip() for k, v in (d.get("request") or {}).items()}
    live_env = (live.get("env") or {}) if live.get("exists") else {}
    live_domains = (live.get("customDomains") or []) if live.get("exists") else []
    if len(live_domains) > 1:
        raise Stop("more than one live custom domain; this template supports one")

    # Site URL: request > live > Azure default ("" = template default).
    site = req.get("SITE_URL") or live_env.get("NEXT_PUBLIC_SITE_URL") or default
    site = origin(site.rstrip("/"), "SITE_URL")
    site_param = "" if site == default else site

    # Extra trusted origins: request ("none" clears) > live > none.
    raw = req.get("AUTH_TRUSTED_ORIGINS")
    if raw == "none":
        raw = ""
    elif not raw:
        raw = live_env.get("AUTH_TRUSTED_ORIGINS") or ""
    entries = [origin(e.strip(), "AUTH_TRUSTED_ORIGINS entry") for e in raw.split(",") if e.strip()]
    entries = [e for e in entries if e != site]  # the site itself is always allowed
    trusted = ",".join(dict.fromkeys(entries))

    # Custom domain.
    name, cert = req.get("CUSTOM_DOMAIN", "").lower(), req.get("CUSTOM_DOMAIN_CERT_ID", "")
    live_name = live_domains[0]["name"].lower() if live_domains else ""
    live_cert = live_domains[0].get("certificateId") or "" if live_domains else ""
    if not name:
        name, cert = live_name, live_cert  # keep the live binding (or none)
    else:
        if not re.fullmatch(HOST, name):
            raise Stop("CUSTOM_DOMAIN is not a hostname: %r" % name)
        if live_name and name != live_name and req.get("REPLACE_DOMAIN") != "yes":
            raise Stop("live custom domain %s would be removed; set REPLACE_DOMAIN=yes deliberately" % live_name)
        if not cert and name == live_name:
            cert = live_cert
    if name:
        if not cert:
            raise Stop("custom domain %s has no certificate ID" % name)
        if not re.fullmatch(re.escape(env_id) + r"/(managedCertificates|certificates)/[A-Za-z0-9._-]+", cert, re.I):
            raise Stop("certificate must belong to this Container Apps environment: %r" % cert)
        if live_domains and live_name == name and (live_domains[0].get("bindingType") or "SniEnabled") != "SniEnabled":
            raise Stop("live binding for %s is not SniEnabled; refusing to change its type silently" % name)
    return {"siteUrl": site_param, "authTrustedOrigins": trusted, "customDomainName": name, "customDomainCertificateId": cert if name else ""}


def main():
    try:
        print(json.dumps(decide(json.load(sys.stdin)), separators=(",", ":")))
        return 0
    except Stop as e:
        print("STOP: " + str(e), file=sys.stderr)
        return 1
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        print("STOP: could not read the live web app state (%s)" % type(e).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
