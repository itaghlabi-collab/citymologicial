/**
 * Caméra guidée CNIE — cadre ID-1 (ratio 1.586), capture exacte du rectangle + marge.
 * Aucune logique OCR ici : renvoie finalImageFile pour aperçu + analyse.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, X, Check, Upload, SwitchCamera, RefreshCw, Loader2, AlertCircle,
} from 'lucide-react';
import {
  canUseCamera,
  getCameraBlockedReason,
  getCameraErrorMessage,
  getCINCameraStream,
} from '../../services/ocr';
import { captureGuidedCINFrame, CIN_ASPECT_RATIO } from '../../services/cinCapture';

const GUIDE_MARGIN = 0.04; // 4 % de marge capturée hors guide visible

function sideLabel(side) {
  return side === 'verso' || side === 'back'
    ? 'Scanner le verso de la CNIE'
    : 'Scanner le recto de la CNIE';
}

function normalizeSide(side) {
  if (side === 'back' || side === 'verso') return 'verso';
  return 'recto';
}

export default function CINGuidedCamera({
  open,
  side = 'recto',
  onClose,
  onValidated,
  onOpenManualCrop,
}) {
  const uid = useId();
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);
  const facingRef = useRef('environment');

  const [phase, setPhase] = useState('live'); // live | review
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState(null); // { previewDataUrl, ocrFile, ... }
  const [facing, setFacing] = useState('environment');

  const docSide = normalizeSide(side);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const attachStream = useCallback(async (stream) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.playsInline = true;
    video.muted = true;
    await new Promise((resolve) => {
      if (video.readyState >= 1) { resolve(); return; }
      const onReady = () => { video.removeEventListener('loadedmetadata', onReady); resolve(); };
      video.addEventListener('loadedmetadata', onReady);
      setTimeout(resolve, 2000);
    });
    try { await video.play(); } catch { /* iOS */ }
  }, []);

  const startCamera = useCallback(async (facingMode = facingRef.current) => {
    setLoading(true);
    setError('');
    stopStream();
    if (!canUseCamera()) {
      setLoading(false);
      setError(getCameraBlockedReason());
      return;
    }
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        stream = await getCINCameraStream();
      }
      facingRef.current = facingMode;
      setFacing(facingMode);
      await attachStream(stream);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(getCameraErrorMessage(err));
    }
  }, [attachStream, stopStream]);

  useEffect(() => {
    if (!open) return undefined;
    setPhase('live');
    setShot(null);
    setError('');
    startCamera('environment');
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      stopStream();
    };
  }, [open, side]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCapture() {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || capturing) return;
    if (video.readyState < 2) {
      setError('Caméra pas encore prête — réessayez.');
      return;
    }
    setCapturing(true);
    setError('');
    try {
      const result = await captureGuidedCINFrame(video, frame, docSide, { margin: GUIDE_MARGIN });
      setShot(result);
      setPhase('review');
      stopStream();
    } catch (err) {
      console.error('[CIN guided] capture', err);
      setError('Capture impossible — replacez la carte dans le cadre.');
    } finally {
      setCapturing(false);
    }
  }

  function handleRetake() {
    setShot(null);
    setPhase('live');
    startCamera(facingRef.current);
  }

  function handleValidate() {
    if (!shot) return;
    onValidated?.({
      side: docSide,
      previewDataUrl: shot.finalImageDataUrl || shot.previewDataUrl,
      fullDataUrl: shot.fullDataUrl || shot.finalImageDataUrl,
      ocrFile: shot.finalImageFile || shot.ocrFile,
      guided: true,
      detected: false,
    });
  }

  async function handleFlip() {
    const next = facingRef.current === 'environment' ? 'user' : 'environment';
    await startCamera(next);
  }

  function handleGalleryFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Galerie : passer au parent (import classique) — pas de faux crop caméra
      onValidated?.({
        side: docSide,
        previewDataUrl: reader.result,
        fullDataUrl: reader.result,
        ocrFile: file,
        guided: false,
        fromGallery: true,
      });
    };
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  return createPortal(
    <div className="cin-guided-overlay" data-cin-guided="2026-07-30" role="dialog" aria-modal="true" aria-label={sideLabel(side)}>
      {phase === 'live' && (
        <>
          <video
            ref={videoRef}
            className="cin-guided-video"
            autoPlay
            playsInline
            muted
          />

          <div className="cin-guided-dim" aria-hidden>
            <div className="cin-guided-frame-slot">
              <div ref={frameRef} className="cin-guided-frame">
                <span className="cin-guided-corner cin-guided-corner--tl" />
                <span className="cin-guided-corner cin-guided-corner--tr" />
                <span className="cin-guided-corner cin-guided-corner--bl" />
                <span className="cin-guided-corner cin-guided-corner--br" />
              </div>
            </div>
          </div>

          <div className="cin-guided-top">
            <button type="button" className="cin-guided-btn-ghost" onClick={onClose} aria-label="Annuler">
              <X size={18} /> Annuler
            </button>
            <div className="cin-guided-title">{sideLabel(side)}</div>
            <button type="button" className="cin-guided-btn-ghost" onClick={handleFlip} disabled={loading || !!error} aria-label="Changer de caméra">
              <SwitchCamera size={18} />
            </button>
          </div>

          <div className="cin-guided-hints">
            <p className="cin-guided-hint-main">Placez toute la CNIE dans le cadre</p>
            <p className="cin-guided-hint-sub">Les quatre coins de la carte doivent être visibles</p>
          </div>

          {loading && (
            <div className="cin-guided-status">
              <Loader2 size={22} className="cin-spin" /> Activation caméra…
            </div>
          )}

          {(error || (!canUseCamera() && !loading)) && (
            <div className="cin-guided-blocked">
              <AlertCircle size={16} />
              <p>{error || getCameraBlockedReason()}</p>
              <button type="button" className="cin-guided-btn-primary" onClick={() => galleryRef.current?.click()}>
                <Upload size={14} /> Importer depuis la galerie
              </button>
            </div>
          )}

          <div className="cin-guided-actions">
            <button type="button" className="cin-guided-btn-secondary" onClick={() => galleryRef.current?.click()}>
              <Upload size={16} /> Galerie
            </button>
            <button
              type="button"
              className="cin-guided-btn-capture"
              disabled={loading || capturing || !!error}
              onClick={handleCapture}
            >
              {capturing ? <Loader2 size={22} className="cin-spin" /> : <Camera size={22} />}
              <span>Capturer</span>
            </button>
            <button type="button" className="cin-guided-btn-secondary" onClick={onClose}>
              <X size={16} /> Fermer
            </button>
          </div>
        </>
      )}

      {phase === 'review' && shot && (
        <div className="cin-guided-review">
          <div className="cin-guided-top">
            <button type="button" className="cin-guided-btn-ghost" onClick={onClose}>
              <X size={18} /> Annuler
            </button>
            <div className="cin-guided-title">Vérifier la photo</div>
            <span style={{ width: 44 }} />
          </div>
          <div className="cin-guided-preview-wrap">
            <img
              src={shot.finalImageDataUrl || shot.previewDataUrl}
              alt="Aperçu CNIE"
              className="cin-guided-preview-img"
            />
          </div>
          <p className="cin-guided-review-note">
            Image capturée depuis le cadre (ratio {(CIN_ASPECT_RATIO).toFixed(3)}) — celle envoyée à l’analyse.
          </p>
          <div className="cin-guided-review-actions">
            <button type="button" className="cin-guided-btn-secondary" onClick={handleRetake}>
              <RefreshCw size={16} /> Reprendre
            </button>
            {onOpenManualCrop && (
              <button
                type="button"
                className="cin-guided-btn-secondary"
                onClick={() => onOpenManualCrop(shot.finalImageDataUrl || shot.previewDataUrl)}
              >
                Recadrer
              </button>
            )}
            <button type="button" className="cin-guided-btn-primary" onClick={handleValidate}>
              <Check size={16} /> Valider la photo
            </button>
          </div>
        </div>
      )}

      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) handleGalleryFile(f);
        }}
      />
      <span className="cin-guided-sr" id={`cin-guided-a11y-${uid}`}>Cadre CNIE ratio 1,586</span>
    </div>,
    document.body,
  );
}
