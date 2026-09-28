# Relo backend prototype

This service is intentionally separate from the frontend. It owns the API boundary, Supabase Auth session exchange, email OTP flow, role checks, OAuth Server consent calls, the admin event feed, and the first AARRR read model. Supabase Postgres and RLS are the system of record.

## Local run

```powershell
npm install
$env:PORT = "4100"
npm start
```

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `FRONTEND_ORIGIN`. `SUPABASE_SERVICE_ROLE_KEY` is required for the admin-only employee invitation endpoint and must remain a Render secret; never expose it to the browser. Email OTPs, verification, password reset, and invitations use Supabase Auth's SMTP configuration; SMTP credentials belong in Supabase Auth email settings, never in this service or the browser. The Magic Link email template must render `{{ .Token }}` for six-digit OTP delivery.

The admin control plane is restricted to `profiles.role = 'admin'` and reads `platform_events` through RLS. Provision admins and HR users through Supabase Auth/database administration; public self-service registration is disabled. Admins can invite employee users from the dashboard, but the endpoint always assigns the `employee` role server-side. OAuth consent is available only to users with a Relo profile and forwards approval/denial to Supabase OAuth Server; the frontend never receives the service-role key. In production, keep the service-role key out of the app and add durable event ingestion and tenant-specific metric projections.
