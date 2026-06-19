/**
 * BarcodeScannerModal.jsx — Scan caméra ou douchette → ouvrir fiche article
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Loader2, ScanLine, X } from 'lucide-react';
import { Modal, INPUT_STYLE } from './shared.jsx';
import { normalizeScannedCode } from '../../services/inventaire/barcodeUtils';

const READER_ID = 'citymo-barcode-scanner-reader';

export default function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  scanning = false,
  error = '',
}) {
  const [mode, setMode] = useState('gun');
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const gunRef = useRef(null);
  const scannerRef = useRef(null);
  const lastScanRef = useRef('');
  const lastScanAtRef = useRef(0);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      const state = scanner.getState?.();
      if (state === 2 /* SCANNING */) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setManual('');
      setCameraError('');
      setCameraReady(false);
      setMode('gun');
      return undefined;
    }
    const t = setTimeout(() => gunRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, stopCamera]);

  useEffect(() => {
    if (!open || mode !== 'camera') {
      stopCamera();
      setCameraReady(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setCameraError('');
      setCameraReady(false);
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;
        await stopCamera();
        const scanner = new Html5Qrcode(READER_ID, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.min(320, viewfinderWidth * 0.85),
              height: Math.min(140, viewfinderHeight * 0.45),
            }),
            formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
          },
          (decoded) => {
            const code = normalizeScannedCode(decoded);
            if (!code) return;
            const now = Date.now();
            if (code === lastScanRef.current && now - lastScanAtRef.current < 1500) return;
            lastScanRef.current = code;
            lastScanAtRef.current = now;
            onScan(code);
          },
          () => {},
        );
        if (!cancelled) setCameraReady(true);
      } catch (err) {
        if (!cancelled) {
          setCameraError(err?.message || 'Caméra indisponible sur cet appareil.');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, mode, onScan, stopCamera]);

  function submitManual(ev) {
    ev.preventDefault();
    const code = normalizeScannedCode(manual);
    if (!code) return;
    onScan(code);
    setManual('');
  }

  function handleGunKeyDown(ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const code = normalizeScannedCode(ev.target.value);
    if (!code) return;
    onScan(code);
    ev.target.value = '';
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Scanner article" width={520}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'gun' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('gun')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Keyboard size={14} /> Douchette / saisie
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('camera')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Camera size={14} /> Caméra
        </button>
      </div>

      {mode === 'gun' ? (
        <div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginTop: 0, marginBottom: 12 }}>
            Scannez avec une douchette ou saisissez le code article, puis Entrée.
          </p>
          <input
            ref={gunRef}
            type="text"
            autoComplete="off"
            placeholder="Code article (ex. TYJ2X8GA)…"
            onKeyDown={handleGunKeyDown}
            disabled={scanning}
            style={{ ...INPUT_STYLE, fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.04em' }}
          />
          <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Recherche manuelle…"
              disabled={scanning}
              style={INPUT_STYLE}
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={scanning || !manual.trim()}>
              {scanning ? <Loader2 size={14} className="cin-spin" /> : <ScanLine size={14} />}
            </button>
          </form>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginTop: 0, marginBottom: 10 }}>
            Placez le code-barres CODE128 dans le cadre.
          </p>
          <div
            id={READER_ID}
            style={{
              width: '100%',
              minHeight: 220,
              borderRadius: 8,
              overflow: 'hidden',
              background: '#111',
              border: '1px solid var(--border)',
            }}
          />
          {!cameraReady && !cameraError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--text-3)', fontSize: '0.82rem' }}>
              <Loader2 size={16} className="cin-spin" /> Activation caméra…
            </div>
          )}
          {cameraError && (
            <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--red)' }}>{cameraError}</div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#FFEBEE', color: '#C62828', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <X size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {scanning && (
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={14} className="cin-spin" /> Recherche de l&apos;article…
        </div>
      )}
    </Modal>
  );
}
