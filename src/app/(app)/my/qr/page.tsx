import QRCode from 'qrcode';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { ownQr } from '@/server/services/teaching/student-portal';
import { orNotFound } from '@/server/services/teaching/page-context';
import { Card, PageShell } from '@/components/teaching/kit';

export const dynamic = 'force-dynamic';

/**
 * The student's attendance QR. It encodes an opaque random token, not the
 * student number, so it cannot be forged from an ID card; the SVG is drawn on
 * the server, so it shows even before any script loads.
 */
export default async function MyQrPage() {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const qr = await orNotFound(ownQr(user));
  const svg = await QRCode.toString(qr.token, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0F2A2E', light: '#FFFFFF' } });

  return (
    <PageShell eyebrow="My Learning" title="My QR Code" description="Show this to your Diploma Instructor to record attendance, or to identify your answer sheet.">
      <Card className="mx-auto max-w-md">
        <div className="flex flex-col items-center pt-6 text-center">
          <div className="w-full max-w-[280px] rounded-2xl border border-tdms-hairline p-3" role="img" aria-label={`Attendance QR code for ${qr.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-4 text-xl font-bold text-tdms-ink">{qr.name}</p>
          <p className="text-sm text-tdms-muted">Student ID: <span className="tabular-nums">{qr.studentNumber}</span></p>
          <p className="text-sm text-tdms-muted">{qr.program}</p>
          <p className="mt-4 text-xs text-tdms-muted">Turn your screen brightness up for faster scanning. Keep this code to yourself — it identifies you.</p>
        </div>
      </Card>
    </PageShell>
  );
}
