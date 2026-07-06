/**
 * Utilitaires images PDF CRM — compression + alias jsPDF (évite la duplication par page).
 */

export const CRM_PDF_LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
export const CRM_PDF_ICON_URL = 'https://i.ibb.co/S79nbLdm/icone.png';
export const CRM_PDF_QR_URL = 'https://i.ibb.co/rRrG27n3/Capture-d-e-cran-2026-06-02-a-15-32-23.png';
export const CRM_PDF_SIGNATURE_URL = 'https://i.ibb.co/nMVcsDqS/signature.png';

export const CRM_PDF_IMAGE_ALIAS = {
  logo: 'crm-pdf-logo',
  icon: 'crm-pdf-icon',
  qr: 'crm-pdf-qr',
  signature: 'crm-pdf-signature',
};

async function fetchImageDataUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function compressDataUrl(dataUrl, maxDimension, quality, { preserveAlpha = false } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxDimension / Math.max(w, h, 1));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          format: preserveAlpha ? 'PNG' : 'JPEG',
        });
        return;
      }

      if (preserveAlpha) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: w,
          height: h,
          format: 'PNG',
        });
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', quality),
        width: w,
        height: h,
        format: 'JPEG',
      });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function loadCompressedImage(url, maxDimension = 600, quality = 0.75, options = {}) {
  const dataUrl = await fetchImageDataUrl(url);
  if (!dataUrl) return null;
  return compressDataUrl(dataUrl, maxDimension, quality, options);
}

export async function loadCrmPdfImages({ withSignature = false } = {}) {
  const [logoMeta, iconMeta, qrMeta, signatureMeta] = await Promise.all([
    loadCompressedImage(CRM_PDF_LOGO_URL, 400, 0.82),
    loadCompressedImage(CRM_PDF_ICON_URL, 500, 0.65, { preserveAlpha: true }),
    loadCompressedImage(CRM_PDF_QR_URL, 200, 0.8),
    withSignature
      ? loadCompressedImage(CRM_PDF_SIGNATURE_URL, 350, 0.82, { preserveAlpha: true })
      : Promise.resolve(null),
  ]);
  return { logoMeta, iconMeta, qrMeta, signatureMeta };
}

export function addCrmPdfImage(doc, meta, x, y, width, height, alias) {
  if (!meta?.dataUrl) return;
  try {
    const format = meta.format || 'JPEG';
    doc.addImage(meta.dataUrl, format, x, y, width, height, alias, 'FAST');
  } catch { /* skip */ }
}
