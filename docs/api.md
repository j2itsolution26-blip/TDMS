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
| `login()` on `pages.auth.login`        | `POST /api/auth/login`         | —    | —          |
| `Logout` action on `layout.navigation` | `POST /api/auth/logout`        | yes  | —          |
| `auth()->user()` in Blade              | `GET /api/auth/session`        | yes  | —          |
| `create-super-admin` step 1            | `POST /api/auth/super-admin/start`   | —    | only while no Super Admin exists |
| `create-super-admin` resend            | `POST /api/auth/super-admin/resend`  | —    | setup cookie, rate limited |
| `create-super-admin` step 2            | `POST /api/auth/super-admin/verify`  | —    | setup cookie, attempts capped |
| `create-super-admin` resume            | `GET /api/auth/super-admin/pending`  | —    | setup cookie |
| `create-super-admin` abandon           | `DELETE /api/auth/super-admin/pending` | —  | setup cookie |
| `create-super-admin` submit            | `POST /api/auth/super-admin`   | —    | verified pending registration, and only while no Super Admin exists |

The bootstrap is three requests, in this order, and the order is the security
property: `start` writes a pending registration and emails a six-digit code
but creates no account; `verify` proves the address; `POST /api/auth/super-admin`
creates the account, and takes **no body** — the name, address and password
hash come from the pending row named by an HttpOnly cookie, so nothing about
the account can change between verification and creation. That endpoint
refuses outright unless the pending registration's `verified_at` is set. See
[authentication.md](authentication.md#first-time-setup).

### Programs & curricula

| Livewire action                    | Node endpoint                                  | Permission        |
| ---------------------------------- | ---------------------------------------------- | ----------------- |
| `programs.index` `with()`          | `GET /api/programs?page=`                      | role: staff       |
| `programs.index` `save()` (create) | `POST /api/programs`                           | `programs.manage` |
| `programs.index` `save()` (update) | `PUT /api/programs/:id`                        | `programs.manage` |
| `programs.index` `toggleActive()`  | `PATCH /api/programs/:id`                      | `programs.manage` |
| `programs.show` `with()`           | `GET /api/programs/:id/curricula`              | role: staff       |
| `programs.show` `save()`           | `POST /api/programs/:id/curricula`             | `programs.manage` |
| `programs.show` `save()` (update)  | `PUT /api/curricula/:id`                       | `programs.manage` |
| `programs.show` `toggleActive()`   | `PATCH /api/curricula/:id`                     | `programs.manage` |
| `curricula.show` `with()`          | `GET /api/curricula/:id/subjects`              | role: staff       |
| `curricula.show` `save()`          | `POST /api/curricula/:id/subjects`             | `subjects.manage` |
| `curricula.show` `remove()`        | `DELETE /api/curricula/:id/subjects/:entryId`  | `subjects.manage` |

### Subjects

| Livewire action                    | Node endpoint              | Permission        |
| ---------------------------------- | -------------------------- | ----------------- |
| `subjects.index` `with()`          | `GET /api/subjects?page=`  | role: staff       |
| `subjects.index` `save()` (create) | `POST /api/subjects`       | `subjects.manage` |
| `subjects.index` `save()` (update) | `PUT /api/subjects/:id`    | `subjects.manage` |
| `subjects.index` `toggleActive()`  | `PATCH /api/subjects/:id`  | `subjects.manage` |

### Students, credentials, enrolment

| Livewire action                        | Node endpoint                              | Permission          |
| -------------------------------------- | ------------------------------------------ | ------------------- |
| `students.index` `with()`              | `GET /api/students?page=&search=`          | `students.manage`   |
| `students.index` `save()` (create)     | `POST /api/students`                       | `students.manage`   |
| `students.index` `save()` (update)     | `PUT /api/students/:id`                    | `students.manage`   |
| `enrollment.show` `with()` credentials | `GET /api/students/:id/credentials`        | role: office        |
| `enrollment.show` `verify()`           | `POST /api/credentials/:id/verify`         | `credentials.verify`|
| `enrollment.show` `confirmReject()`    | `POST /api/credentials/:id/reject`         | `credentials.verify`|
| `enrollment.show` `with()` enrolments  | `GET /api/students/:id/enrollments`        | role: office        |
| `enrollment.show` `saveEnrollment()`   | `POST /api/students/:id/enrollments`       | `students.enroll`   |
| `confirmEnrollment()` / `confirmDrop()`| `POST /api/enrollments/:id/transition`     | `students.enroll`   |

### Applications

| Livewire action                      | Node endpoint                            | Permission            |
| ------------------------------------ | ---------------------------------------- | --------------------- |
| `applications.index` `with()`        | `GET /api/applications?page=&status=`    | role: office          |
| `applications.index` `save()`        | `POST /api/applications`                 | `applications.review` |
| `applications.index` `approve()`     | `POST /api/applications/:id/approve`     | `applications.review` |
| `applications.index` `confirmReturn()`| `POST /api/applications/:id/return`      | `applications.review` |

### Staff & profile

| Livewire action                      | Node endpoint                             | Permission        |
| ------------------------------------ | ----------------------------------------- | ----------------- |
| `staff.index` `with()`               | `GET /api/staff?page=`                    | `accounts.manage` |
| `staff.index` `save()` (create)      | `POST /api/staff`                         | `accounts.manage` |
| `staff.index` `save()` (update)      | `PUT /api/staff/:id`                      | `accounts.manage` |
| `staff.index` `toggleActive()`       | `POST /api/staff/:id/toggle-active`       | `accounts.manage` |
| `staff.index` `resetPassword()`      | `POST /api/staff/:id/reset-password`      | `accounts.manage` |
| `updateProfileInformation()`         | `PUT /api/profile`                        | self              |
| `updatePassword()`                   | `PUT /api/profile/password`               | self              |

"role: staff" means admin, director, coordinator, secretary or teacher.
"role: office" means admin, director, coordinator or secretary. A
`super_admin` passes every check (see `authentication.md`).

## Notes

- Ids are serialised as **strings**, because they are PostgreSQL `bigint`
  and JSON numbers cannot represent the full range safely.
- `Decimal` unit values are serialised as numbers.
- Password hashes are never selected into a response.
- Approving an application is a single transaction: it creates the student,
  opens a credential row per applicable requirement and stamps the
  application, or does none of those.
