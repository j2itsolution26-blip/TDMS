/**
 * `npm run reconcile:enrollments` — find, and on request fill, the gaps between
 * student records, enrollments and sections.
 *
 * PREVIEW BY DEFAULT. Without --apply it only reads, and prints:
 *
 *   1. student records with no enrollment at all. These never appear in
 *      Enrollments. They are REPORTED ONLY: an enrollment is never invented
 *      here. The office opens one from the student's Enrollment page; approving
 *      it there places the student in a section.
 *   2. enrolled students with no section in that (non-archived) school year,
 *      in the order they would be placed.
 *
 * With --apply it places the students of list 2 — one transaction each,
 * through the same assignment approvals use (Section A, then B, C …, at most
 * 25 a section, a new section when all are full) — writes an audit entry for
 * each, and prints the outcome. Running it again finds nothing left to do.
 *
 * Output names records by id and student number only: no names, no contact
 * details. It prints which database it is pointed at before anything else.
 *
 *   npm run reconcile:enrollments                 preview
 *   npm run reconcile:enrollments -- --apply      place the students in list 2
 */
import { prisma } from '../server/src/lib/prisma';
import { resolveDatabaseUrl } from '../server/src/lib/database-url';
import { placeUnplaced, studentsWithoutEnrollment, unplacedEnrollments } from '../server/src/services/enrollment-gaps';

const apply = process.argv.includes('--apply');

function databaseHost(): string {
  const url = resolveDatabaseUrl();
  if (!url) return '(no DATABASE_URL)';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(unreadable DATABASE_URL)';
  }
}

async function main() {
  console.log(`Database: ${databaseHost()}`);
  console.log(`Mode:     ${apply ? 'APPLY — section placements will be written' : 'preview — nothing is changed'}\n`);

  const missing = await studentsWithoutEnrollment();
  console.log(`1. Student records with no enrollment: ${missing.length}  (reported only — open their enrollment from the student's Enrollment page)`);
  for (const s of missing) {
    console.log(`   student #${s.studentId}  ${s.studentNumber}  ${s.program} year ${s.yearLevel}  status ${s.status}  created ${s.createdAt?.slice(0, 10) ?? '—'}`);
  }

  const unplaced = await unplacedEnrollments();
  console.log(`\n2. Enrolled students with no section that school year: ${unplaced.length}`);
  for (const r of unplaced) {
    const note = r.studentStatus === 'active' ? '' : `  (student ${r.studentStatus}: will be skipped)`;
    console.log(`   enrollment #${r.enrollmentId}  student #${r.studentId}  ${r.programCode} year ${r.yearLevel}  SY ${r.schoolYearLabel} sem ${r.semester}  approved ${r.approvedAt?.slice(0, 10) ?? '—'}${note}`);
  }

  if (!apply) {
    console.log(unplaced.length ? '\nPreview only. Run again with --apply to place the students in list 2.' : '\nNothing to place.');
    return;
  }

  const outcomes = await placeUnplaced('System (enrollment reconciliation)');
  console.log('\nResults:');
  for (const o of outcomes) {
    const what = o.outcome === 'placed' ? `placed in ${o.section}${o.created ? ' (section opened)' : ''}`
      : o.outcome === 'already' ? `already in ${o.section}`
      : `${o.outcome}: ${o.reason}`;
    console.log(`   enrollment #${o.enrollmentId}  ${what}`);
  }
  const count = (k: string) => outcomes.filter((o) => o.outcome === k).length;
  console.log(`\nPlaced ${count('placed')}, already placed ${count('already')}, skipped ${count('skipped')}, failed ${count('failed')}.`);
  if (count('failed')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
