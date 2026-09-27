import { requireUser, authorizePage } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import {
  listAccessCodes,
  listIssuableAdmins,
  mailIsConfigured,
} from '@/server/services/admin-account-service';
import { accessCodeExpiryOptions, resolveAccessCodeMinutes } from '@/server/auth/admin-access-code';
import AdminAccessCodesScreen from '@/components/screens/AdminAccessCodesScreen';

/**
 * Super Admin Dashboard → Admin Access Codes. Super Admin only.
 *
 * Everything the page shows is status and history. No code crosses from here to
 * the browser: a code's digits exist only in the response that generated it.
 */
export const dynamic = 'force-dynamic';

export default async function AdminAccessCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; generate?: string }>;
}) {
  const user = await requireUser();
  authorizePage(adminAccountPolicy.manageAccessCodes(user));

  const { page, generate } = await searchParams;
  const parsed = Number(page ?? 1);

  const [data, admins] = await Promise.all([
    listAccessCodes(Number.isFinite(parsed) && parsed > 0 ? parsed : 1),
    listIssuableAdmins(),
  ]);

  return (
    <AdminAccessCodesScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      admins={admins}
      expiryOptions={accessCodeExpiryOptions()}
      defaultExpiry={resolveAccessCodeMinutes(undefined)}
      mailConfigured={mailIsConfigured()}
      openGenerate={generate !== undefined}
      preselectAdminId={generate && /^\d+$/.test(generate) ? generate : null}
    />
  );
}
