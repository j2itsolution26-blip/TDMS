import QRCode from 'qrcode';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { ownQr } from '@/server/services/teaching/student-portal';
import { orNotFound } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * The student's attendance QR. It encodes an opaque random token, not the
 * student number, so it cannot be forged from an ID card; the SVG is drawn on
 * the server, so it shows even before any script loads.
 */

export async function loadMyQr(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const qr = await orNotFound(ownQr(user));
  const svg = await QRCode.toString(qr.token, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0F2A2E', light: '#FFFFFF' } });

  return { qr, svg };
}
