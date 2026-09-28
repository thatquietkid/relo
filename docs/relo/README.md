# Relo Architecture Package

Relo is a B2B corporate-relocation onboarding platform. This package is written for product, engineering, security, QA, and operations review.

## Documents

- [Architecture and product design](../superpowers/specs/2026-09-24-relo-platform-design.md)
- [Wireframes and user flows](wireframes.md)
- [API and event contract starter](event-contracts.md)

## Current recommendation

Use independently deployable, event-aware services with service-owned data, a managed OIDC identity provider, an API gateway/BFF, a durable event bus, and PostgreSQL-backed service stores. Keep the service count small and run them on a managed container platform; avoid shared tables, distributed transactions, and self-managed Kubernetes in V1.

## Review order

1. Confirm product scope and non-goals.
2. Confirm service boundaries and data ownership.
3. Confirm the employee and HR workflows.
4. Confirm security/privacy and operating assumptions.
5. Convert the task tree into an implementation plan after design review.
