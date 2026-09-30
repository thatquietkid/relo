# Relo Backend Service

Modular Node.js API service for the Relo Global Mobility Platform. Owns authentication session exchange, role authorization boundaries, user profile management, HR corporate housing & cohorts, OAuth server consent flows, and administrative telemetry feeds.

---

## Architecture Overview

The backend has been modularized from a single monolithic server into cleanly separated concerns:

```
backend/
├── lib/
│   ├── auth.js            # Supabase client factory, token extraction, role verification
│   ├── errors.js          # AppError hierarchy (ValidationError, NotFoundError, etc.)
│   └── http.js            # JSON response serialization, CORS preflight, body parser
├── middleware/
│   └── error-handler.js   # Centralized error handler with X-Request-ID and error codes
├── routes/
│   ├── admin.js           # /api/admin/* (events, employee invitations)
│   ├── auth.js            # /api/auth/* (password login, email OTP, logout, me, reset)
│   ├── dashboard.js       # /api/dashboard/* and /api/growth/aarrr
│   ├── hr.js              # /api/hr/* (properties listing, relocation cohorts)
│   ├── oauth.js           # /api/oauth/* (authorization details, approve, deny)
│   └── profile.js         # /api/profile (fetch and update user profile)
├── admin-events.js        # Admin event querying & sanitization
├── admin-users.js         # Admin employee invite normalization
├── server.js              # HTTP server bootstrap, route dispatcher
└── package.json
```

---

## API Reference

### Authentication & Identity
| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | None | Email + password login, returns session tokens & profile |
| `POST` | `/api/auth/request-otp` | None | Dispatches 6-digit magic code via Supabase SMTP |
| `POST` | `/api/auth/verify-otp` | None | Verifies 6-digit code and creates active session |
| `GET` | `/api/auth/me` | Bearer Token | Fetches currently authenticated user identity |
| `POST` | `/api/auth/reset-password` | None | Sends password reset email |
| `POST` | `/api/auth/logout` | Bearer Token | Revokes active Supabase session |

### Profile Management
| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/profile` | Any Authenticated | Retrieves current user profile details |
| `PATCH` | `/api/profile` | Any Authenticated | Updates full name, phone, job title, department, bio, and preferences |

### HR Mobility Operations
| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/hr/properties` | `hr`, `admin` | Lists corporate property listings with filters (city, type, status) |
| `POST` | `/api/hr/properties` | `hr`, `admin` | Enlists a new corporate residential property |
| `PATCH` | `/api/hr/properties/:id` | `hr`, `admin` | Updates property listing attributes or availability |
| `DELETE` | `/api/hr/properties/:id` | `hr`, `admin` | Archives / removes a property from listings |
| `GET` | `/api/hr/cohorts` | `hr`, `admin` | Lists relocation cohorts with status filter |
| `POST` | `/api/hr/cohorts` | `hr`, `admin` | Creates a new relocation cohort (timeline, budget, destination) |
| `PATCH` | `/api/hr/cohorts/:id` | `hr`, `admin` | Updates cohort status, members, or budget |

### Dashboards & Reporting
| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/employee` | `employee`, `admin` | Relocation cases and next action for employee |
| `GET` | `/api/dashboard/hr` | `hr`, `admin` | Organization relocation cases overview |
| `GET` | `/api/growth/aarrr` | `hr`, `admin` | AARRR Pirate Metrics read model |

### Admin Control Plane
| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/admin/events` | `admin` | Filtered platform audit events feed |
| `POST` | `/api/admin/users` | `admin` | Invites employee into organization |

### OAuth Consent Flow
| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/oauth/authorization-details` | Any Role | Retrieves consent metadata for third-party client |
| `POST` | `/api/oauth/approve` | Any Role | Grants consent to client application |
| `POST` | `/api/oauth/deny` | Any Role | Denies consent to client application |

---

## Standard Error Response Format

All error responses across the backend conform to a predictable structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for new property listing",
    "details": [
      { "field": "rentMonthly", "message": "Monthly rent must be a positive number" }
    ],
    "requestId": "req_84f9b2d011c3"
  },
  "message": "Validation failed for new property listing"
}
```

### Standard Error Codes
- `BAD_REQUEST` (400) - Missing parameters or malformed body
- `UNAUTHORIZED` (401) - Missing or expired Bearer token
- `FORBIDDEN` (403) - Insufficient role permissions for resource
- `NOT_FOUND` (404) - Requested resource or route does not exist
- `PAYLOAD_TOO_LARGE` (413) - Request body exceeds 64KB limit
- `VALIDATION_ERROR` (422) - Business rule or input field validation failed
- `INTERNAL_ERROR` (500) - Unhandled server error (details hidden from client)
- `SERVICE_UNAVAILABLE` (503) - Upstream dependency (e.g. Supabase) unconfigured

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Optional (default: `4100`) | Port on which the HTTP server listens |
| `HOST` | Optional (default: `0.0.0.0`) | Network interface bind address |
| `FRONTEND_ORIGIN` | Optional (default: `*`) | Allowed origin for CORS headers |
| `SUPABASE_URL` | Required for Supabase | URL of Supabase project instance |
| `SUPABASE_PUBLISHABLE_KEY` | Required for Supabase | Anonymous / publishable API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for Admin routes | Elevated key for user invitations (keep secret) |

---

## Development & Testing

```bash
# Run backend server
npm start

# Run unit tests
npm test
```
