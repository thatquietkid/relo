# Relo Platform Implementation Plan Set

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Relo platform as a mobile-friendly web application, separately deployed API, background worker, and Supabase-backed data platform.

**Architecture:** The web service is a React, TypeScript, Vite SPA and PWA. The API is a TypeScript Fastify service with strict domain modules, versioned REST contracts, Supabase Auth, PostgreSQL, and RLS. A worker consumes the transactional outbox for notifications, projections, reminders, and retries. Logical domain boundaries remain separate even while the API starts as one deployable unit.

**Tech Stack:** React, TypeScript, Vite, TanStack Query, Fastify, Zod, Supabase Auth, Supabase PostgreSQL, Vitest, Playwright, Docker, Render.

**Spec:** `docs/superpowers/specs/2026-09-28-relo-full-platform-design.md`

## Global Constraints

- Frontend and backend remain separate deployable services.
- Admin and HR registration remain disabled in the portal; membership is created through controlled database or admin workflows.
- OTP email authentication uses Supabase Auth and deployment-configured SMTP.
- Google login uses Supabase Auth OAuth and never exposes provider secrets to the browser.
- Every dashboard route requires an authenticated session and a permitted role.
- RLS is enabled for every exposed table and server-side authorization is required for every protected route.
- The browser, repository, and container image never contain a Supabase service-role key or OAuth client secret.
- Every retry-sensitive mutation accepts an `Idempotency-Key` and is safe to repeat.
- Domain mutations that emit events write an outbox row in the same database transaction.
- User-facing copy uses a restrained, mobile-first Relo visual system and avoids em dashes.
- Every change includes focused automated tests before implementation is considered complete.

## Review Focus

- A replayed invitation token must not create a second membership, and an expired token must return a safe error.
- A valid session with a revoked membership must lose access on the next protected request.
- A user from tenant A must never read or mutate tenant B records through a changed identifier.
- A repeated request with the same idempotency key must return the original result without duplicate side effects.
- A mobile viewport must keep navigation, forms, tables, consent, and destructive actions usable without horizontal scrolling.

## Plan order and gates

1. [Foundation and identity](2026-09-28-relo-platform-foundation.md) creates the deployable service boundaries, auth, tenancy, RBAC, route shell, and database primitives.
2. [Employee journey](2026-09-28-relo-employee-journey.md) adds onboarding, checklist, directory, shortlist, requests, notifications, profile, and employee settings.
3. [Operations and growth](2026-09-28-relo-operations-growth.md) adds HR, reviewer, platform admin, settings, reporting, and AARRR measurement.
4. [Production hardening](2026-09-28-relo-production-hardening.md) adds worker execution, security controls, operational visibility, accessibility, E2E coverage, and Render delivery.

Each plan must pass its tests and type checks before the next plan begins. Each plan is independently deployable with the previous plan's output.

---

## Execution rule

The implementer reads this index, the approved specification, and the selected sub-plan before changing code. After each task, run the task's focused test, then the relevant package test suite. Commit each independently testable task with a message that names the delivered behavior.
