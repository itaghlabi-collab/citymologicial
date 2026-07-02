/**
 * PurchaseRequestAttachments.jsx — Pièces jointes demande d'achat (détail)
 */
import { useState, useEffect, useCallback } from 'react';
import { Eye, Download, Trash2, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { UploadField } from './shared.jsx';
import {
  resolvePurchaseAttachments,
  formatPurchaseAttachmentType,
  stripAttachmentUrls,
} from '../../services/achats/purchaseStorage';
import { updatePurchaseRequestAttachments } from '../../services/achats/purchaseRequests';
import { formatFileSize } from '../../services/uploadService';

function attachmentIcon(type, name) {
  const label = formatPurchaseAttachmentType(type || name);
  if (label === 'Image') return <ImageIcon size={14} />;
  return <FileText size={14} />;
}

function fmtAddedAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function PurchaseRequestAttachments({
  request,
  canEdit,
  user,
  onUpdated,
  onError,
  refreshKey = 0,
}) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const userLabel = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || 'Utilisateur';

  const syncFromRequest = useCallback(async () => {
    if (!request?.id) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    try {
      const raw = request.payload?.attachments || [];
      const resolved = await resolvePurchaseAttachments(raw);
      setAttachments(resolved);
    } catch (err) {
      onError?.(err.message || 'Erreur chargement pièces jointes');
    } finally {
      setLoading(false);
    }
  }, [request?.id, onError]);

  useEffect(() => { syncFromRequest(); }, [syncFromRequest, refreshKey]);

  async function persist(nextRaw) {
    if (!request?.id) return;
    setSaving(true);
    onError?.('');
    try {
      const stored = stripAttachmentUrls(nextRaw);
      const updated = await updatePurchaseRequestAttachments(request.id, stored);
      const resolved = await resolvePurchaseAttachments(updated.payload?.attachments || []);
      setAttachments(resolved);
      onUpdated?.(updated, resolved);
    } catch (err) {
      onError?.(err.message || 'Erreur enregistrement pièce jointe');
      await syncFromRequest();
    } finally {
      setSaving(false);
    }
  }

  async function handleChange(next) {
    const list = Array.isArray(next) ? next : (next ? [next] : []);
    const enriched = list.map((a) => ({
      ...a,
      added_at: a.added_at || new Date().toISOString(),
      added_by_name: a.added_by_name || userLabel,
      added_by: a.added_by || user?.id || null,
    }));
    const preview = await resolvePurchaseAttachments(enriched);
    setAttachments(preview);
    await persist(enriched);
  }

  async function handleDelete(index) {
    if (!canEdit) return;
    if (!window.confirm('Voulez-vous supprimer cette pièce jointe ?')) return;
    await persist(attachments.filter((_, i) => i !== index));
  }

  const showSection = canEdit || attachments.length > 0;
  if (!showSection) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>
        Pièces jointes
      </div>

      {canEdit && (
        <div style={{ marginBottom: 12 }}>
          <UploadField
            label=""
            value={attachments}
            onChange={handleChange}
            scope="requests"
            scopeId={request.id}
            disabled={saving}
          />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.84rem' }}>
          <Loader2 size={16} className="cin-spin" /> Chargement…
        </div>
      ) : attachments.length === 0 ? (
        <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucune pièce jointe.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attachments.map((a, i) => (
            <div
              key={a.storage_path || `${a.name}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                background: 'var(--surface-2)',
                borderRadius: 8,
                fontSize: '0.82rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28 }}>
                {attachmentIcon(a.type, a.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.name || 'Fichier'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>
                  {formatPurchaseAttachmentType(a.type || a.name)}
                  {a.size ? ` · ${formatFileSize(a.size)}` : ''}
                  {' · '}{fmtAddedAt(a.added_at)}
                  {a.added_by_name ? ` · ${a.added_by_name}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {a.url ? (
                  <>
                    <a href={a.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Voir">
                      <Eye size={12} />
                    </a>
                    <a href={a.url} download={a.name || 'piece-jointe'} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Télécharger">
                      <Download size={12} />
                    </a>
                  </>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>—</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="Supprimer"
                    style={{ color: 'var(--red)' }}
                    disabled={saving}
                    onClick={() => handleDelete(i)}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {saving && (
        <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={12} className="cin-spin" /> Enregistrement…
        </div>
      )}
    </div>
  );
}
