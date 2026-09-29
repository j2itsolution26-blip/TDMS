'use client';

import { useState } from 'react';
import Link from 'next/link';
import StudentActions from './StudentActions';
import { Card, Chip, Empty, FOCUS, INPUT, TD, TH, Table } from './kit';

interface Student {
  id: string;
  studentNumber: string;
  name: string;
  program: string;
  yearLevel: string;
  section: string;
  status: string;
  statusLabel: string;
  classes: { id: string; subject: string; detail: string }[];
}

/** Students on the Instructor's own rosters — searchable, filterable, with per-class actions. */
export default function StudentsScreen({ students, classes, archived }: { students: Student[]; classes: { id: string; label: string }[]; archived: boolean }) {
  const [query, setQuery] = useState('');
  const [cls, setCls] = useState('');
  const [status, setStatus] = useState('');
  const statuses = [...new Map(students.map((s) => [s.status, s.statusLabel])).entries()];
  const shown = students.filter(
    (s) =>
      (!query || `${s.name} ${s.studentNumber}`.toLowerCase().includes(query.toLowerCase())) &&
      (!cls || s.classes.some((c) => c.id === cls)) &&
      (!status || s.status === status),
  );

  return (
    <Card padded={false} title={`${shown.length} of ${students.length} students`}>
      <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-3 sm:px-6">
        <label><span className="sr-only">Search</span><input className={INPUT} placeholder="Search name or student ID…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label>
          <span className="sr-only">Class</span>
          <select className={INPUT} value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="px-5 pb-5 sm:px-6"><Empty title={students.length ? 'No students match' : 'No students yet'} description={students.length ? undefined : 'Students on your class rosters appear here.'} /></div>
      ) : (
        <Table
          label="My students"
          head={
            <>
              <th scope="col" className={TH}>Student ID</th>
              <th scope="col" className={TH}>Full Name</th>
              <th scope="col" className={TH}>Program</th>
              <th scope="col" className={TH}>Year Level</th>
              <th scope="col" className={TH}>Section</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={TH}>Classes</th>
              <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
            </>
          }
        >
          {shown.map((s) => {
            const actionClass = s.classes.find((c) => c.id === cls) ?? s.classes[0]!;
            return (
              <tr key={s.id}>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{s.studentNumber}</td>
                <td className={`${TD} whitespace-nowrap font-semibold`}>{s.name}</td>
                <td className={TD}>{s.program}</td>
                <td className={`${TD} whitespace-nowrap`}>{s.yearLevel}</td>
                <td className={TD}>{s.section}</td>
                <td className={TD}><Chip status={s.status} label={s.statusLabel} /></td>
                <td className={`${TD} text-[13px]`}>
                  {s.classes.map((c) => (
                    <Link key={c.id} href={`/teaching/classes/${c.id}`} className={`block rounded text-tdms-text hover:underline ${FOCUS}`}>{c.subject}</Link>
                  ))}
                </td>
                <td className={TD}>
                  <StudentActions classId={actionClass.id} disabled={archived} student={{ id: s.id, name: s.name, studentNumber: s.studentNumber, status: s.status }} />
                  {s.classes.length > 1 && <p className="mt-1 text-right text-[11px] text-tdms-muted">For {actionClass.subject}</p>}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}
