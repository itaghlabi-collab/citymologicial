/**
 * BarcodeDisplay.jsx — Affichage CODE128 (canvas)
 */
import { useEffect, useRef } from 'react';
import { getArticleBarcodeValue, renderBarcodeCanvas } from '../../services/inventaire/barcodeUtils';

export default function BarcodeDisplay({ article, value, height = 56, width = 2, displayValue = true, className, style }) {
  const canvasRef = useRef(null);
  const code = value || getArticleBarcodeValue(article);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !code) return;
    try {
      const rendered = renderBarcodeCanvas(code, { height, width, displayValue });
      if (!rendered) return;
      const ctx = canvas.getContext('2d');
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(rendered, 0, 0);
    } catch {
      /* code invalide */
    }
  }, [code, height, width, displayValue]);

  if (!code) {
    return <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>Code article manquant</div>;
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', ...style }}
      aria-label={`Code-barres ${code}`}
    />
  );
}
