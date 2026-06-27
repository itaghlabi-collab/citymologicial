/**
 * ArticleScanBar.jsx — Zone scan douchette / QR (agit comme clavier + Entrée)
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { INPUT_STYLE } from './shared.jsx';
import { parseScannedArticleCode } from '../../services/inventaire/barcodeUtils';

export default function ArticleScanBar({
  onScan,
  loading = false,
  error = '',
  autoFocus = true,
  label = 'Scanner ou rechercher un article',
  placeholder = 'Scannez le code-barres ou le QR code, puis Entrée…',
  compact = false,
}) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!autoFocus) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [autoFocus]);

  function submit(raw) {
    const code = parseScannedArticleCode(raw);
    if (!code || loading) return;
    setValue('');
    onScan(code);
  }

  function handleKeyDown(ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    submit(ev.target.value);
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: compact ? 14 : 16,
        padding: compact ? '10px 14px' : '12px 16px',
        border: error ? '1px solid #EF9A9A' : '1px solid var(--border)',
        background: error ? '#FFF8F8' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        <ScanLine size={compact ? 15 : 16} style={{ color: 'var(--red)', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: compact ? '0.78rem' : '0.82rem', letterSpacing: '0.02em' }}>
          {label}
        </span>
        {loading && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-3)' }}>
            <Loader2 size={13} className="cin-spin" /> Recherche…
          </span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <ScanLine
          size={14}
          style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}
        />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={placeholder}
          aria-label={label}
          style={{
            ...INPUT_STYLE,
            paddingLeft: 34,
            fontFamily: 'var(--font-head)',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        />
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--red)', fontWeight: 600 }}>
          {error}
        </div>
      )}
    </div>
  );
}
