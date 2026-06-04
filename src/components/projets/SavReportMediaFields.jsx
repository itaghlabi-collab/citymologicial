/**
 * SavReportMediaFields.jsx — Photos avant/après + signature client (CR SAV)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, User, X, Trash2, PenLine } from 'lucide-react';
import {
  isAllowedSavPhoto,
  MAX_SAV_PHOTOS,
  resolveProjectFileUrl,
} from '../../services/projects/savReportStorage';

const ACCEPT_IMG = '.png,.jpg,.jpeg,.webp,.gif';

function parsePhotoList(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw.filter((p) => p?.path) : [];
}

function SignaturePad({ onBlobChange, previewUrl, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const pos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0];
    const cx = t ? t.clientX : e.clientX;
    const cy = t ? t.clientY : e.clientY;
    return {
      x: ((cx - rect.left) / rect.width) * canvas.width,
      y: ((cy - rect.top) / rect.height) * canvas.height,
    };
  };

  function start(e) {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(e) {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    canvasRef.current?.toBlob((blob) => onBlobChange(blob), 'image/png');
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onBlobChange(null);
  }

  return (
    <div>
      <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={320}
          height={120}
          style={{ width: '100%', height: 120, display: 'block', touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      {previewUrl && (
        <img src={previewUrl} alt="Signature" style={{ maxWidth: '100%', maxHeight: 72, marginTop: 8, borderRadius: 4, border: '1px solid var(--border)' }} />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={clear}>
          <Trash2 size={12} /> Effacer
        </button>
        <label className="btn btn-ghost btn-sm" style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Upload size={12} /> Importer
          <input type="file" accept={ACCEPT_IMG} disabled={disabled} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onBlobChange(f); e.target.value = ''; }} />
        </label>
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: '6px 0 0' }}>
        <PenLine size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Dessinez ou importez une image de signature.
      </p>
    </div>
  );
}

function PhotoDropzone({ label, items, onAdd, onRemove, disabled }) {
  const inputRef = useRef(null);

  function handleFiles(list) {
    if (!list?.length || disabled) return;
    const files = Array.from(list).filter(isAllowedSavPhoto);
    if (!files.length) {
      alert('Images uniquement (JPG, PNG, WebP), max 10 Mo.');
      return;
    }
    const room = MAX_SAV_PHOTOS - items.length;
    if (room <= 0) {
      alert(`Maximum ${MAX_SAV_PHOTOS} photos.`);
      return;
    }
    onAdd(files.slice(0, room));
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 12, minHeight: 140 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {items.map((item) => (
          <div key={item.key} style={{ position: 'relative', width: 72, height: 72 }}>
            <img src={item.url} alt={item.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
            {!disabled && (
              <button type="button" onClick={() => onRemove(item)} style={{
                position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && items.length < MAX_SAV_PHOTOS && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.83rem', color: 'var(--red)', cursor: 'pointer', fontWeight: 600 }}>
          <Upload size={14} /> Ajouter des photos
          <input ref={inputRef} type="file" accept={ACCEPT_IMG} multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
        </label>
      )}
    </div>
  );
}

export function buildSavReportMediaDraft(initial = {}) {
  return {
    photos_avant: parsePhotoList(initial.photos_avant),
    photos_apres: parsePhotoList(initial.photos_apres),
    signature_path: initial.signature_path || '',
    signature_client_nom: initial.signature_client_nom || '',
    pendingAvant: [],
    pendingApres: [],
    signatureBlob: null,
    removeSignature: false,
    removeAvantPaths: [],
    removeApresPaths: [],
  };
}

export default function SavReportMediaFields({
  initial,
  mediaDraft,
  onMediaChange,
  disabled = false,
  onSignatureCaptured,
}) {
  const [avantItems, setAvantItems] = useState([]);
  const [apresItems, setApresItems] = useState([]);
  const [signaturePreview, setSignaturePreview] = useState('');
  const loadedKey = useRef('');

  const publish = useCallback((patch) => {
    onMediaChange?.({ ...mediaDraft, ...patch });
  }, [mediaDraft, onMediaChange]);

  useEffect(() => {
    const key = `${initial?.id || 'new'}-${JSON.stringify(initial?.photos_avant)}-${initial?.signature_path}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    let cancelled = false;
    (async () => {
      const avant = parsePhotoList(initial?.photos_avant);
      const apres = parsePhotoList(initial?.photos_apres);
      const aItems = await Promise.all(avant.map(async (p) => ({
        key: `av-${p.path}`,
        path: p.path,
        name: p.name || 'photo',
        url: await resolveProjectFileUrl(p.path),
        stored: true,
      })));
      const pItems = await Promise.all(apres.map(async (p) => ({
        key: `ap-${p.path}`,
        path: p.path,
        name: p.name || 'photo',
        url: await resolveProjectFileUrl(p.path),
        stored: true,
      })));
      if (cancelled) return;
      setAvantItems(aItems.filter((x) => x.url));
      setApresItems(pItems.filter((x) => x.url));
      if (initial?.signature_path) {
        const url = await resolveProjectFileUrl(initial.signature_path);
        if (url) setSignaturePreview(url);
      } else {
        setSignaturePreview('');
      }
      onMediaChange?.(buildSavReportMediaDraft(initial));
    })();
    return () => { cancelled = true; };
  }, [initial?.id, initial?.photos_avant, initial?.photos_apres, initial?.signature_path, onMediaChange]);

  useEffect(() => {
    const storedAvant = avantItems.filter((x) => x.stored).map((x) => ({ path: x.path, name: x.name }));
    const storedApres = apresItems.filter((x) => x.stored).map((x) => ({ path: x.path, name: x.name }));
    publish({
      photos_avant: storedAvant,
      photos_apres: storedApres,
      pendingAvant: avantItems.filter((x) => x.file).map((x) => x.file),
      pendingApres: apresItems.filter((x) => x.file).map((x) => x.file),
    });
  }, [avantItems, apresItems]);

  function addPhotos(kind, files) {
    const entries = files.map((file) => ({
      key: `new-${Date.now()}-${file.name}`,
      file,
      name: file.name,
      url: URL.createObjectURL(file),
      stored: false,
    }));
    if (kind === 'avant') setAvantItems((p) => [...p, ...entries]);
    else setApresItems((p) => [...p, ...entries]);
  }

  function removePhoto(item, kind) {
    if (item.stored && item.path) {
      const pathKey = kind === 'avant' ? 'removeAvantPaths' : 'removeApresPaths';
      publish({ [pathKey]: [...(mediaDraft[pathKey] || []), item.path] });
      if (kind === 'avant') setAvantItems((p) => p.filter((x) => x.key !== item.key));
      else setApresItems((p) => p.filter((x) => x.key !== item.key));
    } else if (kind === 'avant') {
      setAvantItems((p) => p.filter((x) => x.key !== item.key));
    } else {
      setApresItems((p) => p.filter((x) => x.key !== item.key));
    }
  }

  function onSignatureChange(blobOrFile) {
    if (!blobOrFile) {
      setSignaturePreview('');
      publish({ signatureBlob: null, removeSignature: true, signature_path: '' });
      return;
    }
    setSignaturePreview(URL.createObjectURL(blobOrFile));
    publish({ signatureBlob: blobOrFile, removeSignature: false });
    onSignatureCaptured?.();
  }

  const inputStyle = {
    width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
    borderRadius: 6, fontSize: '0.86rem', background: '#fff', boxSizing: 'border-box',
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
        <PhotoDropzone label="Photos avant intervention" items={avantItems} onAdd={(f) => addPhotos('avant', f)} onRemove={(i) => removePhoto(i, 'avant')} disabled={disabled} />
        <PhotoDropzone label="Photos après intervention" items={apresItems} onAdd={(f) => addPhotos('apres', f)} onRemove={(i) => removePhoto(i, 'apres')} disabled={disabled} />
      </div>
      <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <User size={14} /> Signature client
        </div>
        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 5 }}>Nom du signataire</label>
        <input
          type="text"
          disabled={disabled}
          placeholder="Nom et qualité du signataire"
          value={mediaDraft?.signature_client_nom || ''}
          onChange={(e) => publish({ signature_client_nom: e.target.value })}
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <SignaturePad disabled={disabled} previewUrl={signaturePreview} onBlobChange={onSignatureChange} />
      </div>
    </div>
  );
}
