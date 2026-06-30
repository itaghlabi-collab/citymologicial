/**
 * PublicSharePage.jsx — Page publique /share/:token
 */
import { useState, useEffect } from 'react';
import { Link, Lock, FileText, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { fetchPublicLinkMeta, verifyPublicLinkAccess } from '../../services/documents/documentPublicLinks';

const ERROR_LABELS = {
  not_found: 'Ce lien public est introuvable.',
  disabled: 'Ce lien a été désactivé.',
  expired: 'Ce lien a expiré.',
  used: 'Ce lien à accès unique a déjà été utilisé.',
  bad_password: 'Mot de passe incorrect.',
};

export default function PublicSharePage({ token }) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchPublicLinkMeta(token);
        if (cancelled) return;
        if (data?.error) {
          setError(ERROR_LABELS[data.error] || 'Lien indisponible.');
          setMeta(data);
        } else if (!data?.has_password) {
          const result = await verifyPublicLinkAccess(token);
          if (!cancelled) {
            if (result?.error) setError(ERROR_LABELS[result.error] || 'Lien indisponible.');
            else { setMeta(result); setVerified(true); }
          }
        } else {
          setMeta(data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Impossible de charger le lien.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleUnlock(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await verifyPublicLinkAccess(token, password);
      if (result?.error) {
        setError(ERROR_LABELS[result.error] || 'Accès refusé.');
      } else {
        setMeta(result);
        setVerified(true);
      }
    } catch (err) {
      setError(err.message || 'Erreur de vérification.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-1, #f5f5f5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <img src="https://i.ibb.co/1tszCjBk/CITYMO-LOGO-2.png" alt="CITYMO" style={{ height: 28 }} />
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-3)' }}>Partage sécurisé</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={20} className="spin" /> Chargement du lien...
          </div>
        ) : error && !verified ? (
          <div style={{ textAlign: 'center', padding: '20px 8px' }}>
            <AlertTriangle size={36} style={{ color: 'var(--red)', marginBottom: 12 }} />
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{error}</div>
            <a href="/" style={{ fontSize: '0.84rem', color: 'var(--red)' }}>Retour à CITYMO APP</a>
          </div>
        ) : verified ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <CheckCircle2 size={22} style={{ color: '#2E7D32' }} />
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Accès autorisé</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--surface-2)', borderRadius: 10, marginBottom: 16 }}>
              <FileText size={24} style={{ color: 'var(--red)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700 }}>{meta?.document}</div>
                {meta?.departement && <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 2 }}>{meta.departement}</div>}
              </div>
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
              {meta?.lecture_seule ? 'Mode lecture seule.' : 'Consultation autorisée.'}
              {meta?.telechargement ? ' Téléchargement autorisé.' : ' Téléchargement non autorisé.'}
            </div>
            {meta?.expiration && (
              <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-3)' }}>
                Expire le {meta.expiration}
              </div>
            )}
            <div style={{ marginTop: 20, padding: 12, background: '#E3F2FD', borderRadius: 8, fontSize: '0.8rem', color: '#1565C0' }}>
              Connectez-vous à CITYMO APP avec vos identifiants pour télécharger le fichier depuis Mes documents.
            </div>
          </div>
        ) : meta?.has_password ? (
          <form onSubmit={handleUnlock}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Lock size={18} style={{ color: 'var(--red)' }} />
              <div style={{ fontWeight: 700 }}>{meta.document}</div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', marginBottom: 16 }}>
              Ce document est protégé par mot de passe.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe du lien"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 6, marginBottom: 12, boxSizing: 'border-box' }}
              required
            />
            {error && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 12 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {submitting ? <Loader2 size={14} className="spin" /> : <Link size={14} />} Accéder au document
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
