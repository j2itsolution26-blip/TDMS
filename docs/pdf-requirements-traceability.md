# PDF requirements traceability — `TDMS function_role (finalizing).pdf`

Audit of the `migrate-fastify` branch (base commit 57cfc8e) against every
requirement in the PDF, with the changes made in this pass. Evidence is
file paths in this repository and test runs.

**Statuses**

- **VERIFIED** — implemented and exercised by a test that was run in this pass (see "Test runs").
- **IMPLEMENTED (not re-run)** — code traced end to end; no test exercising it was run in this pass.
- **PARTIAL** — some of the required behaviour exists; the gap is named.
- **MISSING** — no working implementation.
- **BLOCKED** — needs a decision, an official template or data the repository does not have.

✱ marks rows implemented or changed in this pass.

## Super Admin

| Requirement | Status | Evidence / gap |
|---|---|---|
| Admin to all (system administration) | IMPLEMENTED (not re-run) | `shared/lib/policies.ts` (`isSuperAdmin`, allow-listed `can()`), Admin Accounts, access codes, audit logs, system health. Unit tests `admin-accounts.test.ts` pass; `scripts/e2e/admin-access-code.mjs` needs `SUPER_ADMIN_EMAIL`/`PASSWORD` and was not run. Deliberately not unrestricted: staff management and operational work are excluded by design. |

## Admin — Vice President

| Requirement | Status | Evidence / gap |
|---|---|---|
| Manage all accounts for reset | VERIFIED | `controllers/staff/_id/reset-password.ts`, `userPolicy` (`accounts.manage`). `staff-accounts.mjs` 19/19. Admin accounts are reset by the Super Admin only, by design. |
| Same dashboard as the TVET Director | ✱ VERIFIED | The Director's monitoring panel is added below the Admin's operations dashboard (`services/monitoring.ts`, `MonitoringPanel.tsx`). `pdf-gaps.mjs`. |
| Instructor class records not on dashboard | VERIFIED | Neither `adminView` nor the monitoring panel carries class records (asserted in `pdf-gaps.mjs`). |

## TVET Director

| Requirement | Status | Evidence / gap |
|---|---|---|
| Manage school calendar | VERIFIED | `teachingPolicy.manageCalendar`; `diploma-instructor.mjs` creates and checks calendar entries. |
| Archive school year, create new | VERIFIED | `services/teaching/school-years.ts`; `diploma-instructor.mjs` activates and archives a throwaway year and checks history stays attached. |
| Announcements: all instructors / per course / all students / both | ✱ VERIFIED | `services/announcements.ts`, `/announcements`, migration `20261011010000`. Recipients notified; course scoping; withdraw. `pdf-gaps.mjs`. |
| Monitor active/deactivated staff, instructors, students | ✱ VERIFIED | Monitoring panel: staff and instructors active/deactivated, staff by role, students by status. |
| Monitor dropped students, absences, present | ✱ VERIFIED | Dropped count; present/late/absent today and over 30 days from attendance records. |
| Monitor upcoming assessments / activities | ✱ VERIFIED | Open assessment batches (30 days); training activities and school calendar (14 days). |
| Monitor per course DIT and DHT | ✱ PARTIAL | Per-course table (active, dropped, total) is shown. Rolling courses up into "DIT" and "DHT" needs a decision on which course belongs to each. |
| Monitor TVET scholarship | BLOCKED | Nothing records scholarships yet (Processing Officer module). The panel says so. |
| Monitor inventory (TVET and diploma) | ✱ VERIFIED (TVET) | Inventory summary on the panel. "Diploma" inventory has no owner in the PDF — see Questions. |
| Instructor class records not on dashboard | VERIFIED | Not in `directorWorkspace` or the panel. |

## TVET Assessment Center Manager

| Requirement | Status | Evidence / gap |
|---|---|---|
| PDS profile, visible to the Director | ✱ VERIFIED | `staffPdsPolicy`, `services/teaching/pds.ts` (reuses `instructor_profiles`; no migration). Reads are audited. `pdf-gaps.mjs`. |
| Archive school year, create new | BLOCKED | Admin/Director only today — see Questions. |
| Purchase management per qualification (status) | ✱ VERIFIED | `purchase_requests`, `/assessment/purchases`. The seven categories from the PDF. Status steps are an assumption — see Questions. Delivered/Cancelled are final; every change is audited. |
| Inventory (quantity, good, defective, remarks) | ✱ VERIFIED | `inventory_items`, `/assessment/inventory`; on hand = good + defective; non-negative checked in the database; audited with before/after. |
| Assessment results and batch reports with assessor names (C / NYC) | VERIFIED | `assessment-center.mjs` 75/75. |
| CRUD training and assessment calendar, visible to all staff and admins | ✱ VERIFIED | Secretary added as a reader and to change notifications. Teachers read it and are notified when assigned. |
| Class records not on dashboard | VERIFIED | `assessmentDashboard()`. |

## TVET Processing Officer

The role exists since migration `20261011020000_processing_officer` and is assignable from Admin → Add Staff (`scripts/e2e/staff-roles.mjs`, 52/52). Permissions: `students.manage`, `students.enroll`, `credentials.verify`, `assessment.calendar.manage` — nothing administrative.

| Requirement | Status | Evidence / gap |
|---|---|---|
| Role itself | ✱ VERIFIED | Created by the Admin, signs in with a temporary password, opens its own dashboard (the records workspace under its own title); sidebar and API limited to its permissions. |
| PDS, visible to Director and Admin | ✱ VERIFIED | `PDS_ROLES`, `PDS_READERS.admin`. |
| Upload TESDA learner profile, application for assessment | MISSING | Document storage exists (`controllers/documents*`). |
| Scholarship enrollment (profile, previous school, year level, school year) | MISSING | No scholarship model; `Student` has no previous-school field. |
| Requirement management (7 documents, can add more) | PARTIAL | The Officer can verify documents (`credentials.verify`). Gaps: `CredentialRequirement` / `StudentCredential` checklist; 4 of 7 seeded (no barangay clearance, ID, uniform); no screen to add requirement types though `credentialRequirementPolicy` exists. |
| Learner Profile form (print/upload) | BLOCKED | Official template ("TDMS drive") is not in the repository. |
| Reserve trainees per qualification → final list | MISSING | |
| CRUD training & assessment calendar | ✱ VERIFIED | `assessment.calendar.manage`. |
| Collect/process assessment fees | BLOCKED | Fee schedule and procedure not specified. |

## TVET Coordinator

| Requirement | Status | Evidence / gap |
|---|---|---|
| PDS, visible to the Director | ✱ VERIFIED | As for the Manager. |
| CRUD instructor accounts (temporary password, MFA) | PARTIAL | Exists, but Admin only by design (`managesStaff`). See Questions. |
| Manage subjects | IMPLEMENTED (not re-run) | `subjects.manage`. |
| Manage school calendar | VERIFIED | `diploma-instructor.mjs` (coordinator creates an entry). |
| Assign students per section and year level | VERIFIED | `diploma-instructor.mjs` (sections, `sections/:id/students`). |
| Assign students per subject / group | PARTIAL | Classes are offered per section; a student cannot be placed in one subject only. |
| Room management | PARTIAL | `ClassSchedule.room` exists; no room/time clash detection. |
| Online clearance (pending/complete), CRUD, per course and section | MISSING | Clearance items and signatories not specified. |
| CRUD per course and section | VERIFIED | Programs; sections in `diploma-instructor.mjs`. |
| Archive school year | BLOCKED | See Questions. |
| Students view all semesters / 3 years, TOR-like | PARTIAL | `/my/grades` lists every released final grade across all years; no TOR-style grouped layout. |

## TVET Secretary

| Requirement | Status | Evidence / gap |
|---|---|---|
| PDS, visible to Director and Admin | ✱ VERIFIED | `pdf-gaps.mjs` checks the Admin sees the Secretary's sheet and no other. |
| Enrollment management | PARTIAL | Enrollments and year level exist; previous school attainment not stored. |
| Requirement management | PARTIAL | As for the Processing Officer. |
| Payment checklist per requirement | MISSING | Payable items not specified. |
| Online clearance | MISSING | As for the Coordinator. |
| Archive school year | BLOCKED | See Questions. |
| Students' grades / TOR view | PARTIAL | As for the Coordinator. |
| Class records not on dashboard | VERIFIED | `secretaryWorkspace`. |

## Diploma Instructor

| Requirement | Status | Evidence / gap |
|---|---|---|
| QR attendance with in/out notice | VERIFIED | `diploma-instructor.mjs` (attendance sessions). |
| Quizzes/exams with time windows | VERIFIED | Same suite (`assessments`, `status`). |
| ZipGrade-style checking with QR ID | VERIFIED | Same suite (`assessments/:id/key`, `/check`). |
| Online activity scores visible to students | VERIFIED | Same suite (`/scores`, student `/my/assessments`). |
| View school calendar | VERIFIED | Same suite. |
| Class records and gradebook | VERIFIED | Same suite (`classes/:id/grades`, weights, status, export). |
| Badges | VERIFIED | Same suite. |
| Lesson plan, TOS, PT for review | VERIFIED | Same suite (`documents`, `submit`, `review`). |
| Drop/transfer to Director, Coordinator, Secretary | VERIFIED | Same suite (`status-requests`, `decide`). |
| Slow-learner recommendations | VERIFIED | Same suite (`learning-supports`). |
| PDS visible to Director | VERIFIED | Same suite and `pdf-gaps.mjs`. |
| Report: enrollees, passed, failed, drop, transfer | PARTIAL | Progress and grade remarks exist; no single report with these counts. |
| Attendance weekly, monthly, after exam, per semester | PARTIAL | Per-meeting records only; no period roll-ups. |
| Submission status for TOS, PT, class record, final grades + notify | VERIFIED | Same suite. |
| No management-account reports | VERIFIED | `instructorDashboard()`. |

## Diploma Students

| Requirement | Status | Evidence / gap |
|---|---|---|
| Answer quizzes, activities, assignments | VERIFIED | `diploma-instructor.mjs` (student start/submit). |
| Grades prelim, midterm, finals, per semester, 3 years | PARTIAL / BLOCKED | Final grades per class only; grading uses category weights, no grading periods. Adding periods changes the official grade computation — see Questions. |
| Dashboard: announcements | ✱ VERIFIED | `pdf-gaps.mjs`. |
| Dashboard: badges, final grades, pending work | IMPLEMENTED (not re-run) | `studentView` in `dashboard-service.ts`. |
| No management/instructor reports | VERIFIED | `studentPortalPolicy`. |

## Changes made in this pass

| Area | Files |
|---|---|
| Staff PDS | `shared/lib/policies.ts` (`staffPdsPolicy`, `PDS_ROLES`; removed `viewInstructorProfiles`), `server/src/services/teaching/pds.ts`, `controllers/instructor-profile.ts`, `controllers/pages/app/{instructors.ts,instructors/_id.ts,teaching/pds.ts}`, `client/src/pages/app/{instructors.tsx,instructors/_id.tsx,teaching/pds.tsx}` |
| Supplies | `prisma/schema.prisma`, migration `20261011010000_supplies_and_announcements`, `prisma/seed.ts`, `shared/lib/supplies.ts`, `server/src/schemas/supplies.ts`, `server/src/services/supplies.ts`, `controllers/assessment/{inventory,purchases}*`, `client/src/pages/app/assessment/{inventory,purchases}.tsx` |
| Announcements | same migration, `server/src/services/announcements.ts`, `controllers/announcements*`, `client/src/pages/app/announcements.tsx` |
| Monitoring | `server/src/services/monitoring.ts`, `controllers/pages/app/dashboard.ts`, `client/src/components/dashboard/MonitoringPanel.tsx`, `client/src/pages/app/dashboard.tsx` |
| Navigation / routes | `controllers/pages/app-shell.ts`, `routes/{api,pages}.routes.ts`, `controllers/pages/app/supplies.ts`, `client/src/App.tsx` |
| Training calendar | Secretary added to `assessmentCenterPolicy.viewCalendar` and `CALENDAR_AUDIENCE` |
| Tests | `shared/lib/supplies.test.ts`, `server/src/schemas/supplies.test.ts`, `scripts/e2e/pdf-gaps.mjs` (`npm run test:pdf-gaps`) |

## Test runs (this pass, throwaway embedded Postgres, never the live database)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` (unit) | 674 / 674 |
| `prisma migrate deploy` on a fresh database + seed twice-safe | pass |
| Schema vs migrations drift (`prisma migrate diff --exit-code`) | no drift |
| `npm run build` | pass |
| `scripts/e2e/pdf-gaps.mjs` | 62 / 62 |
| `scripts/e2e/assessment-center.mjs` | 75 / 75 |
| `scripts/e2e/diploma-instructor.mjs` | 121 / 121 |
| `scripts/e2e/staff-accounts.mjs` | 19 / 19 |
| `scripts/e2e/session-redirect.mjs` | 21 / 21 |
| `scripts/e2e/institutional-auth.mjs` | skipped by the script (needs an existing administrator) |
| `scripts/e2e/admin-access-code.mjs` | not run (needs Super Admin credentials) |
| Chrome render of new screens (13 views, 4 roles) | no load or console errors |

Not deployment-verified: nothing was deployed, and the new migration has not been applied to the live database.

## Questions that need a decision

1. **School-year archiving** — the PDF gives it to the Director, Manager, Coordinator and Secretary; today only Admin and Director may. Should all four archive, or should the others only request it?
2. **Coordinator managing instructor accounts** — staff management was made Admin-only on purpose. Should Coordinators manage *teacher* accounts only?
3. **DIT / DHT** — which courses count as DIT and which as DHT?
4. **Purchase statuses** — implemented as Requested → Approved → Ordered → Delivered (or Cancelled). Confirm or replace. Should Delivered add to the inventory automatically?
5. **Diploma inventory** — who keeps it? The Manager's categories are TVET qualifications and office supplies.
6. **Grading periods** — should grades be computed per prelim/midterm/final? With what weights?
7. **Clearance, payments, assessment fees** — clearance items and signatories, which requirements are payable, and the fee schedule.
8. **Processing Officer** — created with records, enrollment, documents and calendar permissions only. Confirm, or name what to add or remove.
9. **Learner Profile form** — the official template.
