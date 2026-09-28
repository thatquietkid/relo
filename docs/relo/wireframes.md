# Relo MVP Wireframes and User Flows

These are low-fidelity, implementation-neutral wireframes. They define information hierarchy and states, not final visual styling.

## Navigation model

### Employee

`Home` · `My checklist` · `Explore` · `Saved` · `Requests` · `Profile`

### HR

`Overview` · `Employees` · `Programs` · `Content` · `Reports` · `Settings`

### Content reviewer

`Review queue` · `Published content` · `Cities` · `Providers` · `Audit log`

## Employee home

```text
+------------------------------------------------------------------+
| Relo                                      [Help] [Notifications] |
+------------------------------------------------------------------+
| Welcome, Rohan                         Bangalore · 18 days away  |
|                                                                  |
| Your relocation at a glance                                     |
| [##########------] 62% complete                                  |
| 4 of 7 important tasks complete                                  |
|                                                                  |
| NEXT BEST ACTION                                                  |
| Confirm your preferred office area                 [Continue]    |
|                                                                  |
| Recommended for you                                               |
| [Housing near office] [Moving services] [City essentials]        |
|                                                                  |
| Saved options (3)                         [View all]              |
| [Listing card] [Listing card] [Listing card]                     |
+------------------------------------------------------------------+
```

States to design: first visit, incomplete profile, no recommendations yet, service unavailable, and completed relocation.

## Employee onboarding

```text
+------------------------------------------------------------------+
| Set up your relocation                         Step 2 of 4       |
| [Profile] ---- [Preferences] ---- [Checklist] ---- [Ready]       |
+------------------------------------------------------------------+
| Where are you moving?                                             |
| From        [ Pune                         v ]                    |
| To          [ Bangalore                    v ]                    |
| Office      [ Koramangala                  v ]                    |
| Move date   [ 12 Oct 2026                  ]                     |
|                                                                  |
| What matters to you?                                             |
| [ ] Short commute  [ ] Family-friendly  [ ] Furnished            |
| [ ] Budget-first   [ ] Pet-friendly     [ ] Near transit          |
|                                                                  |
| We use these choices to personalize recommendations.              |
| [Back]                                               [Continue]  |
+------------------------------------------------------------------+
```

Principles: progressive disclosure, no long form on the first screen, clear consent copy, resumable progress, and a visible skip path for nonessential preferences.

## Checklist

```text
+------------------------------------------------------------------+
| My checklist                                      [Filter] [Sort] |
+------------------------------------------------------------------+
| Before you move                                                   |
| [x] Confirm move date                              Complete       |
| [x] Choose preferred office area                   Complete       |
| [ ] Compare housing options                        Recommended    |
| [ ] Request a moving-service call                  Optional       |
|                                                                  |
| After you arrive                                                   |
| [ ] Set up local essentials                         Locked        |
| [ ] Confirm first-week check-in                     Locked        |
+------------------------------------------------------------------+
```

The UI must distinguish required, recommended, optional, blocked, overdue, and completed states. A blocked item explains the prerequisite rather than failing silently.

## Explore directory

```text
+------------------------------------------------------------------+
| Explore Bangalore                                   [Search]     |
| [Housing] [Moving] [Schools] [Healthcare] [Essentials]            |
+------------------------------------------------------------------+
| Filters: [Near office v] [Budget v] [Verified only x]            |
|                                                                  |
| Why these results?                                                |
| Based on your office area, commute preference, and employer       |
| program.                                                          |
|                                                                  |
| [Verified] 2BHK near Koramangala                                  |
| ★ 4.6 · 1.8 km from office · Furnished · Updated 2 days ago       |
| [Save] [View details]                                              |
|                                                                  |
| [Verified] Movers familiar with corporate transfers               |
| Background-checked contact · Responds within one business day     |
| [Save] [Request contact]                                           |
+------------------------------------------------------------------+
```

Directory cards must show provenance, verification date, freshness, and the reason a result is recommended. Avoid implying that Relo guarantees a provider or property.

## Request contact

```text
+------------------------------------------------------------------+
| Request help                                                       |
| Moving service: Example Movers                                     |
+------------------------------------------------------------------+
| What should we share?                                              |
| [x] Name and preferred contact method                              |
| [x] Destination city and target move date                          |
| [ ] Household details                                               |
|                                                                  |
| Message (optional)                                                  |
| [ I am looking for ...                                      ]       |
|                                                                  |
| The provider may contact you about this request.                   |
| [Cancel]                                  [Submit request]         |
+------------------------------------------------------------------+
```

After submission, show request ID, status, expected next step, withdrawal option, and privacy link. Prevent duplicate submissions with an idempotency key and a visible existing-request state.

## HR overview

```text
+------------------------------------------------------------------+
| Relo Admin                                      [Invite employee]  |
+------------------------------------------------------------------+
| Program health                                                     |
| Active relocations 42 | Invitations pending 8 | Avg. progress 71% |
|                                                                  |
| Needs attention                                                    |
| - 3 employees have not accepted invitations                        |
| - 5 service requests awaiting acknowledgement                       |
|                                                                  |
| Recent employees                                                   |
| Name              Destination      Move date       Progress        |
| Rohan Verma       Bangalore         12 Oct          62%             |
| Aisha Khan        Hyderabad          03 Nov          18%             |
|                                                                  |
| [View employee] [Send reminder] [Export report]                    |
+------------------------------------------------------------------+
```

HR views must minimize sensitive details. The default dashboard shows operational progress, not private employee notes or unnecessary household information.

## HR invite flow

```text
HR Overview -> Invite employee -> Enter work email and move details
             -> Review allowance/checklist policy -> Send invite
             -> Invitation status: pending / accepted / expired / revoked
```

## User-flow acceptance criteria

- An employee can reach a useful next action within two screens after accepting an invitation.
- An employee can save a directory item without sharing it with HR.
- A contact request makes consent and provider handoff explicit.
- HR can invite, remind, filter, and inspect progress without seeing private notes by default.
- Every loading, empty, error, permission-denied, and stale-content state has a designed response.
