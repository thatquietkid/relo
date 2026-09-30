# Relo Web Workspace

Production React + TypeScript application for the Relo Global Mobility Platform, built with Vite and modern vanilla CSS design tokens.

---

## Architectural Highlights

### 1. Modular API Client Layer (`src/app/api/`)
The API client layer is partitioned into focused, domain-specific modules:

```
src/app/api/
├── base.ts          # Core typed request<T>(), ApiFailure class, network error interceptor
├── auth.ts          # Session exchange, OTP verify/request, OAuth approval/denial
├── profile.ts       # User profile retrieval and patch updates
├── employee.ts      # Cases, checklists, notifications, preferences
├── directory.ts     # Provider search, shortlisting, request preview & submission
├── hr.ts            # Properties, cohorts, provider requests, AARRR analytics
├── admin.ts         # Platform events and audit log
└── index.ts         # Consolidated barrel export
```

*Backwards Compatibility:* `src/app/auth/auth-client.ts` re-exports all methods from `src/app/api/` ensuring zero disruption to existing imports.

---

## Error Handling Architecture

The frontend implements comprehensive, human-readable error reporting at every layer:

### Global Error Boundary (`src/components/ErrorBoundary.tsx`)
- Catches unhandled React lifecycle and render errors across the entire application tree.
- Renders the custom **500 Server Error** screen with safe error descriptions and retry/reload actions.

### Dedicated Error Pages
- **404 Page (`src/pages/errors/NotFoundPage.tsx`)**: Rendered for unmatched routes with navigation buttons to return to the active workspace.
- **403 Page (`src/pages/errors/ForbiddenPage.tsx`)**: Rendered when a user's role lacks permissions for a protected workspace module. Displays the required permission token.
- **500 Page (`src/pages/errors/ServerErrorPage.tsx`)**: Technical crash screen with correlation `requestId` and expandable stack traces for developer diagnostics.

### Inline Error Banner (`src/components/ErrorBanner.tsx`)
- Reusable, accessible banner for API mutation failures.
- Normalizes server error codes (e.g. `VALIDATION_ERROR`, `NETWORK_ERROR`), displays human-friendly messages, field-level detail lists, and allows immediate retry or dismissal.

---

## Key Features

### 1. Employee Profile Editing (`src/pages/employee/ProfileEditPage.tsx`)
- View and edit personal information (Full Name, Phone, Job Title, Department, Bio/Relocation notes).
- Configure privacy options (email notifications, in-app notifications, partner contact sharing).
- Seamless routing from `/profile` -> `/profile/edit`.

### 2. HR Corporate Housing (`src/pages/hr/PropertiesPage.tsx`)
- View and filter company-approved property listings by city or property type (Apartment, Condo, Studio, House).
- Modal form to enlist new properties with specifications, rent, deposit, availability, and amenities.
- Quick listing deletion and status updates.

### 3. HR Relocation Cohorts (`src/pages/hr/CohortsPage.tsx`)
- Group staff relocating to the same destination into cohorts (e.g. "Q4 Tech Expansion - London").
- Track member count, budget per employee, timeline, and status (`planning`, `active`, `completed`).
- Modal creation dialog and in-row status transitions.

### 4. Centered Progress Ring Component
- The circular progress indicator in `src/components/employee/ProgressCard.tsx` has been redesigned with flex baseline alignment.
- Percentage text (`20%`) is prominently centered inside the SVG circle without splitting into separate top/bottom grid rows.
- Replaced em dashes (`—`) with hyphens across components for clean typography.

---

## Development & Build

```bash
# Run local Vite development server
npm run dev

# Compile TypeScript and bundle production assets
npm run build

# Run unit tests
npx vitest run web/test
```
