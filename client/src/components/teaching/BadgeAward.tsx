import { useState } from 'react';
import { Award } from 'lucide-react';
import Modal from '@/components/Modal';
import { BadgeForm } from './StudentActions';
import { BTN, Field, INPUT } from './kit';

/** Award Badge: choose the class and student, then the badge. */
export default function BadgeAward({ classes }: { classes: { id: string; label: string; students: { id: string; name: string }[] }[] }) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [studentId, setStudentId] = useState('');
  const [chosen, setChosen] = useState(false);
  const students = classes.find((c) => c.id === classId)?.students ?? [];

  return (
    <>
      <button type="button" className={BTN} onClick={() => { setChosen(false); setStudentId(''); setOpen(true); }} disabled={classes.length === 0}>
        <Award className="h-4 w-4" aria-hidden="true" /> Award Badge
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Award Badge">
        {!chosen ? (
          <div className="space-y-4">
            <Field label="Class" htmlFor="ba-class">
              <select id="ba-class" className={INPUT} value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(''); }}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Student" htmlFor="ba-student">
              <select id="ba-student" className={INPUT} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Choose a student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <div className="flex justify-end">
              <button type="button" className={BTN} disabled={!studentId} onClick={() => setChosen(true)}>Next</button>
            </div>
          </div>
        ) : (
          <BadgeForm classId={classId} studentId={studentId} onDone={() => setOpen(false)} onCancel={() => setChosen(false)} />
        )}
      </Modal>
    </>
  );
}
