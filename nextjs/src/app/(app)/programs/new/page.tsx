import { requirePermission } from "@/server/rbac";
import { createProgramAction } from "../actions";
import { ProgramForm } from "../ProgramForm";

export default async function NewProgramPage() {
  await requirePermission("programs.manage");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">New Program</h1>
      <ProgramForm action={createProgramAction} />
    </div>
  );
}
