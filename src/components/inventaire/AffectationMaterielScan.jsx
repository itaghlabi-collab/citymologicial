/**
 * AffectationMaterielScan.jsx — Affectation matériel chantier par scan
 */
import { useState, useEffect } from 'react';
import { MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { listStockArticles } from '../../services/inventaire/stockArticles';
import { listProjects } from '../../services/projects/projects';
import { executeArticleQuickAction } from '../../services/inventaire/articleQuickActions';
import { useArticleScanner } from '../../hooks/useArticleScanner';
import { useAuth } from '../../hooks/useAuth';
import ArticleScanBar from './ArticleScanBar.jsx';
import { EMPLACEMENTS_STOCK, INPUT_STYLE, SELECT_STYLE } from './shared.jsx';
import { articleScanLabel } from '../../services/inventaire/scanFeedback';

const CHANTIER_EMPLACEMENTS = EMPLACEMENTS_STOCK.filter((e) =>
  e.toUpperCase().includes('CHANTIER') || e.toUpperCase().includes('VILLA') || e.includes('LOGIPARC') || e.includes('ONDA'),
);

export default function AffectationMaterielScan() {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email || 'Magasinier';

  const [articles, setArticles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scannedArticle, setScannedArticle] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [destination, setDestination] = useState('');
  const [observation, setObservation] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    Promise.all([listStockArticles(), listProjects()])
      .then(([arts, projs]) => {
        setArticles(arts || []);
        setProjects(projs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const {
    handleScan,
    scanning,
    scanError,
    scanSuccess,
  } = useArticleScanner({
    articles,
    onFound: (article) => {
      setScannedArticle(article);
      setDoneMsg('');
      setFormError('');
    },
  });

  const selectedProject = projects.find((p) => String(p.id) === String(projectId));

  useEffect(() => {
    if (!selectedProject) return;
    const name = selectedProject.nom || selectedProject.name || '';
    const match = CHANTIER_EMPLACEMENTS.find((e) => e.toUpperCase().includes(name.toUpperCase().slice(0, 12)));
    if (match) setDestination(match);
  }, [selectedProject]);

  async function handleValidate() {
    setFormError('');
    setDoneMsg('');
    if (!scannedArticle) {
      setFormError('Scannez d\'abord un article.');
      return;
    }
    if (!destination.trim()) {
      setFormError('Sélectionnez un emplacement chantier.');
      return;
    }
    setSaving(true);
    try {
      await executeArticleQuickAction({
        article: scannedArticle,
        actionKey: 'affecter_chantier',
        destination: destination.trim(),
        observation: observation.trim() || (selectedProject ? `Affectation ${selectedProject.nom || selectedProject.name}` : ''),
        userName,
      });
      setDoneMsg(`✓ ${articleScanLabel(scannedArticle)} affecté au chantier`);
      setScannedArticle(null);
      setObservation('');
      const arts = await listStockArticles();
      setArticles(arts || []);
    } catch (err) {
      setFormError(err?.message || 'Erreur lors de l\'affectation.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
        <Loader2 size={24} className="cin-spin" style={{ margin: '0 auto 10px' }} />
        Chargement…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between finance-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">AFFECTATION MATÉRIEL</h1>
          <p className="page-subtitle">Scannez le matériel, sélectionnez le chantier et validez — sans ressaisir le code article.</p>
        </div>
      </div>

      <ArticleScanBar
        onScan={handleScan}
        loading={scanning}
        error={scanError}
        success={scanSuccess}
        label="Scanner le matériel"
        placeholder="Scannez le code-barres ou QR du matériel…"
      />

      {scannedArticle && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 16, border: '1px solid #A5D6A7', background: '#F1F8E9' }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Article scanné</div>
          <div style={{ fontSize: '0.92rem' }}>{articleScanLabel(scannedArticle)}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4 }}>
            Stock actuel : {scannedArticle.stock_actuel ?? 0} {scannedArticle.unite || 'U'}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Projet / chantier</div>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={SELECT_STYLE}>
              <option value="">— Sélectionner le projet —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ` : ''}{p.nom || p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Emplacement chantier</div>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={SELECT_STYLE}>
              <option value="">— Emplacement —</option>
              {(CHANTIER_EMPLACEMENTS.length ? CHANTIER_EMPLACEMENTS : EMPLACEMENTS_STOCK).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Observation (optionnel)</div>
            <input value={observation} onChange={(e) => setObservation(e.target.value)} style={INPUT_STYLE} placeholder="Remarque affectation…" />
          </div>
        </div>

        {formError && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.86rem', fontWeight: 600 }}>{formError}</div>}
        {doneMsg && <div style={{ marginTop: 12, color: '#2E7D32', fontSize: '0.86rem', fontWeight: 600 }}>{doneMsg}</div>}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !scannedArticle}
            onClick={handleValidate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 200, justifyContent: 'center' }}
          >
            {saving ? <Loader2 size={15} className="cin-spin" /> : <MapPin size={15} />}
            Valider l&apos;affectation
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '14px 16px', fontSize: '0.82rem', color: 'var(--text-3)' }}>
        <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: '#2E7D32' }} />
        L&apos;affectation crée un mouvement de transfert validé, met à jour l&apos;emplacement de l&apos;article et historise l&apos;opération avec votre compte utilisateur.
      </div>
    </div>
  );
}
