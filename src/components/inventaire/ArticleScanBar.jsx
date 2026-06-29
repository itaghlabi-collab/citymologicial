/**
 * ArticleScanBar.jsx — Zone scan douchette HID (clavier + Entrée)
 */
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Loader2, ScanLine, CheckCircle2 } from 'lucide-react';
import { INPUT_STYLE } from './shared.jsx';
import { parseScannedArticleCode } from '../../services/inventaire/barcodeUtils';

const ArticleScanBar = forwardRef(function ArticleScanBar({
  onScan,
  loading = false,
  error = '',
  success = '',
  autoFocus = true,
  label = 'Scanner un article',
  placeholder = 'Scannez le code-barres ou le QR code, puis Entrée…',
  compact = false,
  disabled = false,
}, ref) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => setValue(''),
  }));

  useEffect(() => {
    if (!autoFocus || disabled) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (loading || disabled) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [loading, error, success, disabled]);

  function submit(raw) {
    const code = parseScannedArticleCode(raw);
    if (!code || loading || disabled) return;
    setValue('');
    onScan(code);
    setTimeout(() => inputRef.current?.focus(), 20);
  }

  function handleKeyDown(ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    submit(ev.target.value);
  }

  const borderColor = error ? '#EF9A9A' : success ? '#A5D6A7' : 'var(--border)';
  const bg = error ? '#FFF8F8' : success ? '#F1F8E9' : undefined;

  return (
    <div
      className="card"
      style={{
        marginBottom: compact ? 14 : 16,
        padding: compact ? '10px 14px' : '12px 16px',
        border: `1px solid ${borderColor}`,
        background: bg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        {success ? (
          <CheckCircle2 size={compact ? 15 : 16} style={{ color: '#2E7D32', flexShrink: 0 }} />
        ) : (
          <ScanLine size={compact ? 15 : 16} style={{ color: 'var(--red)', flexShrink: 0 }} />
        )}
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
          disabled={loading || disabled}
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
      {success && !error && (
        <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#2E7D32', fontWeight: 600 }}>
          {success}
        </div>
      )}
    </div>
  );
});

export default ArticleScanBar;
