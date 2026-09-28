# Relo backend prototype

This service is intentionally separate from the frontend. It owns the API boundary, Supabase Auth session exchange, role checks, and the first AARRR read model. Supabase Postgres and RLS are the system of record.

## Local run

```powershell
npm install
$env:PORT = "4100"
npm start
```

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `FRONTEND_ORIGIN`. Email verification, password reset, and invitations use Supabase Auth's SMTP configuration; SMTP credentials belong in the Supabase dashboard, never in this service or the browser.

In production, keep the service-role key out of the app, provision HR/admin roles through an audited control plane, and add durable event ingestion and tenant-specific metric projections.
