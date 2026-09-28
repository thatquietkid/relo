# Relo backend prototype

This service is intentionally separate from the frontend. It owns the API boundary, Supabase Auth session exchange, email OTP flow, role checks, the admin event feed, and the first AARRR read model. Supabase Postgres and RLS are the system of record.

## Local run

```powershell
npm install
$env:PORT = "4100"
npm start
```

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `FRONTEND_ORIGIN`. Email OTPs, verification, password reset, and invitations use Supabase Auth's SMTP configuration; SMTP credentials belong in Supabase Auth email settings, never in this service or the browser. The Magic Link email template must render `{{ .Token }}` for six-digit OTP delivery.

The admin control plane is restricted to `profiles.role = 'admin'` and reads `platform_events` through RLS. Provision admins through Supabase Auth, then assign roles through an audited control-plane workflow. In production, keep the service-role key out of the app and add durable event ingestion and tenant-specific metric projections.
