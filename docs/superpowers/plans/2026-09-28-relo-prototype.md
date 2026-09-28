# Relo Prototype Implementation Plan

> **For agentic workers:** This prototype is intentionally frontend-only. It uses local state to demonstrate the approved employee and HR workflows; it is not a production authentication or microservice implementation.

**Goal:** Build a self-contained clickable Relo prototype that demonstrates the employee relocation workspace, trusted directory discovery, consent-based requests, and HR progress dashboard.

**Architecture:** Static HTML, CSS, and JavaScript served from `prototype/`. The UI uses an in-memory state model that mirrors the approved relocation, directory, request, and reporting contracts. No external dependencies, credentials, or network APIs are required.

**Tech Stack:** Semantic HTML, CSS custom properties, vanilla JavaScript, Python HTTP server for local preview, Playwright smoke verification.

**Spec:** `docs/superpowers/specs/2026-09-24-relo-platform-design.md`

## Global Constraints

- The prototype must demonstrate employee and HR flows without a backend.
- The prototype must not imply that authentication, authorization, persistence, or provider delivery are production-ready.
- Content must communicate trust through verification, freshness, and consent states.
- Responsive behavior must work at desktop and mobile widths.
- Keyboard focus, reduced motion, semantic labels, and readable contrast are required.

## Review Focus

- Employee completes checklist item and progress updates without duplicating completion.
- Directory shortlist and request actions update visible state and preserve the consent boundary.
- HR view communicates operational progress without exposing private employee notes.
- Responsive navigation remains usable at narrow widths.
- Empty, loading-like, and success states remain actionable.

### Task 1: Prototype shell and visual system

**Files:**
- Create: `prototype/index.html`
- Create: `prototype/styles.css`
- Create: `prototype/app.js`

- [ ] Build the semantic application shell with employee and HR role switcher.
- [ ] Add the visual token system, responsive layout, navigation, and shared status components.
- [ ] Add initial employee home with progress, next action, curated recommendations, and activity rail.

### Task 2: Employee workflow interactions

**Files:**
- Modify: `prototype/app.js`
- Modify: `prototype/index.html`

- [ ] Add checklist completion and progress calculation.
- [ ] Add Explore filtering, shortlist toggles, detail view, and request-contact modal.
- [ ] Add Saved and Requests views with explicit request status and consent copy.

### Task 3: HR workflow

**Files:**
- Modify: `prototype/app.js`
- Modify: `prototype/index.html`

- [ ] Add HR overview metrics, attention queue, employee table, and program health panel.
- [ ] Add invite employee modal and success feedback without persisting real data.

### Task 4: Verification and handoff

**Files:**
- Create: `prototype/README.md`
- Create: `prototype/verify_prototype.py`

- [ ] Run a local static server and Playwright smoke tests for employee and HR paths.
- [ ] Capture a desktop screenshot and inspect console output.
- [ ] Record prototype boundaries and next production implementation steps.

## Acceptance Criteria

- [ ] The prototype opens locally with no build step or dependency install.
- [ ] Employee can navigate Home, Checklist, Explore, Saved, and Requests.
- [ ] Completing a checklist item changes its state and overall progress.
- [ ] Saving a directory item updates Saved and the card control.
- [ ] Submitting a contact request shows consent copy, creates a visible request, and updates the request view.
- [ ] HR role switch displays dashboard metrics, employee progress, and invite interaction.
- [ ] Layout remains usable at 390px and 1440px viewport widths.
- [ ] Browser smoke tests complete with no uncaught page errors.

## `$ship` Handoff

Start with the prototype files in `prototype/`, then replace local state in this order: Identity & Tenant contract, Relocation Case contract, Directory & Content contract, Request / Referral contract, Notification events, and Reporting projection. Keep the UI contracts stable while replacing the adapters.
