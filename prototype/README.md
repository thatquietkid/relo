# Relo prototype

This is the frontend microservice prototype for the approved Relo relocation onboarding experience. The separate `backend/` service owns Supabase Auth sessions, email OTP flows, RBAC, the admin event feed, SMTP-triggered email flows, and AARRR metrics.

## Run locally

From the repository root:

```powershell
$env:RELO_API_URL = "http://127.0.0.1:4100"
node prototype/server.js
node backend/server.js
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

- Sign in through the backend with a six-digit email OTP. Dashboards are not rendered without a valid session.
- OAuth Server consent: Supabase redirects third-party clients to `/oauth/consent?authorization_id=...`; the page requires a Relo session, shows the client, callback URL, and scopes, then calls Supabase to approve or deny the request.
- Employee navigation: home, checklist, explore, saved, requests, and profile.
- Complete checklist items to update progress.
- Filter/search directory items, open details, save items, and submit a consent-based request.
- HR navigation: overview, employees, programs, content, reports, and settings.
- Invite an employee from the HR overview.
- Admin navigation: major events, organizations, security, and settings. Major events are visible only to the `admin` role.

## Prototype boundary

The UI state is still intentionally lightweight, but authentication, AARRR data, admin events, and the OAuth consent surface now cross real service boundaries. Supabase stores users, profiles, role, tenant membership, relocation cases, platform events, and metrics with RLS. Configure a real SMTP provider and an OTP email template containing `{{ .Token }}` in Supabase Auth before production. In Supabase Authentication → OAuth Server, set the Authorization path to `/oauth/consent` and use the deployed frontend URL as the Site URL. OAuth consent calls stay behind the backend bearer-token boundary; no service-role key is exposed to the browser.
