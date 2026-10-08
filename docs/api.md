# API

Every endpoint answers with one envelope:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "message": "…", "errors": { "field": ["…"] } }
```

`errors` appears only on a 422.

| Status | Meaning                                                |
| ------ | ------------------------------------------------------ |
| 200    | OK                                                     |
| 201    | Created                                                |
| 400    | Malformed request body                                 |
| 401    | Not signed in, or bad credentials                      |
| 403    | Signed in but not permitted, or account inactive       |
| 404    | No such record                                         |
| 409    | Conflict (bootstrap already completed)                 |
| 422    | Validation failed                                      |
| 429    | Too many login attempts                                |
| 500    | Unexpected — always the generic message                |

## Migration map

The Laravel application had no REST API: every interaction was a Livewire
component method invoked over the Livewire wire protocol. The table below
maps each of those actions to its replacement.

### Authentication

| Livewire action                        | Node endpoint                  | Auth | Permission |
| -------------------------------------- | ------------------------------ | ---- | ---------- |
| `login()` on `pages.auth.login`        | `POST /api/v1/auth/login`         | —    | —          |
| `Logout` action on `layout.navigation` | `POST /api/v1/auth/logout`        | yes  | —          |
| `auth()->user()` in Blade              | `GET /api/v1/auth/session`        | yes  | —          |
| first-run setup (`/setup`)            | `POST /api/v1/setup`              | —    | only while uninitialized (no users, no installation row) |

First-run setup creates the first Super Admin in one transaction that also
marks the installation initialized, so a second or concurrent setup is refused
with 409 and creates nothing. It issues no session. See
[authentication.md](authentication.md#first-time-setup).

### Programs & curricula

| Livewire action                    | Node endpoint                                  | Permission        |
| ---------------------------------- | ---------------------------------------------- | ----------------- |
| `programs.index` `with()`          | `GET /api/v1/programs?page=`                      | role: staff       |
| `programs.index` `save()` (create) | `POST /api/v1/programs`                           | `programs.manage` |
| `programs.index` `save()` (update) | `PUT /api/v1/programs/:id`                        | `programs.manage` |
| `programs.index` `toggleActive()`  | `PATCH /api/v1/programs/:id`                      | `programs.manage` |
| `programs.show` `with()`           | `GET /api/v1/programs/:id/curricula`              | role: staff       |
| `programs.show` `save()`           | `POST /api/v1/programs/:id/curricula`             | `programs.manage` |
| `programs.show` `save()` (update)  | `PUT /api/v1/curricula/:id`                       | `programs.manage` |
| `programs.show` `toggleActive()`   | `PATCH /api/v1/curricula/:id`                     | `programs.manage` |
| `curricula.show` `with()`          | `GET /api/v1/curricula/:id/subjects`              | role: staff       |
| `curricula.show` `save()`          | `POST /api/v1/curricula/:id/subjects`             | `subjects.manage` |
| `curricula.show` `remove()`        | `DELETE /api/v1/curricula/:id/subjects/:entryId`  | `subjects.manage` |

### Subjects

| Livewire action                    | Node endpoint              | Permission        |
| ---------------------------------- | -------------------------- | ----------------- |
| `subjects.index` `with()`          | `GET /api/v1/subjects?page=`  | role: staff       |
| `subjects.index` `save()` (create) | `POST /api/v1/subjects`       | `subjects.manage` |
| `subjects.index` `save()` (update) | `PUT /api/v1/subjects/:id`    | `subjects.manage` |
| `subjects.index` `toggleActive()`  | `PATCH /api/v1/subjects/:id`  | `subjects.manage` |

### Students, credentials, enrolment

| Livewire action                        | Node endpoint                              | Permission          |
| -------------------------------------- | ------------------------------------------ | ------------------- |
| `students.index` `with()`              | `GET /api/v1/students?page=&search=`          | `students.manage`   |
| `students.index` `save()` (create)     | `POST /api/v1/students`                       | `students.manage`   |
| `students.index` `save()` (update)     | `PUT /api/v1/students/:id`                    | `students.manage`   |
| `enrollment.show` `with()` credentials | `GET /api/v1/students/:id/credentials`        | role: office        |
| `enrollment.show` `verify()`           | `POST /api/v1/credentials/:id/verify`         | `credentials.verify`|
| `enrollment.show` `confirmReject()`    | `POST /api/v1/credentials/:id/reject`         | `credentials.verify`|
| `enrollment.show` `with()` enrolments  | `GET /api/v1/students/:id/enrollments`        | role: office        |
| `enrollment.show` `saveEnrollment()`   | `POST /api/v1/students/:id/enrollments`       | `students.enroll`   |
| `confirmEnrollment()` / `confirmDrop()`| `POST /api/v1/enrollments/:id/transition`     | `students.enroll`   |

### Applications

| Livewire action                      | Node endpoint                            | Permission            |
| ------------------------------------ | ---------------------------------------- | --------------------- |
| `applications.index` `with()`        | `GET /api/v1/applications?page=&status=`    | role: office          |
| `applications.index` `save()`        | `POST /api/v1/applications`                 | `applications.review` |
| `applications.index` `approve()`     | `POST /api/v1/applications/:id/approve`     | `applications.review` |
| `applications.index` `confirmReturn()`| `POST /api/v1/applications/:id/return`      | `applications.review` |

### Staff & profile

| Livewire action                      | Node endpoint                             | Permission        |
| ------------------------------------ | ----------------------------------------- | ----------------- |
| `staff.index` `with()`               | `GET /api/v1/staff?page=`                    | `accounts.manage` |
| `staff.index` `save()` (create)      | `POST /api/v1/staff`                         | `accounts.manage` |
| `staff.index` `save()` (update)      | `PUT /api/v1/staff/:id`                      | `accounts.manage` |
| `staff.index` `toggleActive()`       | `POST /api/v1/staff/:id/toggle-active`       | `accounts.manage` |
| `staff.index` `resetPassword()`      | `POST /api/v1/staff/:id/reset-password`      | `accounts.manage` |
| `updateProfileInformation()`         | `PUT /api/v1/profile`                        | self              |
| `updatePassword()`                   | `PUT /api/v1/profile/password`               | self              |

### Administrator accounts and access codes

Added after the Laravel migration, so these have no Livewire ancestor. Every
route here is **Super Admin only** — checked with `isSuperAdmin` directly rather
than through `accounts.manage`, which the `admin` role holds. None asks for the
static Super Admin security code. See [admin-accounts.md](admin-accounts.md).

| Endpoint                                     | Does                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `GET /api/v1/admins?page=`                      | List Admin accounts                               |
| `POST /api/v1/admins`                           | Create one with a temporary password (no code)    |
| `POST /api/v1/admins/:id/reset-password`        | New temporary password; revokes live codes; no body |
| `POST /api/v1/admins/:id/status`                | Suspend or reactivate                             |
| `GET /api/v1/admins/:id/credentials`            | Temporary-password and access-code **status** — no secrets |
| `POST /api/v1/admins/:id/temporary-password/reveal` | Show a temporary password (`no-store`, audited); 409 once it is no longer temporary |
| `GET /api/v1/admin-access-codes?page=`          | List codes with status — never the code           |
| `POST /api/v1/admin-access-codes`               | `{ adminId, expiresInMinutes?, emailAccessCode? }` — issue a code |
| `GET /api/v1/admin-access-codes/:id`            | View one code's history — never the code          |
| `POST /api/v1/admin-access-codes/:id/revoke`    | Revoke an ACTIVE code (409 otherwise)             |

The create and generate responses carry the plaintext password or code
**once**; only bcrypt hashes are stored and neither can be fetched again.

The sign-in half is reachable **without a session** — the caller has passed the
password step and has not been let in — and is authorised by the HttpOnly
`tdms_admin_login` challenge cookie instead:

| Endpoint                                     | Does                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `GET /api/v1/auth/admin-access-code`            | What the verification screen should draw           |
| `POST /api/v1/auth/admin-access-code`           | Submit the code; on success a session is created   |
| `DELETE /api/v1/auth/admin-access-code`         | Abandon the half-finished sign-in                  |
| `POST /api/v1/auth/admin-access-code/request`   | Ask the Super Admins for a new code — **issues none** |
| `POST /api/v1/auth/change-password`             | Replace a temporary password (with `/verify`, the only routes that accept a caller still carrying `mustChangePassword`) |
| `POST /api/v1/auth/change-password/verify`      | Live check of the temporary password on the setup screen; changes nothing |

"role: staff" means admin, director, coordinator, secretary or teacher.
"role: office" means admin, director, coordinator or secretary. A
`super_admin` passes every **view** check but no operational one: they cannot
create, update, review, verify, enroll or manage staff. Staff accounts are
managed by the Admin only (see `authentication.md`).

## Notes

- Ids are serialised as **strings**, because they are PostgreSQL `bigint`
  and JSON numbers cannot represent the full range safely.
- `Decimal` unit values are serialised as numbers.
- Password hashes are never selected into a response.
- Approving an application is a single transaction: it creates the student,
  opens a credential row per applicable requirement and stamps the
  application, or does none of those.
