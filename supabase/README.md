# Supabase setup

The selected Supabase project is `rxmkcjjiyrteooztynsr`. The core migration is already applied there and is also committed here for repeatable environments.

Configure Supabase Auth before using the deployed login flow:

1. Enable Email provider and email confirmations in Authentication → Providers.
2. Configure a real SMTP provider in Authentication → SMTP Settings. Do not put SMTP credentials in this repository or in the browser.
3. Add `http://127.0.0.1:4173` and `https://relo-prototype.onrender.com` as redirect URLs.
4. Create initial users in Authentication → Users. New users receive an `employee` profile through the database trigger.
5. Grant HR access by assigning the `hr` role and an `organization_id` to the profile through an audited admin workflow. Never let the public client update its own role.

The publishable key may be configured in the backend service. The service-role key is intentionally not required by this prototype and must never be exposed to the frontend.
