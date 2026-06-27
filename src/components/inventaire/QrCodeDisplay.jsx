/**
 * QrCodeDisplay.jsx — QR code vers la fiche article (/inventaire/articles/CODE)
 */
import { useEffect, useState } from 'react';
import { getArticleBarcodeValue, getArticlePublicUrl } from '../../services/inventaire/barcodeUtils';

export default function QrCodeDisplay({ article, code, size = 112, className, style }) {
  const [dataUrl, setDataUrl] = useState('');
  const articleCode = code || getArticleBarcodeValue(article);
  const url = getArticlePublicUrl(articleCode);

  useEffect(() => {
    if (!url) {
      setDataUrl('');
      return undefined;
    }
    let cancelled = false;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, {
        width: size * 2,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      }))
      .then((src) => {
        if (!cancelled) setDataUrl(src);
      })
      .catch(() => {
        if (!cancelled) setDataUrl('');
      });
    return () => { cancelled = true; };
  }, [url, size]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt={`QR code article ${articleCode}`}
      className={className}
      style={{ width: size, height: size, display: 'block', ...style }}
    />
  );
}
