# Development demo portal access

The login page can expose demo sign-in buttons for the Employee, HR, and Admin portals. Demo access is disabled by default and uses ordinary Supabase Auth sessions and the existing server-side membership checks.

## Configure the development API

Create three password-enabled users in the **development Supabase project**. Give each user an active membership whose first role is respectively `employee`, `hr`, or `admin`. Do not reuse production accounts.

Set these variables on the API process:

```dotenv
NODE_ENV=development
RELO_DEMO_ACCESS_ENABLED=true
RELO_DEMO_EMPLOYEE_EMAIL=
RELO_DEMO_EMPLOYEE_PASSWORD=
RELO_DEMO_HR_EMAIL=
RELO_DEMO_HR_PASSWORD=
RELO_DEMO_ADMIN_EMAIL=
RELO_DEMO_ADMIN_PASSWORD=
FRONTEND_ORIGIN=http://localhost:8085
```

Keep the account passwords in the API environment only. The API registers `/api/v1/auth/demo` only when `NODE_ENV` is `development`, the flag is `true`, and all six account values are present. It also requires the request origin to exactly match `FRONTEND_ORIGIN`.

## Configure the development web app

Set these variables for the Vite app:

```dotenv
VITE_RELO_DEMO_ACCESS_ENABLED=true
VITE_RELO_API_URL=http://localhost:4100
```

Localhost is allowed automatically. For a hosted development web app, also set `VITE_RELO_DEMO_ACCESS_HOSTS` to a comma-separated list of exact hostnames (without protocol or path), and configure that app's API with `NODE_ENV=development`, the same demo flag and accounts, and its exact origin in `FRONTEND_ORIGIN`. The web buttons stay hidden for any host not on that list.

The production Render Blueprint keeps `NODE_ENV=production`, which disables the API route even if demo variables are accidentally copied there. Keep the Vite demo flag off in production builds as well.
