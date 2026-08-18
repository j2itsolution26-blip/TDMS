import { notFound } from "next/navigation";
import { requirePermission } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { updateProgramAction } from "../../actions";
import { ProgramForm } from "../../ProgramForm";

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("programs.manage");
  const { id: idParam } = await params;
  const id = Number(idParam);

  const program = Number.isInteger(id) ? await prisma.program.findUnique({ where: { id } }) : null;
  if (!program) notFound();

  // Only .bind() on an actual "use server" export may cross into a
  // Client Component prop — a plain wrapper closure defined here would
  // not (React error: "Functions cannot be passed directly to Client
  // Components unless ... marking it with 'use server'").
  const boundAction = updateProgramAction.bind(null, program.id);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Edit Program</h1>
      <ProgramForm
        action={boundAction}
        defaultValues={{
          code: program.code,
          name: program.name,
          description: program.description ?? "",
          isActive: program.isActive,
        }}
      />
    </div>
  );
}
