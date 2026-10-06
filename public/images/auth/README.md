# Sign-in page images

Used by `src/components/login/`.

| Filename                  | Where                                             |
|---------------------------|---------------------------------------------------|
| `campus.jpg`              | Full-screen background, and the deep-blue panel   |
| `it-student.jpg`          | Diploma in Information Technology card            |
| `hospitality-student.jpg` | Diploma in Hospitality Technology card            |

The TVET crest is drawn inline (`TvetCrest.tsx`), so `logo.png` is no longer
used by the sign-in page.

To use a graduation photograph behind the sign-in card, add it here and point
`PANEL_IMAGE` in `LoginBackground.tsx` at it.
