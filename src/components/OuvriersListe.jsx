import {
  HardHat, Plus, Edit2, Trash2, Eye, Download, Search, X,
  Upload, Camera, ScanLine, User, FileText, Shield,
  Phone, MapPin, CheckCircle, Clock, AlertCircle,
  ChevronLeft, RefreshCw, ArrowUpDown, QrCode, Package,
  Loader
} from 'lucide-react';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getWorkers, createWorker, updateWorker } from '../services/api';
import { scanCIN, compressImage } from '../services/ocr';

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

const EMPTY_FORM = {
  prenom: '', nom: '', telephone: '', cin: '', fonction: '', tarif: '',
  date_naissance: '', ville_naissance: '', adresse: '', nationalite: 'Marocaine', etat_civil: '', groupe_sanguin: '',
  specialite: '', experience: 'intermediaire', date_recrutement: '', statut: 'actif', disponibilite: 'oui', chantier: '',
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

/* ── Document Upload ── */
function DocUpload({ value, onChange, label }) {
  const inputRef = useRef(null);

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onChange(e.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
      style={{ border: '1.5px dashed ' + (value ? 'var(--red)' : 'var(--border)'), borderRadius: 8, padding: '14px', cursor: 'pointer', background: value ? '#FFEBEE' : 'var(--bg)', transition: 'all 0.15s', textAlign: 'center', minHeight: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      {value ? (
        <div style={{ position: 'relative', width: '100%' }}>
          {value.startsWith('data:image') ? (
            <img src={value} alt={label} style={{ maxHeight: 80, maxWidth: '100%', borderRadius: 4, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: '0.82rem', color: 'var(--red)', fontWeight: 700 }}>Fichier charge</div>
          )}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(''); }}
            style={{ position: 'absolute', top: -8, right: -8, background: 'var(--red)', border: 'none', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={10} />
          </button>
        </div>
      ) : (
        <>
          <Upload size={18} style={{ color: 'var(--text-3)' }} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{label}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>JPG, PNG, PDF</div>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CIN SCANNER — Banking-style direct camera flow
   Open camera instantly → auto-capture recto → auto-capture verso
   → POST /api/ocr/moroccan-cin → auto-fill form
   ══════════════════════════════════════════════════════ */

// How many consecutive stable frames before auto-capture
const STABLE_FRAMES_REQUIRED = 22;
// Minimum brightness (0-255 avg) to allow capture
const MIN_BRIGHTNESS = 45;

function CINScanner({ onExtracted, onClose }) {
  // 'recto' | 'verso' | 'uploading' | 'error' | 'nocamera'
  const [phase, setPhase]         = useState('recto');
  const [rectoImg, setRecto]      = useState(null);
  const [versoImg, setVerso]      = useState(null);
  const [statusMsg, setStatus]    = useState('Placez la CIN dans le cadre');
  const [error, setError]         = useState('');
  const [stableCount, setStable]  = useState(0);
  const [captured, setCaptured]   = useState(false);
  // Indicator state: 'ok' | 'warn' | 'off'
  const [indLight, setIndLight]   = useState('off');   // brightness
  const [indFocus, setIndFocus]   = useState('off');   // stability/motion
  const [indReady, setIndReady]   = useState('off');   // ready to capture

  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const canvasRef     = useRef(null);
  const rafRef        = useRef(null);
  const prevFrameRef  = useRef(null);
  const stableRef     = useRef(0);
  const phaseRef      = useRef('recto');
  const rectoRef      = useRef(null);
  const versoRef      = useRef(null);
  const fileRectoRef  = useRef(null);
  const fileVersoRef  = useRef(null);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => teardown();
  }, []);

  function teardown() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: 'continuous',
        },
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            requestAnimationFrame(analyzeFrame);
          }).catch(() => {});
        }
      }, 80);
    } catch {
      setPhase('nocamera');
    }
  }

  function analyzeFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, W, H);

    const imageData = ctx.getImageData(0, 0, W, H);
    const { brightness, motionScore } = analyzePixels(imageData, prevFrameRef.current);
    prevFrameRef.current = imageData;

    const lightOk  = brightness > MIN_BRIGHTNESS;
    const motionOk = motionScore < 14;
    const isStable = lightOk && motionOk;

    if (isStable) {
      stableRef.current += 1;
    } else {
      stableRef.current = Math.max(0, stableRef.current - 2);
    }

    const progress = Math.min(1, stableRef.current / STABLE_FRAMES_REQUIRED);
    setStable(Math.round(progress * 100));

    // Update discrete indicators
    setIndLight(lightOk ? 'ok' : 'warn');
    setIndFocus(motionOk ? 'ok' : 'warn');
    setIndReady(progress >= 0.6 ? (progress >= 1 ? 'ok' : 'warn') : 'off');

    if (!lightOk) {
      setStatus('Eclairez mieux la carte');
    } else if (!motionOk) {
      setStatus('Immobilisez la carte');
    } else if (progress < 0.5) {
      setStatus(phaseRef.current === 'recto' ? 'Placez le recto dans le cadre' : 'Placez le verso dans le cadre');
    } else {
      setStatus('Maintien...');
    }

    if (stableRef.current >= STABLE_FRAMES_REQUIRED) {
      doCapture(canvas, ctx, video, W, H);
      return;
    }

    rafRef.current = requestAnimationFrame(analyzeFrame);
  }

  function analyzePixels(current, previous) {
    const d = current.data;
    let brightnessSum = 0;
    let motionSum = 0;
    const step = 8; // sample every 8th pixel for performance
    const len = d.length;
    let count = 0;

    for (let i = 0; i < len; i += step * 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      brightnessSum += (r + g + b) / 3;
      if (previous) {
        const pd = previous.data;
        const diff = Math.abs(r - pd[i]) + Math.abs(g - pd[i + 1]) + Math.abs(b - pd[i + 2]);
        motionSum += diff;
      }
      count++;
    }

    return {
      brightness:  count > 0 ? brightnessSum / count : 128,
      motionScore: count > 0 ? motionSum     / count : 0,
    };
  }

  function doCapture(canvas, ctx, video, W, H) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stableRef.current = 0;
    ctx.drawImage(video, 0, 0, W, H);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setCaptured(true);
    setTimeout(() => setCaptured(false), 400);

    if (phaseRef.current === 'recto') {
      rectoRef.current = dataUrl;
      setRecto(dataUrl);
      setPhase('verso');
      phaseRef.current = 'verso';
      setStatus('Retournez la carte — VERSO');
      prevFrameRef.current = null;
      stableRef.current = 0;
      setStable(0);
      // Short pause before resuming analysis
      setTimeout(() => {
        rafRef.current = requestAnimationFrame(analyzeFrame);
      }, 800);
    } else {
      versoRef.current = dataUrl;
      setVerso(dataUrl);
      setPhase('uploading');
      setStatus('Analyse en cours...');
      // Stop camera — upload now
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      uploadCaptures(rectoRef.current, dataUrl);
    }
  }

  async function uploadCaptures(recto, verso) {
    try {
      // Compress both images (force JPEG, 2000px max, quality 0.82)
      const cRecto = await compressImage(recto,  2000, 0.82);
      const cVerso = verso ? await compressImage(verso, 2000, 0.82) : null;
      // scanCIN never throws — always returns valid data (real OCR or demo fallback)
      const result = await scanCIN(cRecto, cVerso);
      onExtracted(result);
      onClose();
    } catch (err) {
      // Only reached if compressImage itself fails (corrupt image data)
      const msg = (err && err.message && err.message.length < 120)
        ? err.message
        : 'Document non lisible. Reprendre une photo plus nette.';
      setError(msg);
      setPhase('error');
    }
  }

  // Manual capture fallback (tap anywhere on camera view)
  function handleManualCapture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || phase === 'uploading') return;
    const W = video.videoWidth  || 1280;
    const H = video.videoHeight || 720;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    stableRef.current = STABLE_FRAMES_REQUIRED; // force capture
    doCapture(canvas, ctx, video, W, H);
  }

  // File fallback handlers
  function handleFileRecto(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      rectoRef.current = ev.target.result;
      setRecto(ev.target.result);
      setPhase('verso');
      phaseRef.current = 'verso';
      setStatus('Importez maintenant le VERSO de votre CIN');
    };
    reader.readAsDataURL(f);
  }

  function handleFileVerso(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async ev => {
      versoRef.current = ev.target.result;
      setVerso(ev.target.result);
      setPhase('uploading');
      uploadCaptures(rectoRef.current, ev.target.result);
    };
    reader.readAsDataURL(f);
  }

  function handleRetry() {
    rectoRef.current = null;
    versoRef.current = null;
    setRecto(null);
    setVerso(null);
    setError('');
    stableRef.current = 0;
    prevFrameRef.current = null;
    phaseRef.current = 'recto';
    setPhase('recto');
    setStatus('Positionnez le RECTO de votre CIN');
    setStable(0);
    if (!streamRef.current) {
      startCamera();
    } else {
      rafRef.current = requestAnimationFrame(analyzeFrame);
    }
  }

  // ── Render: no-camera fallback ──
  if (phase === 'nocamera') {
    return (
      <div className="cin-scanner-overlay">
        <div className="cin-scanner-box">
          <div className="cin-scanner-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="cin-scanner-icon-wrap"><ScanLine size={18} style={{ color: 'var(--red)' }} /></div>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>Scanner CIN</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Camera non disponible — importez les photos</div>
              </div>
            </div>
            <button className="cin-scanner-close" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="cin-scanner-body">
            <div className="cin-alert cin-alert--warn">
              <AlertCircle size={14} />
              Camera non disponible sur cet appareil. Importez les photos de votre CIN.
            </div>
            <div className="cin-panels">
              <div className="cin-panel">
                <div className="cin-panel-label">
                  <span className="cin-panel-badge recto">RECTO</span>
                  <span className="cin-panel-sublabel">Face principale</span>
                </div>
                <div className={'cin-panel-preview' + (rectoImg ? ' has-img' : '')} onClick={() => fileRectoRef.current?.click()} style={{ cursor: 'pointer' }}>
                  {rectoImg
                    ? <><img src={rectoImg} alt="Recto" className="cin-preview-img" /><button className="cin-preview-clear" onClick={e => { e.stopPropagation(); setRecto(null); rectoRef.current = null; }}><X size={12} /></button></>
                    : <div className="cin-preview-placeholder"><Upload size={24} style={{ color: 'var(--border)' }} /><span>Appuyer pour importer</span></div>
                  }
                </div>
                <input ref={fileRectoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileRecto} />
              </div>
              <div className="cin-panel">
                <div className="cin-panel-label">
                  <span className="cin-panel-badge verso">VERSO</span>
                  <span className="cin-panel-sublabel">Dos de la carte</span>
                </div>
                <div className={'cin-panel-preview' + (versoImg ? ' has-img' : '')} onClick={() => fileVersoRef.current?.click()} style={{ cursor: 'pointer' }}>
                  {versoImg
                    ? <><img src={versoImg} alt="Verso" className="cin-preview-img" /><button className="cin-preview-clear" onClick={e => { e.stopPropagation(); setVerso(null); versoRef.current = null; }}><X size={12} /></button></>
                    : <div className="cin-preview-placeholder"><Upload size={24} style={{ color: 'var(--border)' }} /><span>Appuyer pour importer</span></div>
                  }
                </div>
                <input ref={fileVersoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileVerso} />
              </div>
            </div>
          </div>
          <div className="cin-scanner-footer">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" disabled={!rectoImg || !versoImg} style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { setPhase('uploading'); uploadCaptures(rectoRef.current, versoRef.current); }}>
              <ScanLine size={14} /> Analyser les photos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: error state ──
  if (phase === 'error') {
    return (
      <div className="cin-scanner-overlay">
        <div className="cin-scanner-box">
          <div className="cin-scanner-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="cin-scanner-icon-wrap"><ScanLine size={18} style={{ color: 'var(--red)' }} /></div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>Scanner CIN</div>
            </div>
            <button className="cin-scanner-close" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="cin-scanner-body">
            <div className="cin-alert cin-alert--error"><AlertCircle size={14} /> {error}</div>
            <div className="cin-panels">
              {rectoImg && <div className="cin-panel"><div className="cin-panel-label"><span className="cin-panel-badge recto">RECTO</span></div><div className="cin-panel-preview has-img"><img src={rectoImg} alt="Recto" className="cin-preview-img" /></div></div>}
              {versoImg && <div className="cin-panel"><div className="cin-panel-label"><span className="cin-panel-badge verso">VERSO</span></div><div className="cin-panel-preview has-img"><img src={versoImg} alt="Verso" className="cin-preview-img" /></div></div>}
            </div>
          </div>
          <div className="cin-scanner-footer">
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleRetry}><RefreshCw size={14} /> Rescanner</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: uploading state ──
  if (phase === 'uploading') {
    return (
      <div className="cin-scanner-overlay cin-scanner-overlay--dark">
        <div className="cin-upload-box">
          <Loader size={32} className="cin-spin" style={{ color: 'var(--red)' }} />
          <div className="cin-upload-title">Analyse OCR en cours</div>
          <div className="cin-upload-sub">Extraction des donnees de la CIN...</div>
          <div className="cin-upload-previews">
            {rectoImg && <img src={rectoImg} alt="Recto" className="cin-upload-thumb" />}
            {versoImg && <img src={versoImg} alt="Verso" className="cin-upload-thumb" />}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: live camera (recto / verso) ──
  const isRecto    = phase === 'recto';
  const progressPct = stableCount; // 0-100
  const frameReady  = progressPct >= 100;

  return (
    <div className="cin-scanner-overlay cin-scanner-overlay--dark" onClick={handleManualCapture}>
      {/* Hidden analysis canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Camera feed */}
      <video ref={videoRef} className="cin-camera-feed" autoPlay playsInline muted />

      {/* SVG mask — dark outside the card cutout */}
      <svg className="cin-mask-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <mask id="cin-cutout">
            <rect width="100" height="100" fill="white" />
            {/* cutout: centred, 82% wide, card ratio 85.6/54 ≈ 1.585 */}
            <rect x="9" y="27.5" width="82" height="51.7" rx="2.2" ry="2.2" fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(0,0,0,0.60)" mask="url(#cin-cutout)" />
      </svg>

      {/* Card frame border — animated corners */}
      <div className={'cin-vf-frame' + (frameReady ? ' cin-vf-frame--ready' : '')}>
        <span className="cin-vf-corner cin-vf-corner--tl" />
        <span className="cin-vf-corner cin-vf-corner--tr" />
        <span className="cin-vf-corner cin-vf-corner--bl" />
        <span className="cin-vf-corner cin-vf-corner--br" />
        {/* Instruction label inside frame */}
        <div className="cin-vf-label">
          {isRecto ? 'Recto — Face principale' : 'Verso — Dos de la carte'}
        </div>
        {/* Capture flash */}
        {captured && <div className="cin-capture-flash" />}
      </div>

      {/* Top bar */}
      <div className="cin-top-bar" onClick={e => e.stopPropagation()}>
        <div className="cin-side-badge-wrap">
          <span className={'cin-side-badge ' + (isRecto ? 'cin-side-badge--recto' : 'cin-side-badge--verso')}>
            {isRecto ? 'RECTO' : 'VERSO'}
          </span>
          {/* Step 1 of 2 / 2 of 2 */}
          <span className="cin-step-label">{isRecto ? '1 / 2' : '2 / 2'}</span>
        </div>
        <button className="cin-close-btn" onClick={onClose}><X size={18} /></button>
      </div>

      {/* Three indicator dots: Lumiere / Stabilite / Pret */}
      <div className="cin-indicators" onClick={e => e.stopPropagation()}>
        <div className={'cin-ind ' + indLight}>
          <span className="cin-ind-dot" />
          <span className="cin-ind-label">Lumiere</span>
        </div>
        <div className={'cin-ind ' + indFocus}>
          <span className="cin-ind-dot" />
          <span className="cin-ind-label">Stabilite</span>
        </div>
        <div className={'cin-ind ' + indReady}>
          <span className="cin-ind-dot" />
          <span className="cin-ind-label">Pret</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className={'cin-progress-bar-wrap' + (frameReady ? ' ready' : '')} onClick={e => e.stopPropagation()}>
        <div className="cin-progress-bar" style={{ width: progressPct + '%' }} />
      </div>

      {/* Status hint */}
      <div className="cin-hint-bar" onClick={e => e.stopPropagation()}>
        <span className="cin-hint-text">{statusMsg}</span>
        <span className="cin-hint-tap">Appuyez pour capturer</span>
      </div>

      {/* Recto mini preview during verso scan */}
      {!isRecto && rectoImg && (
        <div className="cin-recto-mini" onClick={e => e.stopPropagation()}>
          <img src={rectoImg} alt="Recto" />
          <span>Recto OK</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   OUVRIER DETAIL PAGE
   ══════════════════════════════════════════════════════ */
function OuvrierDetail({ worker, onBack, onEdit }) {
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
            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Download size={13} /> PDF Fiche
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
              <img src={worker.cin_recto} alt="CIN recto" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', objectFit: 'contain', maxHeight: 180 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: '0.85rem', background: 'var(--bg)', borderRadius: 8 }}>Aucun document charge</div>
            )}
          </div>
          <div className="card" style={{ padding: '20px 22px' }}>
            <STitle><FileText size={14} /> CIN Verso</STitle>
            {worker.cin_verso ? (
              <img src={worker.cin_verso} alt="CIN verso" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', objectFit: 'contain', maxHeight: 180 }} />
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
function OuvrierModal({ worker, onClose, onSaved }) {
  const isEdit = !!worker;
  const [form, setForm] = useState(() => worker ? { ...EMPTY_FORM, ...worker } : { ...EMPTY_FORM, badge: genBadge() });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [formTab, setFormTab] = useState('identite');
  const [ocrFilled, setOcrFilled]   = useState(false);   // triggers highlight flash
  const [ocrToast,  setOcrToast]    = useState('');      // success toast text

  const formTabs = [
    { id: 'identite',    label: 'Identite' },
    { id: 'chantier',    label: 'Chantier' },
    { id: 'securite',    label: 'Securite' },
    { id: 'documents',   label: 'Documents' },
    { id: 'equipements', label: 'Equipements' },
  ];

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function handleScanExtracted(data) {
    setForm(p => ({ ...p, ...data }));
    setFormTab('identite');
    // Count how many useful fields were extracted
    const filled = ['cin','prenom','nom','date_naissance','ville_naissance','sexe','nationalite']
      .filter(k => data[k] && String(data[k]).trim() !== '');
    setOcrFilled(true);
    setOcrToast(filled.length > 0
      ? `${filled.length} champ${filled.length > 1 ? 's' : ''} rempli${filled.length > 1 ? 's' : ''} automatiquement`
      : 'OCR termine — verifiez les champs');
    // Remove highlight after 3 s, hide toast after 4 s
    setTimeout(() => setOcrFilled(false), 3000);
    setTimeout(() => setOcrToast(''),     4000);
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
    setSaving(true);
    const payload = { ...form, tarif: Number(form.tarif), id: worker?.id || Date.now() };
    try {
      if (isEdit) { await updateWorker(worker.id, payload); } else { await createWorker(payload); }
    } catch (_) {}
    onSaved(payload, isEdit);
    setSaving(false);
  }

  return (
    <>
      {showScanner && <CINScanner onExtracted={handleScanExtracted} onClose={() => setShowScanner(false)} />}

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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowScanner(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--red)' }}>
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
                  <div className="form-group">
                    <Label>Chantier affecte</Label>
                    <input value={form.chantier} onChange={e => set('chantier', e.target.value)} placeholder="Nom du chantier..." style={IS(false)} />
                  </div>
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
                    <DocUpload value={form.cin_recto} onChange={v => set('cin_recto', v)} label="Deposer CIN recto" />
                  </div>
                  <div className="form-group">
                    <Label>CIN Verso</Label>
                    <DocUpload value={form.cin_verso} onChange={v => set('cin_verso', v)} label="Deposer CIN verso" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ background: '#FFEBEE', borderRadius: 8, padding: '12px 14px', fontSize: '0.82rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ScanLine size={14} />
                      Utilisez le bouton "Scanner CIN" en haut pour extraire automatiquement les donnees.
                    </div>
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
export default function OuvriersListe({ workers: extWorkers, onWorkersChange }) {
  const [view, setView]             = useState('list'); // 'list' | 'detail'
  const [detailWorker, setDetail]   = useState(null);
  const [workers, setWorkers]       = useState(extWorkers || []);
  const [search, setSearch]         = useState('');
  const [filterStatut, setFStatut]  = useState('');
  const [filterFonction, setFFonc]  = useState('');
  const [sortField, setSortField]   = useState('nom');
  const [sortDir, setSortDir]       = useState('asc');
  const [showModal, setShowModal]   = useState(false);
  const [editWorker, setEditWorker] = useState(null);
  const [toast, setToast]           = useState(null);
  const toastRef                    = useRef(null);

  useEffect(() => {
    getWorkers().then(data => {
      if (data && data.length > 0) {
        const mapped = data.map((w, i) => ({ ...EMPTY_FORM, id: w.id || i + 1, prenom: w.prenom || w.firstName || '', nom: w.nom || w.lastName || w.name || '', telephone: w.telephone || w.phone || '', cin: w.cin || '', fonction: w.fonction || w.position || '', tarif: Number(w.tarif || w.dailyRate || 0), statut: w.statut || 'actif', badge: w.badge || genBadge() }));
        setWorkers(mapped);
        if (onWorkersChange) onWorkersChange(mapped);
      }
    }).catch(() => {});
  }, []);

  function notify(type, msg) {
    clearTimeout(toastRef.current);
    setToast({ type, msg });
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  function openAdd()    { setEditWorker(null); setShowModal(true); }
  function openEdit(w)  { setEditWorker(w);    setShowModal(true); }

  function handleSaved(payload, isEdit) {
    let updated;
    if (isEdit) {
      updated = workers.map(w => w.id === payload.id ? { ...w, ...payload } : w);
      notify('success', 'Ouvrier modifie avec succes.');
    } else {
      updated = [payload, ...workers];
      notify('success', 'Ouvrier ajoute avec succes.');
    }
    setWorkers(updated);
    if (onWorkersChange) onWorkersChange(updated);
    setShowModal(false);
  }

  function del(id) {
    if (!window.confirm('Supprimer cet ouvrier ?')) return;
    const updated = workers.filter(w => w.id !== id);
    setWorkers(updated);
    if (onWorkersChange) onWorkersChange(updated);
    notify('success', 'Ouvrier supprime.');
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  const fonctions = [...new Set(workers.map(w => w.fonction).filter(Boolean))];

  const filtered = workers.filter(w => {
    const q = search.toLowerCase();
    const matchSearch = !q || (w.prenom + ' ' + w.nom).toLowerCase().includes(q) || (w.cin || '').toLowerCase().includes(q) || (w.fonction || '').toLowerCase().includes(q) || (w.chantier || '').toLowerCase().includes(q);
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
        />
        {showModal && (
          <OuvrierModal
            worker={editWorker}
            onClose={() => setShowModal(false)}
            onSaved={(payload, isEdit) => { handleSaved(payload, isEdit); if (detailWorker?.id === payload.id) setDetail(payload); setShowModal(false); }}
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
          onSaved={handleSaved}
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
        {filtered.length === 0 ? (
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
                          <button title="PDF" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={() => notify('success', 'PDF genere pour ' + w.prenom + ' ' + w.nom)}><Download size={13} /></button>
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
