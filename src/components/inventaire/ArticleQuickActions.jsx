/**
 * ArticleQuickActions.jsx — Actions rapides depuis la fiche article
 */
import { useState } from 'react';
import {
  MapPin, Warehouse, ArrowRightLeft, Wrench, RotateCcw,
  Ban, AlertTriangle, Loader2, History,
} from 'lucide-react';
import { Modal, SELECT_STYLE, TEXTAREA_STYLE, EMPLACEMENTS_STOCK } from './shared.jsx';
import { QUICK_ACTIONS, executeArticleQuickAction, canExecuteStockAction, getArticleStockQty } from '../../services/inventaire/articleQuickActions';

const ACTION_ICONS = {
  affecter_chantier: MapPin,
  retour_depot: Warehouse,
  transferer: ArrowRightLeft,
  envoyer_reparation: Wrench,
  retour_reparation: RotateCcw,
  hors_service: Ban,
  perdu: AlertTriangle,
};

const CHANTIER_EMPLACEMENTS = EMPLACEMENTS_STOCK.filter((e) =>
  e.toUpperCase().includes('CHANTIER') || e.toUpperCase().includes('VILLA') || e.includes('LOGIPARC') || e.includes('ONDA'),
);

const DEPOT_EMPLACEMENTS = EMPLACEMENTS_STOCK.filter((e) =>
  e.toUpperCase().includes('DEPOT') || e.toUpperCase().includes('ATELIER') || e.includes('BUREAU'),
);

function destinationOptions(actionKey) {
  if (actionKey === 'affecter_chantier') return CHANTIER_EMPLACEMENTS.length ? CHANTIER_EMPLACEMENTS : EMPLACEMENTS_STOCK;
  if (actionKey === 'retour_depot' || actionKey === 'retour_reparation') {
    return DEPOT_EMPLACEMENTS.length ? DEPOT_EMPLACEMENTS : EMPLACEMENTS_STOCK;
  }
  if (actionKey === 'envoyer_reparation') {
    return EMPLACEMENTS_STOCK.filter((e) => e.toUpperCase().includes('SAV') || e.toUpperCase().includes('ATELIER'));
  }
  return EMPLACEMENTS_STOCK;
}

export default function ArticleQuickActions({ article, userName, onDone, disabled, onHistory }) {
  const [pending, setPending] = useState(null);
  const [destination, setDestination] = useState('');
  const [observation, setObservation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const config = pending ? QUICK_ACTIONS[pending] : null;
  const actionsBlocked = disabled || !canExecuteStockAction(article);

  function openAction(key) {
    if (actionsBlocked) return;
    const cfg = QUICK_ACTIONS[key];
    setPending(key);
    setError('');
    setObservation('');
    setDestination(cfg?.defaultDest || article?.emplacement || '');
  }

  async function confirmAction() {
    if (!pending || actionsBlocked) return;
    setSaving(true);
    setError('');
    try {
      await executeArticleQuickAction({
        article,
        actionKey: pending,
        destination,
        observation,
        userName,
      });
      setPending(null);
      onDone?.();
    } catch (err) {
      setError(err?.message || 'Erreur lors de l\'action.');
    } finally {
      setSaving(false);
    }
  }

  const stockQty = getArticleStockQty(article);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Actions rapides
      </div>
      {stockQty <= 0 && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 8,
          background: '#FFEBEE', color: '#C62828', fontSize: '0.82rem', lineHeight: 1.45,
        }}
        >
          Stock à <strong>0 {article?.unite || 'U'}</strong> — aucune affectation, transfert ou mouvement n&apos;est autorisé.
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(QUICK_ACTIONS).map(([key, cfg]) => {
          const Icon = ACTION_ICONS[key] || ArrowRightLeft;
          return (
            <button
              key={key}
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={actionsBlocked || saving}
              onClick={() => openAction(key)}
              title={actionsBlocked ? 'Stock insuffisant' : cfg.label}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: actionsBlocked ? 0.45 : 1 }}
            >
              <Icon size={13} /> {cfg.label}
            </button>
          );
        })}
        {onHistory && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onHistory}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <History size={13} /> Voir historique
          </button>
        )}
      </div>

      <Modal
        open={!!pending}
        onClose={() => { if (!saving) setPending(null); }}
        title={config?.label || 'Action'}
        width={480}
      >
        {config && (
          <div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', marginTop: 0 }}>
              Article <strong>{article?.code}</strong> — emplacement actuel : <strong>{article?.emplacement || '—'}</strong>
            </p>
            {config.needsDest && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Destination
                </label>
                <select value={destination} onChange={(e) => setDestination(e.target.value)} style={SELECT_STYLE}>
                  <option value="">— Sélectionner —</option>
                  {destinationOptions(pending).map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
                Observation (optionnel)
              </label>
              <textarea
                rows={3}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Remarque, chantier, responsable…"
                style={TEXTAREA_STYLE}
              />
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending(null)} disabled={saving}>Annuler</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmAction} disabled={saving}>
                {saving ? <Loader2 size={14} className="cin-spin" /> : null}
                Confirmer — créer mouvement
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function ArticleMovementHistory({ movements, loading, compact = false }) {
  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={18} className="cin-spin" /></div>;
  }
  if (!movements?.length) {
    return <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: 0 }}>Aucun mouvement enregistré.</p>;
  }
  const rows = compact ? movements.slice(0, 10) : movements;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Utilisateur</th>
            <th>Action</th>
            <th>Origine</th>
            <th>Destination</th>
            <th>Observation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td style={{ fontSize: '0.8rem' }}>{m.date_label || m.date || '—'}</td>
              <td style={{ fontSize: '0.8rem' }}>{m.utilisateur || '—'}</td>
              <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{m.action || m.motif || m.type}</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{m.origine || '—'}</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{m.destination || '—'}</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{m.observation || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
