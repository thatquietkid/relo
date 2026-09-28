# Relo prototype

This is a frontend-only prototype of the approved Relo relocation onboarding experience.

## Run locally

From the repository root:

```powershell
python -m http.server 4173 --directory prototype
```

Open <http://127.0.0.1:4173>.

## Docker

Build and run the production-shaped container from the repository root:

```powershell
docker build -t relo-prototype:local .
docker run --rm -p 4173:10000 relo-prototype:local
```

The Node server binds to `0.0.0.0`, honors Render's `PORT`, serves `/healthz`, and gzip-compresses HTML, CSS, and JavaScript when the client advertises `Accept-Encoding: gzip`.

## Render

`render.yaml` defines a free Docker web service in Singapore with `/healthz` as its health check. Render builds the image from the committed `Dockerfile`; no registry push is required for the Git-backed Blueprint path.

## What is interactive

- Switch between Employee and HR view.
- Employee navigation: home, checklist, explore, saved, requests, and profile.
- Complete checklist items to update progress.
- Filter/search directory items, open details, save items, and submit a consent-based request.
- HR navigation: overview, employees, programs, content, reports, and settings.
- Invite an employee from the HR overview.

## Prototype boundary

All state is in memory and resets on refresh. There is no real authentication, persistence, API, provider handoff, email delivery, or tenant isolation. Those are represented visually and should be replaced with the service contracts in `docs/relo/event-contracts.md` during production implementation.
