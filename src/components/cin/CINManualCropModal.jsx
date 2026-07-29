/**
 * Recadrage manuel CNIE — 4 poignées, ratio libre, sortie ID-1 contain.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { cropRectToId1Contain, ID1_RATIO } from '../../services/cnieAutoCrop';
import { dataUrlToCaptureFile } from '../../services/cinCapture';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function CINManualCropModal({
  open,
  imageDataUrl,
  side = 'recto',
  onCancel,
  onValidate,
}) {
  const imgRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [layoutTick, setLayoutTick] = useState(0);
  const [rect, setRect] = useState(null); // {x,y,w,h} in image pixels
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open || !imageDataUrl) return undefined;
    setErr('');
    setPreviewUrl('');
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setNatural({ w, h });
      const targetRatio = ID1_RATIO;
      let rw = w * 0.82;
      let rh = rw / targetRatio;
      if (rh > h * 0.82) {
        rh = h * 0.82;
        rw = rh * targetRatio;
      }
      setRect({
        x: (w - rw) / 2,
        y: (h - rh) / 2,
        w: rw,
        h: rh,
      });
    };
    img.src = imageDataUrl;
    return undefined;
  }, [open, imageDataUrl]);

  const syncPreview = useCallback(async () => {
    if (!imageDataUrl || !rect || rect.w < 8 || rect.h < 8) return;
    try {
      const url = await cropRectToId1Contain(imageDataUrl, rect);
      setPreviewUrl(url);
    } catch {
      setPreviewUrl('');
    }
  }, [imageDataUrl, rect]);

  useEffect(() => {
    if (!open || !rect) return undefined;
    const t = setTimeout(() => { syncPreview(); }, 120);
    return () => clearTimeout(t);
  }, [open, rect, syncPreview]);

  function clientToImage(clientX, clientY) {
    const el = imgRef.current;
    if (!el || !natural.w) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * natural.w;
    const y = ((clientY - r.top) / r.height) * natural.h;
    return {
      x: clamp(x, 0, natural.w),
      y: clamp(y, 0, natural.h),
    };
  }

  function onPointerDown(corner, e) {
    e.preventDefault();
    e.stopPropagation();
    const pt = clientToImage(e.clientX, e.clientY);
    dragRef.current = { corner, start: pt, origin: { ...rect } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragRef.current || !rect) return;
    const { corner, origin } = dragRef.current;
    const pt = clientToImage(e.clientX, e.clientY);
    const next = { ...origin };
    if (corner === 'tl') {
      next.w = origin.x + origin.w - pt.x;
      next.h = origin.y + origin.h - pt.y;
      next.x = pt.x;
      next.y = pt.y;
    } else if (corner === 'tr') {
      next.w = pt.x - origin.x;
      next.h = origin.y + origin.h - pt.y;
      next.y = pt.y;
    } else if (corner === 'bl') {
      next.w = origin.x + origin.w - pt.x;
      next.h = pt.y - origin.y;
      next.x = pt.x;
    } else if (corner === 'br') {
      next.w = pt.x - origin.x;
      next.h = pt.y - origin.y;
    }
    if (next.w < 24 || next.h < 16) return;
    next.x = clamp(next.x, 0, natural.w - 24);
    next.y = clamp(next.y, 0, natural.h - 16);
    next.w = clamp(next.w, 24, natural.w - next.x);
    next.h = clamp(next.h, 16, natural.h - next.y);
    setRect(next);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function handleValidate() {
    if (!previewUrl) {
      setErr('Ajustez le cadre puis validez.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const file = dataUrlToCaptureFile(previewUrl, side, 'manual-crop');
      onValidate?.({
        previewDataUrl: previewUrl,
        fullDataUrl: previewUrl,
        ocrFile: file,
        detected: true,
        cropMessage: null,
      });
    } catch {
      setErr('Recadrage impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (!open || !imageDataUrl) return null;

  const disp = imgRef.current?.getBoundingClientRect();
  const scaleX = disp && natural.w ? disp.width / natural.w : 0;
  const scaleY = disp && natural.h ? disp.height / natural.h : 0;
  const overlay = rect && scaleX
    ? {
      left: rect.x * scaleX,
      top: rect.y * scaleY,
      width: rect.w * scaleX,
      height: rect.h * scaleY,
    }
    : null;

  return createPortal(
    <div className="cin-manual-crop-overlay" role="dialog" aria-modal="true" aria-label="Recadrer la CIN">
      <div className="cin-manual-crop-panel">
        <div className="cin-manual-crop-header">
          <strong>Recadrer manuellement</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <p className="cin-manual-crop-help">
          Déplacez les quatre coins pour entourer toute la carte. Le résultat sera remis au format ID-1 (1,586) sans couper.
        </p>
        <div
          className="cin-manual-crop-stage"
          ref={stageRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt="Source CIN"
            className="cin-manual-crop-source"
            draggable={false}
            onLoad={() => setLayoutTick((n) => n + 1)}
          />
          {/* layoutTick force le recalcul des poignées après chargement */}
          {overlay && layoutTick >= 0 && (
            <div className="cin-manual-crop-rect" style={overlay}>
              {['tl', 'tr', 'bl', 'br'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cin-manual-crop-handle cin-manual-crop-handle--${c}`}
                  aria-label={`Poignée ${c}`}
                  onPointerDown={(e) => onPointerDown(c, e)}
                />
              ))}
            </div>
          )}
        </div>
        {previewUrl && (
          <div className="cin-manual-crop-preview-wrap">
            <span className="cin-manual-crop-preview-label">Aperçu ID-1</span>
            <div className="cin-manual-crop-preview">
              <img src={previewUrl} alt="Aperçu recadré" />
            </div>
          </div>
        )}
        {err && <div className="cin-manual-crop-error">{err}</div>}
        <div className="cin-manual-crop-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={handleValidate} disabled={busy || !previewUrl}>
            <Check size={14} /> Valider
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
