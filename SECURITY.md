# Security deployment checklist

## Required before deployment

1. Set `ADMIN_PASSWORD` in your hosting provider's environment settings to a new, unique value of at least 12 characters. Do not commit a real password or `.env` file.
2. The previous admin password was present in public source. Treat it as compromised and do not reuse it anywhere.
3. Set `ALLOWED_ORIGINS` only when a separately hosted frontend needs cross-origin API access. Leave it empty for the same-origin site.
4. Deploy over HTTPS. Never expose the admin API over plain HTTP on a public network.
5. Customer enquiries, applications and subscriber records are runtime data. They are excluded from Git going forward; configure a persistent private data store/volume for your host.

## Important data-exposure cleanup

Removing `data/*.json` from this branch does not erase copies already present in Git history or forks/caches. The repository previously contained customer/contact details. Treat those details as exposed: remove the data from Git history using an approved history-rewrite procedure, coordinate with collaborators, and consider rotating any credentials or contact channels that may have been exposed. Do not force-push a rewritten history without coordinating first.

## Current implementation notes

- Admin login now uses an environment-supplied password and issues a random, expiring bearer session.
- Login and public form endpoints have per-process rate limits and request-size limits.
- Public forms validate field types and maximum lengths.
- CSV export neutralizes spreadsheet formula prefixes.
- CORS is restricted to configured origins.
- The rate limiter and admin sessions are in-memory and reset on restart; use shared/persistent stores for multi-instance production deployments.
- CSP no longer allows `unsafe-eval`. Inline scripts/styles remain temporarily enabled for compatibility and should be migrated to external files/nonces before removing `unsafe-inline`.
- This is a source-level hardening change. Run functional tests and a dependency audit before production release.
