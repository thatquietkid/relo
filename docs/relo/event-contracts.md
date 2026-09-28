# Relo API and Event Contract Starter

This is a contract starter for service implementation. It is deliberately small; OpenAPI and AsyncAPI definitions should be generated from these decisions during implementation.

## API conventions

- External API prefix: `/api/v1`.
- JSON over HTTPS; timestamps use RFC 3339 UTC.
- Authentication: OIDC access token; services validate issuer, audience, expiry, and key ID.
- Required request headers: `X-Correlation-Id`; mutating endpoints also accept `Idempotency-Key`.
- Response envelope for errors:

```json
{
  "error": {
    "code": "REQUEST_ALREADY_EXISTS",
    "message": "A request for this item is already open.",
    "correlationId": "c_01J...",
    "details": {}
  }
}
```

- Do not return stack traces, database identifiers, internal moderation notes, or provider secrets.
- List endpoints use cursor pagination and an explicit `nextCursor`.
- Authorization failures use `404` when resource existence should not be disclosed; use `403` when the caller is allowed to know the resource exists but lacks an action.

## Core REST endpoints

### Identity & Tenant

```text
POST /api/v1/tenants/{tenantId}/invitations
POST /api/v1/invitations/{token}/accept
GET  /api/v1/me
GET  /api/v1/tenants/{tenantId}/members
PATCH /api/v1/tenants/{tenantId}/members/{memberId}
```

### Relocation Case

```text
POST /api/v1/tenants/{tenantId}/relocations
GET  /api/v1/relocations/{relocationId}
PATCH /api/v1/relocations/{relocationId}/profile
GET  /api/v1/relocations/{relocationId}/checklist
POST /api/v1/relocations/{relocationId}/checklist/{itemId}/complete
```

### Directory & Content

```text
GET  /api/v1/tenants/{tenantId}/directory/items
GET  /api/v1/directory/items/{itemId}
POST /api/v1/directory/items/{itemId}/shortlist
GET  /api/v1/admin/content/review-queue
POST /api/v1/admin/content/{contentId}/publish
POST /api/v1/admin/content/{contentId}/unpublish
```

### Request / Referral

```text
POST /api/v1/relocations/{relocationId}/requests
GET  /api/v1/relocations/{relocationId}/requests
GET  /api/v1/requests/{requestId}
POST /api/v1/requests/{requestId}/cancel
POST /api/v1/requests/{requestId}/status
```

### HR reporting

```text
GET /api/v1/tenants/{tenantId}/dashboard
GET /api/v1/tenants/{tenantId}/relocation-progress
GET /api/v1/tenants/{tenantId}/reports/exports
```

## Service-owned data model

| Service | Owns | Does not own |
|---|---|---|
| Identity & Tenant | tenants, members, roles, invitations, policy references | relocation progress, content, request notes |
| Relocation Case | relocations, policy snapshots, checklist items, employee preferences | provider records, notification delivery |
| Directory & Content | cities, content revisions, providers, listings, moderation decisions | employee private notes, HR progress |
| Request / Referral | shortlists, requests, consent records, request state transitions | provider catalog truth |
| Notification | templates, preferences, delivery attempts, suppression state | employee case state |
| Reporting | denormalized read models and aggregate metrics | source-of-truth writes |

For V1, each service can use a separate database on the same managed PostgreSQL cluster. No cross-database foreign keys. The deployment can later move a service to its own cluster without changing its public contract.

## Event envelope

```json
{
  "eventId": "evt_01J...",
  "eventType": "RelocationCreated",
  "eventVersion": 1,
  "occurredAt": "2026-09-24T10:30:00Z",
  "tenantId": "ten_01J...",
  "aggregateType": "relocation",
  "aggregateId": "rel_01J...",
  "correlationId": "c_01J...",
  "causationId": "cmd_01J...",
  "dataClassification": "confidential",
  "payload": {}
}
```

## Initial event catalog

| Event | Producer | Consumers | Sensitive fields |
|---|---|---|---|
| `EmployeeInvited` | Identity & Tenant | Notification, Reporting | email hash or masked email only |
| `MembershipAccepted` | Identity & Tenant | Reporting | member ID, tenant ID |
| `RelocationCreated` | Relocation Case | Notification, Reporting | no free-text profile fields |
| `ChecklistItemCompleted` | Relocation Case | Reporting, Notification | item ID and completion time |
| `ItemShortlisted` | Request / Referral | Reporting | item ID only |
| `ServiceRequestCreated` | Request / Referral | Notification, Reporting | consent scope, request ID |
| `ServiceRequestStatusChanged` | Request / Referral | Notification, Reporting | state and actor type |
| `ContentPublished` | Directory & Content | Reporting, read-model refresh | content ID, revision ID |
| `NotificationDeliveryChanged` | Notification | Reporting, operations | provider message ID, status |

## Idempotency and retries

- Mutating APIs persist `Idempotency-Key` with request hash and response metadata for at least 24 hours.
- Consumers store processed `eventId` values per subscription.
- Retryable failures use exponential backoff with jitter and a bounded retry count.
- Poison messages move to a dead-letter stream with the original event, error code, and retry history.
- Event consumers must tolerate duplicate delivery and out-of-order delivery.
