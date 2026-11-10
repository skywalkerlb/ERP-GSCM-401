import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Alert } from './Alert';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TextField } from './TextField';

export interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  /** Called with each decoded Code 128 value. */
  onScan: (code: string) => void;
  title?: string;
  /** Keep the camera open after a scan (for counting many items). Defaults to false: the dialog closes after one scan. */
  continuous?: boolean;
}

type Phase = 'starting' | 'scanning' | 'error';

function explain(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (!window.isSecureContext) return 'Camera scanning needs a secure connection. Open the app over HTTPS, then try again.';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot open the camera. Try Safari, Chrome or Edge, or type the code instead.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera for this site in your browser settings, then choose Try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Type the code instead.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it, then choose Try again.';
  return 'The camera could not start. Choose Try again, or type the code instead.';
}

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
  [DecodeHintType.TRY_HARDER, true],
]);

/** Scans Code 128 barcodes with the back camera (ZXing). Works on iOS Safari over HTTPS. */
export function CameraScanner({ open, onClose, onScan, title = 'Scan a barcode', continuous = false }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const handlers = useRef({ onScan, onClose, continuous });
  handlers.current = { onScan, onClose, continuous };
  const lastHit = useRef({ code: '', at: 0 });

  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState('');

  const handleCode = useCallback((code: string) => {
    const now = Date.now();
    const last = lastHit.current;
    if (code === last.code && now - last.at < 2000) return;
    lastHit.current = { code, at: now };
    navigator.vibrate?.(40);
    handlers.current.onScan(code);
    if (!handlers.current.continuous) handlers.current.onClose();
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase('starting');
    setError('');
    setTorchAvailable(false);
    setTorchOn(false);

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(explain(null));
        setPhase('error');
        return;
      }
      try {
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
        video.setAttribute('playsinline', 'true'); // iOS Safari plays inline only with this
        video.muted = true;
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result) => {
            if (result) handleCode(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        const stream = video.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(Boolean(caps?.torch));
        setPhase('scanning');
      } catch (err) {
        if (cancelled) return;
        setError(explain(err));
        setPhase('error');
      }
    }
    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      trackRef.current?.stop();
      trackRef.current = null;
    };
  }, [open, attempt, handleCode]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual('');
    handleCode(code);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Hold the barcode inside the frame."
      footer={
        <>
          {torchAvailable && (
            <Button icon={torchOn ? 'torchOff' : 'torch'} onClick={toggleTorch} aria-pressed={torchOn}>
              {torchOn ? 'Turn light off' : 'Turn light on'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="gz-camera">
        <video ref={videoRef} className="gz-camera__video" playsInline muted aria-label="Camera preview" />
        {phase === 'scanning' && <div className="gz-camera__frame" aria-hidden="true" />}
        {phase === 'starting' && <div className="gz-camera__status text-body-sm">Starting the camera</div>}
      </div>
      {phase === 'error' && (
        <div className="gz-camera__error">
          <Alert tone="warning" title="Camera not available" action={<Button size="sm" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}>
            {error}
          </Alert>
        </div>
      )}
      <form className="gz-camera__manual" onSubmit={submitManual}>
        <TextField label="Or type the code" value={manual} onChange={(e) => setManual(e.target.value)} data-scan-target autoComplete="off" />
        <Button type="submit" disabled={!manual.trim()}>
          Use code
        </Button>
      </form>
    </Dialog>
  );
}
