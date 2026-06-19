/**
 * BarcodeModal.jsx — Voir / télécharger / imprimer étiquette compacte
 */
import { Barcode, Download, Printer } from 'lucide-react';
import { Modal } from './shared.jsx';
import BarcodeDisplay from './BarcodeDisplay';
import { getArticleBarcodeValue } from '../../services/inventaire/barcodeUtils';
import {
  downloadStockArticleLabel,
  printStockArticleLabel,
  downloadStockArticleLabelsA4,
  LABEL_FORMATS,
} from '../../services/inventaire/stockArticleLabelPdf';

export default function BarcodeModal({ open, article, onClose }) {
  if (!open || !article) return null;
  const code = getArticleBarcodeValue(article);
  const designation = article.designation || article.nom || '—';

  return (
    <Modal open={open} onClose={onClose} title="Étiquette article" width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '4px 0' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '14px 12px 10px',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 10, lineHeight: 1.25 }}>
            {designation}
          </div>
          <BarcodeDisplay article={article} height={72} width={2.4} displayValue={false} />
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.9rem', marginTop: 8, letterSpacing: '0.06em' }}>
            {code}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadStockArticleLabel(article, 'small')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> {LABEL_FORMATS.small.name}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadStockArticleLabel(article, 'standard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> {LABEL_FORMATS.standard.name}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => printStockArticleLabel(article, 'standard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} /> Imprimer
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => downloadStockArticleLabelsA4([article], 'standard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> Planche A4
          </button>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
          <Barcode size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
          CODE128 — {code}
        </p>
      </div>
    </Modal>
  );
}
