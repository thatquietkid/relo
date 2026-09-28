# Relo deployment

Relo deploys as three process boundaries from the same repository:

- `relo-web` builds the React application and serves it through Nginx.
- `relo-api` runs the Fastify API and owns authenticated Supabase access.
- `relo-worker` runs the separate worker process and is intentionally not used by browser clients.

## Render free-plan compatibility

Render free does not provide a background-worker service. The Blueprint therefore models `relo-worker` as a web service for this plan only. The container still runs `worker/dist/main.js`, keeps its own process and Docker image, and serves only `GET /healthz` on the Render port. No API routes or worker credentials are exposed through that endpoint.

When a paid Render plan is available, change only the Blueprint service type to `worker` and remove `WORKER_HTTP_PORT` and the health check. The worker code and Dockerfile remain the same. This keeps the logical worker boundary stable across plans.

## Required Render environment variables

Set these in the Render dashboard. The Blueprint uses `sync: false` for secrets so they are never committed to Git:

| Service | Variable | Purpose |
| --- | --- | --- |
| `relo-api` | `SUPABASE_PUBLISHABLE_KEY` | Supabase browser-safe key used by authenticated API flows |
| `relo-api` | `SUPABASE_SERVICE_ROLE_KEY` | Server-only provisioning or controlled admin operations |
| `relo-api` | `SUPABASE_URL` | Supabase project URL, already set in the Blueprint |
| `relo-api` | `FRONTEND_ORIGIN` | Exact web origin allowed for CORS and OAuth redirects |
| `relo-api` | `SMTP_HOST` | SMTP host for Supabase Auth configuration or server mail integrations |
| `relo-api` | `SMTP_PORT` | SMTP port |
| `relo-api` | `SMTP_USER` | SMTP username |
| `relo-api` | `SMTP_PASSWORD` | SMTP password |
| `relo-api` | `SMTP_FROM` | Verified sender address |

Do not add Supabase service-role keys, SMTP credentials, OAuth client secrets, or downloaded provider JSON files to the web service. Do not commit them to Git.

## Readiness and health checks

- `GET /healthz` is a lightweight liveness response and remains available on the web and API services.
- `GET /readyz` on the API returns `200` only when production Supabase configuration is present. Missing configuration returns `503` without returning secret values.
- `GET /healthz` on the free-plan worker compatibility service confirms that the worker process is alive.

## Deploying a Blueprint

1. Push the branch containing `render.yaml` to GitHub.
2. In Render, create a new Blueprint from the repository and select the branch.
3. Review the three Docker services and keep the service names stable.
4. Add the `sync: false` values in the Render dashboard before the API deploy becomes healthy.
5. Confirm the web service can reach the API URL and that the API `/readyz` check is green.

The Docker images use multi-stage builds, omit environment files from the build context, and run application processes as non-root users. The web image enables gzip at the Nginx boundary.
