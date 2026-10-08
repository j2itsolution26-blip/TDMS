import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { BTN_SECONDARY } from './kit';

/**
 * A camera QR reader for phones and tablets.
 *
 * Uses the browser's native BarcodeDetector where there is one (Chrome on
 * Android, recent Safari) and falls back to jsQR on a canvas elsewhere. It
 * reports each code once: the same code is ignored for `repeatMs`, so a card
 * held in front of the camera does not submit a dozen times — the speed path
 * is SCAN → IDENTIFY → SUCCESS → NEXT STUDENT with no confirmation dialog.
 *
 * The camera is released when the component unmounts or is switched off.
 * Nothing is recorded or uploaded; frames are decoded in the browser.
 */

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

export default function QrScanner({ onCode, paused = false, repeatMs = 4000 }: { onCode: (code: string) => void; paused?: boolean; repeatMs?: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  pausedRef.current = paused;
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let detector: Detector | null = null;
    let jsqr: ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch {
        setError('The camera could not be opened. Allow camera access, or type the student ID below.');
        setOn(false);
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => undefined);

      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (BD) {
        try {
          detector = new BD({ formats: ['qr_code'] });
        } catch {
          detector = null;
        }
      }
      if (!detector) jsqr = (await import('jsqr')).default as unknown as typeof jsqr;
      tick();
    }

    async function tick() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !pausedRef.current) {
        let code: string | null = null;
        try {
          if (detector) {
            const found = await detector.detect(v);
            code = found[0]?.rawValue ?? null;
          } else if (jsqr && canvas.current) {
            const c = canvas.current;
            const w = Math.min(640, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h);
              code = jsqr(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
            }
          }
        } catch {
          code = null;
        }
        if (code) {
          const now = Date.now();
          const seen = last.current;
          if (!seen || seen.code !== code || now - seen.at > repeatMs) {
            last.current = { code, at: now };
            if (navigator.vibrate) navigator.vibrate(60);
            onCodeRef.current(code.trim());
          }
        }
      }
      raf = window.setTimeout(() => requestAnimationFrame(tick), 180) as unknown as number;
    }

    setError(null);
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, repeatMs]);

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#062a1d]">
        {on ? (
          <>
            <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera preview" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`h-3/5 w-3/5 max-w-[280px] rounded-3xl border-4 ${paused ? 'border-white/40' : 'border-[#3DDC97]'} shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]`} />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[#BFE6D4]">
            <Camera className="h-10 w-10" aria-hidden="true" />
            <p className="text-sm">Turn on the camera and hold each student&apos;s QR code inside the frame.</p>
          </div>
        )}
        <canvas ref={canvas} className="hidden" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" className={BTN_SECONDARY} onClick={() => setOn((v) => !v)}>
          {on ? <CameraOff className="h-4 w-4" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
          {on ? 'Stop camera' : 'Start camera'}
        </button>
        {on && <span className="text-xs text-tdms-muted" role="status">{paused ? 'Paused' : 'Scanning…'}</span>}
      </div>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
