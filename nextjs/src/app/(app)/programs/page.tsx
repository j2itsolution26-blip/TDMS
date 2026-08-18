import Link from "next/link";
import { requirePermission } from "@/server/rbac";
import { listPrograms } from "@/services/program.service";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Program } from "@prisma/client";

export default async function ProgramsPage() {
  // Same guard as ProgramPolicy::viewAny in the Laravel app — a
  // director/coordinator/secretary/teacher/admin/super_admin, not a
  // hardcoded role list.
  await requirePermission("programs.manage");
  const programs = await listPrograms();

  const columns: Column<Program>[] = [
    { header: "Code", cell: (p) => <span className="font-medium text-slate-900">{p.code}</span> },
    { header: "Name", cell: (p) => p.name },
    { header: "Status", cell: (p) => <Badge active={p.isActive} /> },
    {
      header: "",
      cell: (p) => (
        <Link href={`/programs/${p.id}/edit`} className="font-medium text-emerald-700 hover:text-emerald-900">
          Edit
        </Link>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Programs</h1>
          <p className="text-sm text-slate-500">{programs.length} program(s)</p>
        </div>
        <Link href="/programs/new">
          <Button>New Program</Button>
        </Link>
      </div>

      <DataTable columns={columns} rows={programs} emptyMessage="No programs yet." />
    </div>
  );
}
