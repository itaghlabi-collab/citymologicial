import {
  HardHat, Plus, Edit2, Trash2, Eye, Download, Search, X,
  Upload, Camera, ScanLine, User, FileText, Shield,
  Phone, MapPin, CheckCircle, Clock, AlertCircle,
  ChevronLeft, RefreshCw, ArrowUpDown, QrCode, Package,
  Loader
} from 'lucide-react';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useWorkers } from '../hooks/useWorkers';
import { scanCIN, canUseCamera, getCameraBlockedReason, getCameraErrorMessage, getCINCameraStream, preloadOcrEngine } from '../services/ocr';
import { captureCINFromVideo, prepareImportedCINImage } from '../services/cinCapture';
import { generateWorkerPdf } from '../services/rh/workerPdf';
import { listProjects } from '../services/projects/projects';

/* Exported for compatibility — starts empty, populated from API */
export const SEED_WORKERS = [];

/* ── Constants ── */
const FONCTIONS   = ['Macon', 'Coffreur', 'Ferrailleur', 'Electricien', 'Peintre', 'Plombier', 'Carreleur', 'Menuisier', 'Soudeur', 'Chauffeur', 'Manoeuvre', 'Chef equipe', 'Conducteur engins', 'Topographe'];
const EXPERIENCES = ['debutant', 'intermediaire', 'confirme', 'expert'];
const EXP_LABEL   = { debutant: 'Debutant', intermediaire: 'Intermediaire', confirme: 'Confirme', expert: 'Expert' };
const GROUPES     = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const TAILLES_VET = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const POINTURES   = ['38', '39', '40', '41', '42', '43', '44', '45', '46'];

const STATUT_CFG = {
  actif:        { label: 'Actif',        cls: 'badge-green'  },
  en_chantier:  { label: 'En chantier',  cls: 'badge-blue'   },
  disponible:   { label: 'Disponible',   cls: 'badge-orange' },
  suspendu:     { label: 'Suspendu',     cls: 'badge-red'    },
  archive:      { label: 'Archive',      cls: 'badge-grey'   },
};

/** CIN marocaine ID-1 : 85.60 mm × 53.98 mm */
const CIN_HINT = 'Cadrez la CIN dans le rectangle';
const SCANNER_PLACE_HINT = 'Placez la CIN dans le cadre';
/** Identifiant build — vérifier dans la console Safari mobile que cette version est chargée */
const CIN_SCANNER_VERSION = '2026-06-04-cin-capture-btn';

const EMPTY_FORM = {
  prenom: '', nom: '', telephone: '', cin: '', fonction: '', tarif: '',
  date_naissance: '', ville_naissance: '', adresse: '', nationalite: 'Marocaine', etat_civil: '', groupe_sanguin: '', date_expiration: '',
  specialite: '', experience: 'intermediaire', date_recrutement: '', statut: 'actif', disponibilite: 'oui',
  project_id: '', projet_nom: '', chantier: '', chantier_legacy: '',
  contact_urgence: '', tel_urgence: '', relation_urgence: '',
  pointure: '', taille_vetement: '', taille_gants: '', casque: '', badge: '',
  photo: '', cin_recto: '', cin_verso: '',
};

/* ── Helpers ── */
function fmtMAD(n) { return Number(n).toLocaleString('fr-MA') + ' MAD'; }
function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; } }
function initials(w) { return ((w.prenom?.[0] || '') + (w.nom?.[0] || '')).toUpperCase() || '?'; }
function genBadge() { return 'CH-' + String(Math.floor(Math.random() * 9000) + 1000); }

/* ── Input style ── */
function IS(err, extra = {}) {
  return {
    padding: '8px 11px', border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
    width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
    color: 'var(--text)', transition: 'border-color 0.15s', ...extra,
  };
}
function Label({ children, required }) {
  return (
    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

/** Cadre preview CIN — ratio officiel 85.60 / 53.98 mm */
function CINFrame({ children, hasImage, hint = CIN_HINT, className = '' }) {
  return (
    <div className={'cin-id-frame' + (hasImage ? ' has-img' : '') + (className ? ' ' + className : '')}>
      {children}
      {hint && !hasImage && <div className="cin-id-frame-hint">{hint}</div>}
    </div>
  );
}
function STitle({ children }) {
  return (
    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
      {children}
    </div>
  );
}

/* ── Toast ── */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, background: toast.type === 'error' ? '#D32F2F' : '#1B5E20', color: '#fff', borderRadius: 10, padding: '13px 20px', fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 380, animation: 'fadeIn 0.2s ease' }}>
      {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
      {toast.msg}
    </div>
  );
}

/* ── Avatar ── */
function Avatar({ worker, size = 36 }) {
  if (worker.photo) {
    return <img src={worker.photo} alt={worker.prenom} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: size > 48 ? '1.3rem' : '0.8rem', flexShrink: 0 }}>
      {initials(worker)}
    </div>
  );
}

/* ── Photo Upload Block ── */
function PhotoUpload({ value, onChange, label }) {
  const inputRef = useRef(null);

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => onChange(e.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        style={{ width: 100, height: 100, borderRadius: '50%', border: '2px dashed ' + (value ? 'var(--red)' : 'var(--border)'), cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', transition: 'border-color 0.15s', flexShrink: 0 }}
      >
        {value
          ? <img src={value} alt="photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ textAlign: 'center', color: 'var(--text-3)' }}><Camera size={22} /><div style={{ fontSize: '0.7rem', marginTop: 4 }}>{label}</div></div>
        }
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Upload size={11} /> Upload
        </button>
        {value && <button type="button" onClick={() => onChange('')} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', color: 'var(--red)' }}><X size={11} /></button>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
    </div>
  );
}

/* ── Zone Documents CIN — scan principal, galerie secondaire ── */
function CINDocZone({ side, value, onChange, onScan }) {
  const inputRef = useRef(null);
  const isRecto = side === 'recto';
  const title = isRecto ? 'Scanner CIN recto' : 'Scanner CIN verso';

  function isImageFile(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type === 'application/pdf') return false;
    return type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name);
  }

  function handleFile(file) {
    if (!file || !isImageFile(file)) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result, file);
    reader.onerror = () => console.error('[OCR CIN] lecture fichier echouee');
    reader.readAsDataURL(file);
  }

  function openGallery(e) {
    e?.stopPropagation();
    inputRef.current?.click();
  }

  function openScanner(e) {
    e?.stopPropagation();
    onScan(side);
  }

  const hiddenInputStyle = {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
  };

  return (
    <div className="cin-doc-zone-wrap">
      <div
        className={'cin-doc-zone' + (value ? ' has-img' : '')}
        role="button"
        tabIndex={0}
        onClick={openScanner}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openScanner(); } }}
      >
        <CINFrame hasImage={Boolean(value)} hint={value ? '' : CIN_HINT} className="cin-doc-zone-frame">
          {value ? (
            <>
              {(value.startsWith('data:image') || value.startsWith('http')) ? (
                <img src={value} alt={title} className="cin-id-frame-img" />
              ) : (
                <div className="cin-id-frame-empty"><span>Photo chargée</span></div>
              )}
              <div className="cin-doc-zone-rescan">
                <ScanLine size={14} /> Rescanner
              </div>
              <button type="button" className="cin-doc-zone-clear"
                onClick={e => { e.stopPropagation(); onChange('', null); }}
                aria-label="Supprimer">
                <X size={10} />
              </button>
            </>
          ) : (
            <div className="cin-doc-zone-empty">
              <div className="cin-doc-zone-icon">
                <ScanLine size={28} strokeWidth={1.75} />
              </div>
              <span className="cin-doc-zone-title">{title}</span>
              <span className="cin-doc-zone-sub">ou importer depuis la galerie</span>
              <span className="cin-doc-zone-hint">{CIN_HINT}</span>
            </div>
          )}
        </CINFrame>
      </div>

      <button type="button" className="cin-doc-zone-gallery" onClick={openGallery}>
        <Upload size={12} /> Galerie
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
        style={hiddenInputStyle}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CIN SCANNER — Codia full-screen (capture UI only → OCR inchangé)
   ══════════════════════════════════════════════════════ */

const STABLE_FRAMES_REQUIRED = 22;
const MIN_BRIGHTNESS = 45;

function CINScanner({
  onExtracted,
  onClose,
  onCaptureOnly,
  mode = 'full',
  captureSide = null,
  initialRecto = '',
  initialVerso = '',
  initialStream = null,
}) {
  const isCaptureMode = mode === 'capture' && Boolean(captureSide);
  const importUid = useId();
  const galleryInputRef = useRef(null);
  const hiddenInputStyle = {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
  };

  const [phase, setPhase]           = useState('live');
  const [side, setSide]             = useState(captureSide || 'recto');
  const [cameraActive, setCamActive] = useState(false);
  const [cameraLoading, setCamLoad] = useState(true);
  const [cameraMsg, setCameraMsg]   = useState('');
  const [rectoImg, setRecto]        = useState(initialRecto || null);
  const [versoImg, setVerso]        = useState(initialVerso || null);
  const [error, setError]           = useState('');
  const [stableCount, setStable]    = useState(0);
  const [captured, setCaptured]     = useState(false);
  const [indLight, setIndLight]     = useState('off');
  const [indFocus, setIndFocus]     = useState('off');
  const [indReady, setIndReady]     = useState('off');
  const [uploadStatus, setUploadStatus] = useState('');

  const videoRef      = useRef(null);
  const vfFrameRef    = useRef(null);
  const streamRef     = useRef(null);
  const canvasRef     = useRef(null);
  const rafRef        = useRef(null);
  const prevFrameRef  = useRef(null);
  const stableRef     = useRef(0);
  const sideRef       = useRef('recto');
  const rectoRef      = useRef(initialRecto || null);
  const versoRef      = useRef(initialVerso || null);
  const rectoFileRef  = useRef(null);
  const versoFileRef  = useRef(null);
  const rectoFullDataUrlRef = useRef(null);
  const versoFullDataUrlRef = useRef(null);
  const analyzeLoopRef = useRef(null);

  useEffect(() => {
    console.info('[CIN Scanner] mounted', CIN_SCANNER_VERSION, {
      secure: typeof window !== 'undefined' && window.isSecureContext,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : '',
    });
    preloadOcrEngine();
  }, []);

  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useEffect(() => { sideRef.current = side; }, [side]);

  useEffect(() => {
    if (isCaptureMode && captureSide) {
      setSide(captureSide);
      sideRef.current = captureSide;
    }
  }, [isCaptureMode, captureSide]);

  useEffect(() => {
    if (phase !== 'live') return undefined;
    if (initialStream) {
      attachStream(initialStream);
      return () => teardown();
    }
    setCamLoad(false);
    if (!canUseCamera()) {
      setCameraMsg(getCameraBlockedReason());
    }
    return () => teardown();
  }, [phase, initialStream]);

  function stopAnalyzeLoop() {
    if (analyzeLoopRef.current) {
      cancelAnimationFrame(analyzeLoopRef.current);
      analyzeLoopRef.current = null;
    }
  }

  function teardown() {
    stopAnalyzeLoop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  async function tuneVideoTrack(stream) {
    const track = stream.getVideoTracks()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      });
    } catch {
      try {
        await track.applyConstraints({ facingMode: 'environment' });
      } catch { /* iOS ignore */ }
    }
  }

  async function attachStream(stream) {
    if (!stream) return;
    stopAnalyzeLoop();
    streamRef.current = stream;
    setCamLoad(true);
    setCameraMsg('');
    setError('');

    try {
      await tuneVideoTrack(stream);
      setCamLoad(false);

      const video = videoRef.current;
      if (!video) {
        setCamActive(false);
        setCameraMsg('Élément vidéo indisponible.');
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.playsInline = true;
      video.muted = true;

      await new Promise((resolve) => {
        if (video.readyState >= 1) { resolve(); return; }
        const onReady = () => { video.removeEventListener('loadedmetadata', onReady); resolve(); };
        video.addEventListener('loadedmetadata', onReady);
        setTimeout(resolve, 2500);
      });

      try {
        await video.play();
      } catch (playErr) {
        console.warn('[CIN Scanner] video.play()', playErr);
      }
      setCamActive(true);
      prevFrameRef.current = null;
      stableRef.current = 0;
      analyzeFrame();
    } catch (err) {
      console.warn('[CIN Scanner] attachStream', err?.name || err);
      setCamActive(false);
      setCameraMsg(getCameraErrorMessage(err));
      setCamLoad(false);
    }
  }

  async function startCamera() {
    stopAnalyzeLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCamActive(false);
    setCamLoad(true);
    setCameraMsg('');
    setError('');

    if (!canUseCamera()) {
      setCamActive(false);
      setCameraMsg(getCameraBlockedReason());
      setCamLoad(false);
      return;
    }

    try {
      const stream = await getCINCameraStream();
      await attachStream(stream);
    } catch (err) {
      console.warn('[CIN Scanner] startCamera', err?.name || err, err?.message || '');
      setCamActive(false);
      setCameraMsg(getCameraErrorMessage(err));
      setCamLoad(false);
    }
  }

  async function analyzePhotos(recto, verso) {
    if (!recto) {
      setError('Capturez ou importez au moins le recto de la CIN.');
      return;
    }
    teardown();
    setPhase('uploading');
    setUploadStatus('Préparation…');
    setError('');
    try {
      const result = await scanCIN(recto, verso || null, {
        rectoFile: rectoFileRef.current,
        versoFile: versoFileRef.current,
        rectoFullDataUrl: rectoFullDataUrlRef.current,
        versoFullDataUrl: versoFullDataUrlRef.current,
        onProgress: setUploadStatus,
      });
      onExtracted(result);
      onClose();
    } catch (err) {
      const msg = (err?.message && err.message.length < 160)
        ? err.message
        : 'Erreur lecture image — saisissez les champs manuellement.';
      setError(msg);
      setPhase('live');
    }
  }

  function analyzeFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState < 2) {
      analyzeLoopRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const W = video.videoWidth || 640;
    const H = video.videoHeight || 480;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, W, H);

    const imageData = ctx.getImageData(0, 0, W, H);
    const { brightness, motionScore } = analyzePixels(imageData, prevFrameRef.current);
    prevFrameRef.current = imageData;

    const lightOk = brightness > MIN_BRIGHTNESS;
    const motionOk = motionScore < 14;
    const isStable = lightOk && motionOk;

    if (isStable) stableRef.current += 1;
    else stableRef.current = Math.max(0, stableRef.current - 2);

    const progress = Math.min(1, stableRef.current / STABLE_FRAMES_REQUIRED);
    setStable(Math.round(progress * 100));
    setIndLight(lightOk ? 'ok' : 'warn');
    setIndFocus(motionOk ? 'ok' : 'warn');
    setIndReady(progress >= 1 ? 'ok' : progress >= 0.6 ? 'warn' : 'off');

    analyzeLoopRef.current = requestAnimationFrame(analyzeFrame);
  }

  function analyzePixels(current, previous) {
    const d = current.data;
    let brightnessSum = 0;
    let motionSum = 0;
    const step = 8;
    let count = 0;
    for (let i = 0; i < d.length; i += step * 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      brightnessSum += (r + g + b) / 3;
      if (previous) {
        const pd = previous.data;
        motionSum += Math.abs(r - pd[i]) + Math.abs(g - pd[i + 1]) + Math.abs(b - pd[i + 2]);
      }
      count++;
    }
    return {
      brightness: count > 0 ? brightnessSum / count : 128,
      motionScore: count > 0 ? motionSum / count : 0,
    };
  }

  async function captureCurrentSide() {
    const video = videoRef.current;
    const frameEl = vfFrameRef.current;
    if (!video || !frameEl || phase !== 'live') return;
    if (!streamRef.current || video.readyState < 2) return;

    try {
      const { previewDataUrl, ocrFile, fullDataUrl } = await captureCINFromVideo(video, frameEl, sideRef.current);
      console.info('[OCR CIN] using original/cropped file', {
        side: sideRef.current,
        ocrBytes: ocrFile.size,
        display: 'cropped-viewfinder',
      });

      setCaptured(true);
      setTimeout(() => setCaptured(false), 400);

      if (sideRef.current === 'recto') {
        rectoRef.current = previewDataUrl;
        rectoFileRef.current = ocrFile;
        rectoFullDataUrlRef.current = fullDataUrl || null;
        setRecto(previewDataUrl);
        if (!isCaptureMode && !versoRef.current) setSide('verso');
      } else {
        versoRef.current = previewDataUrl;
        versoFileRef.current = ocrFile;
        versoFullDataUrlRef.current = fullDataUrl || null;
        setVerso(previewDataUrl);
      }
    } catch (err) {
      console.error('[SCAN CIN] capture failed', err);
      setError('Capture impossible — cadrez la CIN dans le rectangle rouge et réessayez.');
    }
  }

  function retakeCurrentSide() {
    if (side === 'recto') {
      rectoRef.current = null;
      rectoFileRef.current = null;
      rectoFullDataUrlRef.current = null;
      setRecto(null);
    } else {
      versoRef.current = null;
      versoFileRef.current = null;
      versoFullDataUrlRef.current = null;
      setVerso(null);
    }
    stableRef.current = 0;
    prevFrameRef.current = null;
    setStable(0);
  }

  function readImageFile(file, targetSide, onDone) {
    if (!file) return;
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type === 'application/pdf') {
      setError('PDF non supporté pour l\'OCR. Utilisez une photo JPG ou PNG.');
      return;
    }
    if (!type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(name)) {
      setError('Format non supporté. Utilisez une photo.');
      return;
    }
    console.info('[OCR CIN] mobile file selected', { name: file.name, type: file.type || '(vide)', size: file.size });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const prepared = await prepareImportedCINImage(ev.target.result, file, targetSide);
        console.info('[OCR CIN] using original/cropped file', {
          side: targetSide,
          ocrBytes: prepared.ocrFile.size,
          display: 'cropped-import',
        });
        onDone(prepared.previewDataUrl, prepared.ocrFile, prepared.fullDataUrl);
      } catch (err) {
        console.error('[SCAN CIN] import crop failed', err);
        setError('Impossible de recadrer l\'image importée.');
      }
    };
    reader.onerror = () => setError('Impossible de lire le fichier image.');
    reader.readAsDataURL(file);
  }

  function assignImportedImage(targetSide, dataUrl, file, fullDataUrl) {
    if (targetSide === 'recto') {
      rectoRef.current = dataUrl;
      rectoFileRef.current = file;
      rectoFullDataUrlRef.current = fullDataUrl || null;
      setRecto(dataUrl);
    } else {
      versoRef.current = dataUrl;
      versoFileRef.current = file;
      versoFullDataUrlRef.current = fullDataUrl || null;
      setVerso(dataUrl);
    }
    setSide(targetSide);
    setError('');
    if (isCaptureMode && onCaptureOnly) {
      teardown();
      onCaptureOnly(targetSide, dataUrl, file, fullDataUrl);
      return;
    }
  }

  function confirmCaptureSide() {
    const s = isCaptureMode ? (captureSide || sideRef.current) : sideRef.current;
    const preview = s === 'recto' ? rectoRef.current : versoRef.current;
    const file = s === 'recto' ? rectoFileRef.current : versoFileRef.current;
    const fullDataUrl = s === 'recto' ? rectoFullDataUrlRef.current : versoFullDataUrlRef.current;
    if (!preview) {
      setError('Capturez ou importez une photo avant de valider.');
      return;
    }
    teardown();
    if (onCaptureOnly) onCaptureOnly(s, preview, file, fullDataUrl);
  }

  const currentSideHasImage = isCaptureMode
    ? (captureSide === 'recto' ? Boolean(rectoImg) : Boolean(versoImg))
    : Boolean(rectoImg);

  function openGalleryPicker() {
    galleryInputRef.current?.click();
  }

  function handleGalleryPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    const targetSide = isCaptureMode && captureSide ? captureSide : side;
    readImageFile(f, targetSide, (dataUrl, file, fullDataUrl) => assignImportedImage(targetSide, dataUrl, file, fullDataUrl));
  }

  const activeSide = isCaptureMode && captureSide ? captureSide : side;
  const isRecto = activeSide === 'recto';
  const progressPct = Math.max(0, Math.min(100, Number(stableCount) || 0));
  const frameReady = progressPct >= 100;
  const sideFaceLabel = isRecto ? 'RECTO — FACE PRINCIPALE' : 'VERSO — DOS DE LA CARTE';

  const insecureContext = typeof window !== 'undefined' && !window.isSecureContext;

  if (phase === 'uploading') {
    return createPortal(
      <div className="cin-scanner-overlay cin-scanner-overlay--dark" data-cin-scanner={CIN_SCANNER_VERSION}>
        <div className="cin-upload-box">
          <Loader size={32} className="cin-spin" style={{ color: 'var(--red)' }} />
          <div className="cin-upload-title">Analyse en cours...</div>
          <div className="cin-upload-sub">{uploadStatus || 'Extraction des données CIN (Mindee ou Tesseract)'}</div>
          <div className="cin-upload-previews">
            {rectoImg && <img src={rectoImg} alt="Recto" className="cin-upload-thumb" />}
            {versoImg && <img src={versoImg} alt="Verso" className="cin-upload-thumb" />}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="cin-scanner-overlay cin-scanner-overlay--dark cin-scanner-live"
      data-cin-scanner={CIN_SCANNER_VERSION}
    >
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <video
        ref={videoRef}
        className={'cin-camera-feed' + (cameraActive ? '' : ' cin-camera-feed--off')}
        autoPlay
        playsInline
        muted
      />

      {!cameraActive && (
        <div className="cin-camera-placeholder" aria-hidden="true" />
      )}

      {cameraLoading && (
        <div className="cin-camera-loading">
          <Loader size={28} className="cin-spin" style={{ color: 'var(--red)' }} />
          <span>Activation caméra...</span>
        </div>
      )}

      {(cameraMsg || error) && !cameraActive && !cameraLoading && (
        <div className="cin-camera-blocked">
          <AlertCircle size={16} />
          <p>{cameraMsg || error}</p>
          {canUseCamera() && (
            <button type="button" className="cin-action-btn cin-action-btn--primary" onClick={startCamera}>
              <Camera size={14} /> {cameraMsg ? 'Réessayer la caméra' : 'Activer la caméra'}
            </button>
          )}
          <button type="button" className="cin-action-btn cin-action-btn--ghost" onClick={openGalleryPicker}>
            <Upload size={14} /> Importer depuis galerie
          </button>
        </div>
      )}

      {!cameraActive && !cameraLoading && !cameraMsg && !error && canUseCamera() && (
        <div className="cin-camera-blocked">
          <button type="button" className="cin-action-btn cin-action-btn--primary" onClick={startCamera}>
            <Camera size={16} /> Activer la caméra
          </button>
        </div>
      )}

      {insecureContext && (
        <div className="cin-https-banner">
          HTTPS requis sur iPhone pour la caméra custom — utilisez l’URL https:// affichée au démarrage du serveur.
        </div>
      )}

      <svg className="cin-mask-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id={`cin-cutout-${importUid}`}>
            <rect width="100" height="100" fill="white" />
            <rect x="9" y="24.15" width="82" height="51.70" rx="2.2" ry="2.2" fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(0,0,0,0.72)" mask={`url(#cin-cutout-${importUid})`} />
      </svg>

      <div
        ref={vfFrameRef}
        className={'cin-vf-frame' + (frameReady ? ' cin-vf-frame--ready' : '')}
        role="button"
        tabIndex={0}
        aria-label="Capturer la CIN"
        onClick={() => { if (cameraActive) captureCurrentSide(); }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && cameraActive) {
            e.preventDefault();
            captureCurrentSide();
          }
        }}
      >
        <span className="cin-vf-corner cin-vf-corner--tl" />
        <span className="cin-vf-corner cin-vf-corner--tr" />
        <span className="cin-vf-corner cin-vf-corner--bl" />
        <span className="cin-vf-corner cin-vf-corner--br" />
        {captured && <div className="cin-capture-flash" />}
      </div>

      <div className="cin-top-bar">
        <div className="cin-side-badge-wrap">
          <span className={'cin-side-badge ' + (isRecto ? 'cin-side-badge--recto' : 'cin-side-badge--verso')}>
            {isRecto ? 'RECTO' : 'VERSO'}
          </span>
          <span className="cin-step-label">{rectoImg ? (versoImg ? '2/2' : '1/2') : '0/2'}</span>
        </div>
        <button type="button" className="cin-close-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>

      <div className="cin-indicators">
        <div className={'cin-ind ' + indLight}>
          <span className="cin-ind-dot" />
          <span className="cin-ind-label">Lumière</span>
        </div>
        <div className={'cin-ind ' + indFocus}>
          <span className="cin-ind-dot" />
          <span className="cin-ind-label">Stabilité</span>
        </div>
        <div className={'cin-ind ' + indReady}>
          <span className="cin-ind-dot" />
          <span className="cin-ind-label">Prêt</span>
        </div>
      </div>

      <div className={'cin-progress-bar-wrap' + (frameReady ? ' ready' : '')}>
        <div className="cin-progress-bar" style={{ width: progressPct + '%' }} />
      </div>

      <div className="cin-hint-bar">
        <span className="cin-hint-text">{SCANNER_PLACE_HINT}</span>
        <span className="cin-hint-side">{sideFaceLabel}</span>
        <span className="cin-hint-tap">Appuyez pour capturer</span>
      </div>

      {(rectoImg || versoImg) && !isCaptureMode && (
        <div className="cin-capture-thumbs">
          {rectoImg && (
            <button type="button" className={'cin-capture-thumb' + (isRecto ? ' active' : '')} onClick={() => setSide('recto')}>
              <img src={rectoImg} alt="Recto capturé" />
              <span>Recto</span>
            </button>
          )}
          {versoImg && (
            <button type="button" className={'cin-capture-thumb' + (!isRecto ? ' active' : '')} onClick={() => setSide('verso')}>
              <img src={versoImg} alt="Verso capturé" />
              <span>Verso</span>
            </button>
          )}
        </div>
      )}

      {!isCaptureMode && (
        <div className="cin-side-switch cin-side-switch--live">
          <button type="button" className={'cin-side-switch-btn' + (isRecto ? ' active recto' : '')} onClick={() => setSide('recto')}>Recto</button>
          <button type="button" className={'cin-side-switch-btn' + (!isRecto ? ' active verso' : '')} onClick={() => setSide('verso')}>Verso</button>
        </div>
      )}

      <div className="cin-scanner-actions">
        {!isCaptureMode && (
          <button type="button" className="cin-action-btn cin-action-btn--ghost" onClick={openGalleryPicker}>
            <Upload size={16} /> Galerie
          </button>
        )}
        {/* Pas de capture= — galerie uniquement, jamais caméra native iOS */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          style={hiddenInputStyle}
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleGalleryPick}
        />

        <button type="button" className="cin-action-btn cin-action-btn--ghost" onClick={retakeCurrentSide}>
          <RefreshCw size={16} /> Reprendre
        </button>

        <button type="button" className={'cin-action-btn cin-action-btn--capture' + (frameReady && cameraActive ? ' ready' : '')}
          disabled={!cameraActive}
          onClick={captureCurrentSide}>
          <Camera size={18} /> Capturer
        </button>

        {isCaptureMode ? (
          <button type="button" className="cin-action-btn cin-action-btn--primary"
            disabled={!currentSideHasImage}
            onClick={confirmCaptureSide}>
            <CheckCircle size={16} /> Utiliser cette photo
          </button>
        ) : (
          <button type="button" className="cin-action-btn cin-action-btn--primary" disabled={!rectoImg}
            onClick={() => analyzePhotos(rectoRef.current, versoRef.current)}>
            <ScanLine size={16} /> Analyser
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ══════════════════════════════════════════════════════
   OUVRIER DETAIL PAGE
   ══════════════════════════════════════════════════════ */
function OuvrierDetail({ worker, onBack, onEdit, onDownloadPdf, pdfLoading }) {
  const [tab, setTab] = useState('infos');
  const tabs = [
    { id: 'infos',      label: 'Informations' },
    { id: 'documents',  label: 'Documents' },
    { id: 'chantier',   label: 'Chantier' },
    { id: 'securite',   label: 'Securite' },
    { id: 'equipements', label: 'Equipements' },
  ];
  const cfg = STATUT_CFG[worker.statut] || STATUT_CFG.actif;

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Retour aux ouvriers
      </button>

      {/* Profile header */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <Avatar worker={worker} size={80} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text)', margin: 0 }}>
                {worker.prenom} {worker.nom}
              </h1>
              <span className={'badge ' + cfg.cls}>{cfg.label}</span>
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-2)', marginBottom: 8 }}>{worker.fonction || '—'} {worker.specialite ? '— ' + worker.specialite : ''}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.82rem', color: 'var(--text-3)', flexWrap: 'wrap' }}>
              <span><Phone size={12} style={{ display: 'inline', marginRight: 4 }} />{worker.telephone || '—'}</span>
              <span>CIN : <strong style={{ color: 'var(--text-2)' }}>{worker.cin || '—'}</strong></span>
              {worker.chantier && <span><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />{worker.chantier}</span>}
              {worker.badge && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>
                  <QrCode size={11} /> {worker.badge}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-ghost" onClick={() => onEdit(worker)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Edit2 size={13} /> Modifier
            </button>
            <button className="btn btn-primary" disabled={pdfLoading} onClick={() => onDownloadPdf(worker)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {pdfLoading ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Download size={13} />}
              {pdfLoading ? 'Génération…' : 'Télécharger fiche'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid var(--border)', marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', background: 'none', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--red)' : 'var(--text-2)', borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'infos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: '20px 22px' }}>
            <STitle><User size={14} /> Informations personnelles</STitle>
            {[
              ['Nom complet', worker.prenom + ' ' + worker.nom],
              ['Telephone', worker.telephone],
              ['CIN', worker.cin],
              ['Date naissance', fmtDate(worker.date_naissance)],
              ['Expiration CIN', fmtDate(worker.date_expiration)],
              ['Ville naissance', worker.ville_naissance],
              ['Adresse', worker.adresse],
              ['Nationalite', worker.nationalite],
              ['Etat civil', worker.etat_civil],
              ['Groupe sanguin', worker.groupe_sanguin],
            ].map(([k, v]) => v ? (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ) : null)}
          </div>
          <div className="card" style={{ padding: '20px 22px' }}>
            <STitle><HardHat size={14} /> Infos chantier</STitle>
            {[
              ['Fonction', worker.fonction],
              ['Specialite', worker.specialite],
              ['Experience', EXP_LABEL[worker.experience] || worker.experience],
              ['Date recrutement', fmtDate(worker.date_recrutement)],
              ['Statut', STATUT_CFG[worker.statut]?.label || worker.statut],
              ['Disponibilite', worker.disponibilite === 'oui' ? 'Disponible' : 'Non disponible'],
              ['Chantier affecte', worker.chantier],
              ['Tarif/jour', fmtMAD(worker.tarif)],
              ['Badge', worker.badge],
            ].map(([k, v]) => v ? (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: '20px 22px' }}>
            <STitle><FileText size={14} /> CIN Recto</STitle>
            {worker.cin_recto ? (
              <CINFrame hasImage hint="">
                <img src={worker.cin_recto} alt="CIN recto" className="cin-id-frame-img" />
              </CINFrame>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: '0.85rem', background: 'var(--bg)', borderRadius: 8 }}>Aucun document charge</div>
            )}
          </div>
          <div className="card" style={{ padding: '20px 22px' }}>
            <STitle><FileText size={14} /> CIN Verso</STitle>
            {worker.cin_verso ? (
              <CINFrame hasImage hint="">
                <img src={worker.cin_verso} alt="CIN verso" className="cin-id-frame-img" />
              </CINFrame>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: '0.85rem', background: 'var(--bg)', borderRadius: 8 }}>Aucun document charge</div>
            )}
          </div>
        </div>
      )}

      {tab === 'securite' && (
        <div className="card" style={{ padding: '20px 22px', maxWidth: 480 }}>
          <STitle><Shield size={14} /> Contact urgence</STitle>
          {[
            ['Contact', worker.contact_urgence],
            ['Telephone', worker.tel_urgence],
            ['Relation', worker.relation_urgence],
            ['Groupe sanguin', worker.groupe_sanguin],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'equipements' && (
        <div className="card" style={{ padding: '20px 22px', maxWidth: 480 }}>
          <STitle><Package size={14} /> Equipements attribues</STitle>
          {[
            ['Pointure', worker.pointure],
            ['Taille vetement', worker.taille_vetement],
            ['Taille gants', worker.taille_gants],
            ['Casque attribue', worker.casque],
            ['Badge chantier', worker.badge],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'chantier' && (
        <div className="card" style={{ padding: '20px 22px' }}>
          <STitle><HardHat size={14} /> Historique chantier</STitle>
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: '0.85rem' }}>
            Aucun historique disponible — connectez le backend pour voir les affectations passees.
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   OUVRIER FORM MODAL
   ══════════════════════════════════════════════════════ */
function OuvrierModal({ worker, onClose, onSave, saving, projects = [] }) {
  const isEdit = !!worker;
  const [form, setForm] = useState(() => worker ? { ...EMPTY_FORM, ...worker } : { ...EMPTY_FORM, badge: genBadge() });
  const [errors, setErrors] = useState({});
  const [showScanner, setShowScanner] = useState(false);
  const [scannerStream, setScannerStream] = useState(null);
  const [scannerMode, setScannerMode] = useState('full');
  const [captureSide, setCaptureSide] = useState(null);
  const [formTab, setFormTab] = useState('identite');
  const [ocrFilled, setOcrFilled]   = useState(false);
  const [ocrToast,  setOcrToast]    = useState('');
  const [ocrAnalyzing, setOcrAnalyzing] = useState(false);
  const ocrFilesRef = useRef({ recto: null, verso: null });
  const ocrFullDataUrlRef = useRef({ recto: null, verso: null });

  const formTabs = [
    { id: 'identite',    label: 'Identite' },
    { id: 'chantier',    label: 'Chantier' },
    { id: 'securite',    label: 'Securite' },
    { id: 'documents',   label: 'Documents' },
    { id: 'equipements', label: 'Equipements' },
  ];

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleCINDocImport(side, preview, file) {
    if (!preview) {
      set(side === 'recto' ? 'cin_recto' : 'cin_verso', '');
      ocrFilesRef.current[side] = null;
      ocrFullDataUrlRef.current[side] = null;
      return;
    }
    if (!file) {
      set(side === 'recto' ? 'cin_recto' : 'cin_verso', preview);
      return;
    }
    try {
      const prepared = await prepareImportedCINImage(preview, file, side);
      console.info('[OCR CIN] using original/cropped file', {
        side,
        ocrBytes: prepared.ocrFile.size,
        display: 'cropped-doc-zone',
      });
      set(side === 'recto' ? 'cin_recto' : 'cin_verso', prepared.previewDataUrl);
      ocrFilesRef.current[side] = prepared.ocrFile;
      ocrFullDataUrlRef.current[side] = prepared.fullDataUrl || null;
    } catch (err) {
      console.error('[SCAN CIN] doc zone crop failed', err);
      set(side === 'recto' ? 'cin_recto' : 'cin_verso', preview);
      ocrFilesRef.current[side] = file;
      ocrFullDataUrlRef.current[side] = preview;
    }
  }

  function openCINScanner() {
    setScannerMode('full');
    setCaptureSide(null);
    setScannerStream(null);
    setShowScanner(true);
  }

  function openCINScannerForSide(side) {
    setScannerMode('capture');
    setCaptureSide(side);
    setScannerStream(null);
    setShowScanner(true);
  }

  function closeCINScanner() {
    if (scannerStream) {
      scannerStream.getTracks().forEach(t => t.stop());
    }
    setScannerStream(null);
    setScannerMode('full');
    setCaptureSide(null);
    setShowScanner(false);
  }

  function handleSideCaptured(side, preview, file, fullDataUrl) {
    if (side === 'recto') {
      set('cin_recto', preview);
      ocrFilesRef.current.recto = file || null;
      ocrFullDataUrlRef.current.recto = fullDataUrl || null;
    } else {
      set('cin_verso', preview);
      ocrFilesRef.current.verso = file || null;
      ocrFullDataUrlRef.current.verso = fullDataUrl || null;
    }
    setFormTab('documents');
    closeCINScanner();
  }

  const WORKER_OCR_FIELDS = ['cin', 'prenom', 'nom', 'date_naissance', 'ville_naissance', 'adresse', 'date_expiration', 'sexe', 'nationalite'];

  function applyOcrResult(result) {
    const {
      _ocr_warning, _ocr_partial, _ocr_source, _ocr_provider_used, _ocr_backend_error,
      _ocr_audit, _ocr_debug, provider, confidence, lieu_naissance,
    } = result;
    const fields = {};
    WORKER_OCR_FIELDS.forEach((k) => {
      if (result[k] != null && String(result[k]).trim() !== '') fields[k] = result[k];
    });
    if (_ocr_provider_used) {
      console.info('[OCR CIN] OCR provider utilisé = ' + _ocr_provider_used);
    }
    if (_ocr_backend_error) {
      console.error('[OCR CIN] Mindee échec (erreur exacte):', _ocr_backend_error);
    }
    let warning = _ocr_warning || '';
    if (_ocr_audit?.verdict && !_ocr_audit.verdict.mindee_really_used) {
      const root = _ocr_audit.verdict.root_cause || 'Mindee non utilisé — vérifiez MINDEE_API_KEY et MINDEE_MODEL_ID sur Vercel.';
      warning = root + (warning ? ' — ' + warning : '');
    }
    handleScanExtracted(fields, warning || undefined);
  }

  function handleScanExtracted(data, warning) {
    setForm(p => ({ ...p, ...data }));
    setFormTab('identite');
    const filled = ['cin','prenom','nom','date_naissance','ville_naissance','adresse','date_expiration','sexe','nationalite']
      .filter(k => data[k] && String(data[k]).trim() !== '');
    setOcrFilled(true);
    if (warning) {
      setOcrToast(warning);
    } else if (filled.length > 0) {
      setOcrToast(`${filled.length} champ${filled.length > 1 ? 's' : ''} rempli${filled.length > 1 ? 's' : ''} automatiquement`);
    } else {
      setOcrToast('OCR termine — verifiez et corrigez les champs manuellement');
    }
    setTimeout(() => setOcrFilled(false), 3000);
    setTimeout(() => setOcrToast(''), 6000);
  }

  async function handleAnalyzeDocuments() {
    if (!form.cin_recto) {
      setOcrToast('Importez au moins le recto CIN avant d\'analyser.');
      setTimeout(() => setOcrToast(''), 4000);
      return;
    }
    setOcrAnalyzing(true);
    setOcrToast('');
    try {
      const result = await scanCIN(form.cin_recto, form.cin_verso || null, {
        rectoFile: ocrFilesRef.current.recto,
        versoFile: ocrFilesRef.current.verso,
        rectoFullDataUrl: ocrFullDataUrlRef.current.recto,
        versoFullDataUrl: ocrFullDataUrlRef.current.verso,
      });
      applyOcrResult(result);
    } catch (err) {
      setOcrToast(err?.message || 'Erreur lecture image — saisissez les champs manuellement.');
      setTimeout(() => setOcrToast(''), 6000);
    } finally {
      setOcrAnalyzing(false);
    }
  }

  function validate() {
    const e = {};
    if (!form.prenom.trim()) e.prenom = 'Requis';
    if (!form.nom.trim())    e.nom    = 'Requis';
    if (!form.cin.trim())    e.cin    = 'Requis';
    if (!form.tarif || isNaN(Number(form.tarif))) e.tarif = 'Montant valide requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); setFormTab('identite'); return; }
    const result = await onSave({ ...form, tarif: Number(form.tarif) }, isEdit);
    if (result?.success) onClose();
  }

  return (
    <>
      {showScanner && (
        <CINScanner
          mode={scannerMode}
          captureSide={captureSide}
          onCaptureOnly={handleSideCaptured}
          onExtracted={applyOcrResult}
          onClose={closeCINScanner}
          initialStream={scannerStream}
          initialRecto={form.cin_recto}
          initialVerso={form.cin_verso}
        />
      )}

      {/* OCR success toast */}
      {ocrToast && (
        <div className="ocr-toast">
          <CheckCircle size={14} style={{ flexShrink: 0 }} />
          {ocrToast}
        </div>
      )}

      <div className="ouv-modal-overlay">
        <div className="ouv-modal-box">
          {/* Modal header */}
          <div className="ouv-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FFEBEE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <HardHat size={18} style={{ color: 'var(--red)' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', textTransform: 'uppercase' }}>
                  {isEdit ? 'Modifier ouvrier' : 'Ajouter un ouvrier'}
                </div>
                {isEdit && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{form.prenom} {form.nom}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={openCINScanner} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--red)' }}>
                <ScanLine size={13} /> <span className="ouv-scanner-label">Scanner CIN</span>
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={20} /></button>
            </div>
          </div>

          {/* Form tabs */}
          <div className="ouv-modal-tabs">
            {formTabs.map(t => (
              <button key={t.id} type="button" onClick={() => setFormTab(t.id)} className={'ouv-tab-btn' + (formTab === t.id ? ' active' : '')}>
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1 }}>
            <div className="ouv-modal-body">

              {/* ── TAB: IDENTITE ── */}
              {formTab === 'identite' && (
                <div className="ouv-identite-grid">
                  {/* Photo */}
                  <PhotoUpload value={form.photo} onChange={v => set('photo', v)} label="Photo" />

                  <div className="ouv-fields-grid">
                    <div className="form-group">
                      <Label required>Prenom</Label>
                      <input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={IS(errors.prenom, ocrFilled && form.prenom ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                      {errors.prenom && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.prenom}</span>}
                    </div>
                    <div className="form-group">
                      <Label required>Nom</Label>
                      <input value={form.nom} onChange={e => set('nom', e.target.value)} style={IS(errors.nom, ocrFilled && form.nom ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                      {errors.nom && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.nom}</span>}
                    </div>
                    <div className="form-group">
                      <Label required>CIN</Label>
                      <input value={form.cin} onChange={e => set('cin', e.target.value.toUpperCase())} placeholder="AB123456" style={IS(errors.cin, ocrFilled && form.cin ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                      {errors.cin && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.cin}</span>}
                    </div>
                    <div className="form-group">
                      <Label>Telephone</Label>
                      <input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="+212 600 000 000" style={IS(false)} />
                    </div>
                    <div className="form-group">
                      <Label>Date de naissance</Label>
                      <input type="date" value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)} style={IS(false, ocrFilled && form.date_naissance ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                    </div>
                    <div className="form-group">
                      <Label>Expiration CIN</Label>
                      <input type="date" value={form.date_expiration} onChange={e => set('date_expiration', e.target.value)} style={IS(false, ocrFilled && form.date_expiration ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                    </div>
                    <div className="form-group">
                      <Label>Ville de naissance</Label>
                      <input value={form.ville_naissance} onChange={e => set('ville_naissance', e.target.value)} style={IS(false, ocrFilled && form.ville_naissance ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <Label>Adresse</Label>
                      <input value={form.adresse} onChange={e => set('adresse', e.target.value)} style={IS(false)} />
                    </div>
                    <div className="form-group">
                      <Label>Nationalite</Label>
                      <input value={form.nationalite} onChange={e => set('nationalite', e.target.value)} style={IS(false, ocrFilled && form.nationalite ? { borderColor: '#43A047', background: '#F1F8E9' } : {})} />
                    </div>
                    <div className="form-group">
                      <Label>Etat civil</Label>
                      <select value={form.etat_civil} onChange={e => set('etat_civil', e.target.value)} style={IS(false)}>
                        <option value="">Choisir...</option>
                        <option value="celibataire">Celibataire</option>
                        <option value="marie">Marie(e)</option>
                        <option value="divorce">Divorce(e)</option>
                        <option value="veuf">Veuf/Veuve</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <Label>Groupe sanguin</Label>
                      <select value={form.groupe_sanguin} onChange={e => set('groupe_sanguin', e.target.value)} style={IS(false)}>
                        <option value="">Choisir...</option>
                        {GROUPES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: CHANTIER ── */}
              {formTab === 'chantier' && (
                <div className="ouv-fields-grid">
                  <div className="form-group">
                    <Label required>Fonction</Label>
                    <select value={form.fonction} onChange={e => set('fonction', e.target.value)} style={IS(false)}>
                      <option value="">Choisir...</option>
                      {FONCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <Label required>Tarif journalier (MAD)</Label>
                    <input type="number" min="0" value={form.tarif} onChange={e => set('tarif', e.target.value)} placeholder="350" style={IS(errors.tarif)} />
                    {errors.tarif && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.tarif}</span>}
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <Label>Specialite metier</Label>
                    <input value={form.specialite} onChange={e => set('specialite', e.target.value)} placeholder="Ex : Maconnerie traditionnelle, ferraillage..." style={IS(false)} />
                  </div>
                  <div className="form-group">
                    <Label>Niveau d'experience</Label>
                    <select value={form.experience} onChange={e => set('experience', e.target.value)} style={IS(false)}>
                      {EXPERIENCES.map(x => <option key={x} value={x}>{EXP_LABEL[x]}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <Label>Date de recrutement</Label>
                    <input type="date" value={form.date_recrutement} onChange={e => set('date_recrutement', e.target.value)} style={IS(false)} />
                  </div>
                  <div className="form-group">
                    <Label>Statut</Label>
                    <select value={form.statut} onChange={e => set('statut', e.target.value)} style={IS(false)}>
                      {Object.entries(STATUT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <Label>Disponibilite</Label>
                    <select value={form.disponibilite} onChange={e => set('disponibilite', e.target.value)} style={IS(false)}>
                      <option value="oui">Disponible</option>
                      <option value="non">Non disponible</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <Label>Projet / Chantier affecte</Label>
                    <select
                      value={form.project_id || ''}
                      onChange={e => {
                        const pr = projects.find(p => String(p.id) === String(e.target.value));
                        setForm(p => ({
                          ...p,
                          project_id: e.target.value,
                          projet_nom: pr?.nom || '',
                          chantier: pr?.nom || (e.target.value ? '' : (p.chantier_legacy || p.chantier || '')),
                        }));
                      }}
                      style={IS(false)}
                    >
                      <option value="">— Aucun projet —</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                      ))}
                    </select>
                  </div>
                  {!form.project_id && (
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <Label>Chantier (texte libre)</Label>
                      <input
                        value={form.chantier_legacy || form.chantier || ''}
                        onChange={e => setForm(p => ({ ...p, chantier: e.target.value, chantier_legacy: e.target.value }))}
                        placeholder="Ancien chantier non lie a un projet..."
                        style={IS(false)}
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <Label>Badge chantier</Label>
                    <input value={form.badge} onChange={e => set('badge', e.target.value)} style={IS(false)} />
                  </div>
                </div>
              )}

              {/* ── TAB: SECURITE ── */}
              {formTab === 'securite' && (
                <div className="ouv-fields-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <Label>Nom contact urgence</Label>
                    <input value={form.contact_urgence} onChange={e => set('contact_urgence', e.target.value)} placeholder="Prenom Nom..." style={IS(false)} />
                  </div>
                  <div className="form-group">
                    <Label>Telephone urgence</Label>
                    <input value={form.tel_urgence} onChange={e => set('tel_urgence', e.target.value)} placeholder="+212 600..." style={IS(false)} />
                  </div>
                  <div className="form-group">
                    <Label>Relation</Label>
                    <select value={form.relation_urgence} onChange={e => set('relation_urgence', e.target.value)} style={IS(false)}>
                      <option value="">Choisir...</option>
                      <option value="conjoint">Conjoint(e)</option>
                      <option value="parent">Parent</option>
                      <option value="frere_soeur">Frere / Soeur</option>
                      <option value="ami">Ami(e)</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <Label>Groupe sanguin</Label>
                    <select value={form.groupe_sanguin} onChange={e => set('groupe_sanguin', e.target.value)} style={IS(false)}>
                      <option value="">Choisir...</option>
                      {GROUPES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* ── TAB: DOCUMENTS ── */}
              {formTab === 'documents' && (
                <div className="ouv-fields-grid">
                  <div className="form-group">
                    <Label>CIN Recto</Label>
                    <CINDocZone
                      side="recto"
                      value={form.cin_recto}
                      onChange={(preview, file) => handleCINDocImport('recto', preview, file)}
                      onScan={openCINScannerForSide}
                    />
                  </div>
                  <div className="form-group">
                    <Label>CIN Verso</Label>
                    <CINDocZone
                      side="verso"
                      value={form.cin_verso}
                      onChange={(preview, file) => handleCINDocImport('verso', preview, file)}
                      onScan={openCINScannerForSide}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--text-3)', marginTop: -4 }}>
                    {CIN_HINT} — format carte 85,60 × 53,98 mm
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <button
                      type="button"
                      className="btn btn-primary cin-doc-analyze-btn"
                      disabled={ocrAnalyzing || !form.cin_recto}
                      onClick={handleAnalyzeDocuments}
                    >
                      {ocrAnalyzing
                        ? <><Loader size={15} className="cin-spin" /> Analyse en cours...</>
                        : <><ScanLine size={15} /> Analyser les photos</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB: EQUIPEMENTS ── */}
              {formTab === 'equipements' && (
                <div className="ouv-fields-grid">
                  <div className="form-group">
                    <Label>Pointure</Label>
                    <select value={form.pointure} onChange={e => set('pointure', e.target.value)} style={IS(false)}>
                      <option value="">Choisir...</option>
                      {POINTURES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <Label>Taille vetement</Label>
                    <select value={form.taille_vetement} onChange={e => set('taille_vetement', e.target.value)} style={IS(false)}>
                      <option value="">Choisir...</option>
                      {TAILLES_VET.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <Label>Taille gants</Label>
                    <select value={form.taille_gants} onChange={e => set('taille_gants', e.target.value)} style={IS(false)}>
                      <option value="">Choisir...</option>
                      {['S', 'M', 'L', 'XL', 'XXL'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <Label>Casque attribue</Label>
                    <input value={form.casque} onChange={e => set('casque', e.target.value)} placeholder="N° casque..." style={IS(false)} />
                  </div>
                  <div className="form-group">
                    <Label>Badge chantier</Label>
                    <input value={form.badge} onChange={e => set('badge', e.target.value)} style={IS(false)} />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="ouv-modal-footer">
              <div style={{ display: 'flex', gap: 8 }}>
                {formTabs.map((t, i) => (
                  <div key={t.id} style={{ width: 8, height: 8, borderRadius: '50%', background: formTab === t.id ? 'var(--red)' : 'var(--border)', transition: 'background 0.15s', cursor: 'pointer' }} onClick={() => setFormTab(t.id)} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 120 }}>
                  {saving ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <><Plus size={14} /> {isEdit ? 'Enregistrer' : 'Ajouter'}</>}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════
   OUVRIERS LISTE — MAIN COMPONENT
   ══════════════════════════════════════════════════════ */
export default function OuvriersListe({ onWorkersChange }) {
  const {
    workers,
    loading,
    saving,
    error,
    create,
    update,
    remove,
  } = useWorkers();

  const [view, setView]             = useState('list'); // 'list' | 'detail'
  const [detailWorker, setDetail]   = useState(null);
  const [search, setSearch]         = useState('');
  const [filterStatut, setFStatut]  = useState('');
  const [filterFonction, setFFonc]  = useState('');
  const [sortField, setSortField]   = useState('nom');
  const [sortDir, setSortDir]       = useState('asc');
  const [showModal, setShowModal]   = useState(false);
  const [editWorker, setEditWorker] = useState(null);
  const [toast, setToast]           = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const toastRef                    = useRef(null);
  const [projects, setProjects]       = useState([]);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  function notify(type, msg) {
    clearTimeout(toastRef.current);
    setToast({ type, msg });
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  async function handleDownloadPdf(worker) {
    setPdfLoadingId(worker.id);
    try {
      await generateWorkerPdf(worker);
      notify('success', `Fiche PDF téléchargée — ${worker.prenom} ${worker.nom}`);
    } catch (err) {
      console.error('[CITYMO] PDF ouvrier', err);
      notify('error', 'Erreur lors de la génération PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  }

  useEffect(() => {
    if (onWorkersChange) onWorkersChange(workers);
  }, [workers, onWorkersChange]);

  useEffect(() => {
    if (error) notify('error', error);
  }, [error]);

  useEffect(() => {
    if (!detailWorker) return;
    const fresh = workers.find((w) => w.id === detailWorker.id);
    if (fresh) setDetail(fresh);
  }, [workers, detailWorker?.id]);

  function openAdd()    { setEditWorker(null); setShowModal(true); }
  function openEdit(w)  { setEditWorker(w);    setShowModal(true); }

  async function handleSave(form, isEdit) {
    const result = isEdit ? await update(form.id, form) : await create(form);
    if (result.success) {
      notify('success', isEdit ? 'Ouvrier modifie avec succes.' : 'Ouvrier ajoute avec succes.');
    } else {
      notify('error', result.error || 'Erreur enregistrement.');
    }
    return result;
  }

  async function del(id) {
    if (!window.confirm('Supprimer cet ouvrier ?')) return;
    const result = await remove(id);
    if (result.success) {
      if (detailWorker?.id === id) { setView('list'); setDetail(null); }
      notify('success', 'Ouvrier supprime.');
    } else {
      notify('error', result.error || 'Erreur suppression.');
    }
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  const fonctions = [...new Set(workers.map(w => w.fonction).filter(Boolean))];

  const filtered = workers.filter(w => {
    const q = search.toLowerCase();
    const matchSearch = !q || (w.prenom + ' ' + w.nom).toLowerCase().includes(q) || (w.cin || '').toLowerCase().includes(q) || (w.fonction || '').toLowerCase().includes(q) || (w.chantier || '').toLowerCase().includes(q) || (w.projet_nom || '').toLowerCase().includes(q);
    const matchStatut  = !filterStatut   || w.statut   === filterStatut;
    const matchFonction = !filterFonction || w.fonction === filterFonction;
    return matchSearch && matchStatut && matchFonction;
  }).sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    if (sortField === 'tarif') { va = Number(va); vb = Number(vb); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  /* KPIs */
  const nTotal        = workers.length;
  const nEnChantier   = workers.filter(w => w.statut === 'en_chantier').length;
  const nDisponibles  = workers.filter(w => w.statut === 'disponible' || (w.statut === 'actif' && w.disponibilite === 'oui')).length;
  const tarifMoyen    = workers.length > 0 ? Math.round(workers.reduce((s, w) => s + Number(w.tarif || 0), 0) / workers.length) : 0;

  /* Detail view */
  if (view === 'detail' && detailWorker) {
    return (
      <>
        <Toast toast={toast} />
        <OuvrierDetail
          worker={detailWorker}
          onBack={() => { setView('list'); setDetail(null); }}
          onEdit={w => { setEditWorker(w); setShowModal(true); }}
          onDownloadPdf={handleDownloadPdf}
          pdfLoading={pdfLoadingId === detailWorker.id}
        />
        {showModal && (
          <OuvrierModal
            worker={editWorker}
            onClose={() => setShowModal(false)}
            onSave={handleSave}
            saving={saving}
            projects={projects}
          />
        )}
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      {showModal && (
        <OuvrierModal
          worker={editWorker}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          saving={saving}
          projects={projects}
        />
      )}

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Ouvriers</h1>
          <p className="page-subtitle">Gestion du personnel de chantier — {nTotal} ouvrier{nTotal > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Ajouter un ouvrier
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: 'var(--red)' }}><HardHat size={20} /></div>
          <div className="stat-body"><div className="stat-value">{nTotal}</div><div className="stat-label">Total ouvriers</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1976D2' }}><HardHat size={20} /></div>
          <div className="stat-body"><div className="stat-value">{nEnChantier}</div><div className="stat-label">En chantier</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#388E3C' }}><CheckCircle size={20} /></div>
          <div className="stat-body"><div className="stat-value">{nDisponibles}</div><div className="stat-label">Disponibles</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#F3E5F5', color: '#7B1FA2' }}><HardHat size={20} /></div>
          <div className="stat-body"><div className="stat-value">{fonctions.length}</div><div className="stat-label">Corps de metiers</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF3E0', color: '#E65100' }}><Clock size={20} /></div>
          <div className="stat-body"><div className="stat-value">{fmtMAD(tarifMoyen)}</div><div className="stat-label">Tarif moyen/jour</div></div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card ouv-filter-card">
        <div className="ouv-filter-bar">
          <div className="ouv-search-wrap">
            <Search size={14} className="ouv-search-icon" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, CIN, fonction, chantier..."
              className="ouv-search-input" />
          </div>
          <select value={filterStatut} onChange={e => setFStatut(e.target.value)} className="ouv-filter-select">
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterFonction} onChange={e => setFFonc(e.target.value)} className="ouv-filter-select">
            <option value="">Toutes fonctions</option>
            {fonctions.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {(search || filterStatut || filterFonction) && (
            <button className="btn btn-ghost btn-sm ouv-filter-clear" onClick={() => { setSearch(''); setFStatut(''); setFFonc(''); }}>
              <X size={13} /> Effacer
            </button>
          )}
          <div className="ouv-filter-count">{filtered.length} ouvrier{filtered.length > 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
            <Loader size={24} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
            <div style={{ fontSize: '0.85rem' }}>Chargement des ouvriers...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <HardHat size={40} style={{ color: 'var(--border)', marginBottom: 12 }} />
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>{workers.length === 0 ? 'Aucun ouvrier enregistre.' : 'Aucun resultat.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg)' }}>
                  {[
                    { label: 'Ouvrier',     field: 'nom' },
                    { label: 'CIN',         field: 'cin' },
                    { label: 'Telephone',   field: 'telephone' },
                    { label: 'Fonction',    field: 'fonction' },
                    { label: 'Specialite',  field: 'specialite' },
                    { label: 'Chantier',    field: 'chantier' },
                    { label: 'Tarif/jour',  field: 'tarif', align: 'right' },
                    { label: 'Statut',      field: 'statut' },
                    { label: 'Badge',       field: 'badge' },
                    { label: 'Actions',     field: null },
                  ].map(col => (
                    <th key={col.label} onClick={col.field ? () => toggleSort(col.field) : undefined}
                      style={{ padding: '10px 12px', textAlign: col.align || 'left', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap', cursor: col.field ? 'pointer' : 'default', userSelect: 'none' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {col.label}
                        {col.field && <ArrowUpDown size={11} style={{ opacity: sortField === col.field ? 1 : 0.35 }} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const cfg = STATUT_CFG[w.statut] || STATUT_CFG.actif;
                  return (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>

                      {/* Ouvrier */}
                      <td data-label="Ouvrier" style={{ padding: '10px 12px' }} onClick={() => { setDetail(w); setView('detail'); }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar worker={w} size={34} />
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.88rem' }}>{w.prenom} {w.nom}</div>
                            {w.date_recrutement && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Depuis {fmtDate(w.date_recrutement)}</div>}
                          </div>
                        </div>
                      </td>

                      {/* CIN */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.04em', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {w.cin_recto ? <CheckCircle size={11} style={{ color: '#388E3C' }} /> : null}
                          {w.cin || '—'}
                        </span>
                      </td>

                      {/* Tel */}
                      <td data-label="Tel" style={{ padding: '10px 12px', color: 'var(--text-2)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{w.telephone || '—'}</td>

                      {/* Fonction */}
                      <td data-label="Fonction" style={{ padding: '10px 12px' }}><span className="badge badge-blue">{w.fonction || '—'}</span></td>

                      {/* Specialite */}
                      <td data-label="Specialite" style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: '0.78rem', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.specialite || '—'}</td>

                      {/* Chantier */}
                      <td data-label="Chantier" style={{ padding: '10px 12px', color: 'var(--text-2)', fontSize: '0.82rem', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.chantier ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} style={{ flexShrink: 0 }} />{w.chantier}</span> : '—'}
                      </td>

                      {/* Tarif */}
                      <td data-label="Tarif/j" style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                        {fmtMAD(w.tarif)}
                      </td>

                      {/* Statut */}
                      <td data-label="Statut" style={{ padding: '10px 12px' }}><span className={'badge ' + cfg.cls}>{cfg.label}</span></td>

                      {/* Badge */}
                      <td style={{ padding: '10px 12px' }}>
                        {w.badge ? (
                          <span style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-3)', fontFamily: 'var(--font-head)', letterSpacing: '0.04em' }}>
                            <QrCode size={11} /> {w.badge}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button title="Voir fiche" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={() => { setDetail(w); setView('detail'); }}><Eye size={13} /></button>
                          <button title="Modifier" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={() => openEdit(w)}><Edit2 size={13} /></button>
                          <button title="Télécharger fiche" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}
                            disabled={pdfLoadingId === w.id}
                            onClick={(e) => { e.stopPropagation(); handleDownloadPdf(w); }}>
                            {pdfLoadingId === w.id ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Download size={13} />}
                          </button>
                          <button title="Supprimer" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px', color: 'var(--red)' }} onClick={() => del(w.id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
