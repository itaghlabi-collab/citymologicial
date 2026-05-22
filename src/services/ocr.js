/**
 * ocr.js — OCR frontend local (Tesseract.js via CDN dynamique, zero import)
 * Aucun import npm. Aucun backend. Fonctionne dans le navigateur.
 */

// ── Chargement Tesseract.js (script tag dynamique, une seule fois) ───────────
var _tesseractPromise = null;

function loadTesseract() {
  if (_tesseractPromise) return _tesseractPromise;
  _tesseractPromise = new Promise(function(resolve, reject) {
    if (window.Tesseract) { resolve(window.Tesseract); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload  = function() { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract init failed')); };
    s.onerror = function() { reject(new Error('Tesseract script load failed')); };
    document.head.appendChild(s);
  }).catch(function(err) {
    _tesseractPromise = null;
    throw err;
  });
  return _tesseractPromise;
}

// ── Worker singleton ──────────────────────────────────────────────────────────
var _workerPromise = null;

function getWorker() {
  if (_workerPromise) return _workerPromise;
  _workerPromise = loadTesseract().then(function(T) {
    return T.createWorker('fra+eng', 1, { logger: function() {} });
  }).catch(function(err) {
    _workerPromise = null;
    throw err;
  });
  return _workerPromise;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRÉTRAITEMENT IMAGE
// ═══════════════════════════════════════════════════════════════════════════════

function loadImg(dataUrl) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      var c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function upscale(canvas, target) {
  target = target || 2600;
  var scale = Math.max(1, target / canvas.width);
  if (scale <= 1.05) return canvas;
  var c = document.createElement('canvas');
  c.width  = Math.round(canvas.width  * scale);
  c.height = Math.round(canvas.height * scale);
  var ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

function toGray(canvas) {
  var ctx = canvas.getContext('2d');
  var id  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  var d   = id.data;
  for (var i = 0; i < d.length; i += 4) {
    var g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    d[i] = d[i+1] = d[i+2] = g;
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

function adaptiveBinarize(canvas) {
  var W = canvas.width, H = canvas.height;
  var ctx = canvas.getContext('2d');
  var id  = ctx.getImageData(0, 0, W, H);
  var d   = id.data;
  var R   = 16;
  var gray = new Float32Array(W * H);
  for (var i = 0; i < W * H; i++) gray[i] = d[i * 4];
  var S = new Float64Array((W+1) * (H+1));
  for (var y = 1; y <= H; y++) {
    for (var x = 1; x <= W; x++) {
      S[y*(W+1)+x] = gray[(y-1)*W+(x-1)] + S[(y-1)*(W+1)+x] + S[y*(W+1)+(x-1)] - S[(y-1)*(W+1)+(x-1)];
    }
  }
  for (var py = 0; py < H; py++) {
    for (var px = 0; px < W; px++) {
      var x1=Math.max(0,px-R), y1=Math.max(0,py-R);
      var x2=Math.min(W,px+R+1), y2=Math.min(H,py+R+1);
      var n = (x2-x1)*(y2-y1);
      var s = S[y2*(W+1)+x2]-S[y1*(W+1)+x2]-S[y2*(W+1)+x1]+S[y1*(W+1)+x1];
      var val = gray[py*W+px] < (s/n)*0.88 ? 0 : 255;
      var idx = (py*W+px)*4;
      d[idx]=d[idx+1]=d[idx+2]=val; d[idx+3]=255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

function sharpenCanvas(canvas) {
  var W = canvas.width, H = canvas.height;
  var ctx = canvas.getContext('2d');
  var src = ctx.getImageData(0,0,W,H);
  var dst = ctx.createImageData(W,H);
  var s=src.data, t=dst.data;
  var k=[0,-1,0,-1,5,-1,0,-1,0];
  for (var y=1;y<H-1;y++) {
    for (var x=1;x<W-1;x++) {
      var v=0;
      for (var ky=-1;ky<=1;ky++) {
        for (var kx=-1;kx<=1;kx++) {
          v += s[((y+ky)*W+(x+kx))*4] * k[(ky+1)*3+(kx+1)];
        }
      }
      var o=(y*W+x)*4;
      t[o]=t[o+1]=t[o+2]=Math.min(255,Math.max(0,v)); t[o+3]=255;
    }
  }
  ctx.putImageData(dst,0,0);
  return canvas;
}

function autoCrop(canvas) {
  var W=canvas.width, H=canvas.height;
  var ctx=canvas.getContext('2d');
  var d=ctx.getImageData(0,0,W,H).data;
  var rB=new Float32Array(H), cB=new Float32Array(W);
  for (var y=0;y<H;y++){var rs=0;for(var x=0;x<W;x++){var ri=(y*W+x)*4;rs+=0.299*d[ri]+0.587*d[ri+1]+0.114*d[ri+2];}rB[y]=rs/W;}
  for (var cx=0;cx<W;cx++){var cs=0;for(var cy=0;cy<H;cy++){var ci=(cy*W+cx)*4;cs+=0.299*d[ci]+0.587*d[ci+1]+0.114*d[ci+2];}cB[cx]=cs/H;}
  var T=245, top=0, bot=H-1, left=0, right=W-1;
  for(var ty=0;ty<H;ty++){if(rB[ty]<T){top=Math.max(0,ty-4);break;}}
  for(var by=H-1;by>=0;by--){if(rB[by]<T){bot=Math.min(H-1,by+4);break;}}
  for(var lx=0;lx<W;lx++){if(cB[lx]<T){left=Math.max(0,lx-4);break;}}
  for(var rx=W-1;rx>=0;rx--){if(cB[rx]<T){right=Math.min(W-1,rx+4);break;}}
  var cw=right-left, ch=bot-top;
  if(cw<W*0.3||ch<H*0.3) return canvas;
  var c=document.createElement('canvas');
  c.width=cw; c.height=ch;
  c.getContext('2d').drawImage(canvas,left,top,cw,ch,0,0,cw,ch);
  return c;
}

function preprocessForOCR(dataUrl) {
  return loadImg(dataUrl).then(function(raw) {
    var crop = autoCrop(raw);
    var big  = upscale(crop, 2600);
    var gray = toGray(big);
    var bin  = adaptiveBinarize(gray);
    var shp  = sharpenCanvas(bin);
    return shp.toDataURL('image/png');
  }).catch(function() {
    return dataUrl;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OCR
// ═══════════════════════════════════════════════════════════════════════════════

function runOCR(dataUrl) {
  return getWorker().then(function(worker) {
    return worker.setParameters({ tessedit_pageseg_mode: '6' }).then(function() {
      return worker.recognize(dataUrl);
    }).then(function(r1) {
      var text = (r1.data && r1.data.text) || '';
      if (text.replace(/\s/g, '').length >= 20) return text;
      return worker.setParameters({ tessedit_pageseg_mode: '3' }).then(function() {
        return worker.recognize(dataUrl);
      }).then(function(r2) {
        var t2 = (r2.data && r2.data.text) || '';
        return t2.length > text.length ? t2 : text;
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER CIN MAROCAINE
// ═══════════════════════════════════════════════════════════════════════════════

function parseMarocainCIN(raw) {
  var text  = raw.replace(/[|\\]/g, 'I').replace(/\r/g, '');
  var lines = text.split('\n').map(function(l){return l.trim();}).filter(Boolean);
  var full  = text.toUpperCase();

  var out = { cin:'', prenom:'', nom:'', date_naissance:'', ville_naissance:'', sexe:'', nationalite:'MAR' };

  // 1. CIN : 1-2 lettres + 5-8 chiffres
  var cinM = text.match(/\b([A-Z]{1,2}\d{5,8})\b/i);
  if (cinM) out.cin = cinM[1].toUpperCase();

  // 2. Date DD/MM/YYYY ou YYYY-MM-DD
  var dm1 = text.match(/(?:n[eé]e?\s*le\s*)?(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/i);
  var dm2 = text.match(/(\d{4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})/);
  if (dm1) {
    out.date_naissance = dm1[3] + '-' + dm1[2].padStart(2,'0') + '-' + dm1[1].padStart(2,'0');
  } else if (dm2) {
    out.date_naissance = dm2[1] + '-' + dm2[2].padStart(2,'0') + '-' + dm2[3].padStart(2,'0');
  }

  // 3. Sexe
  if      (/\bMASCULIN\b|MALE|\bSEXE\s*:?\s*M\b/i.test(full))  out.sexe = 'M';
  else if (/\bFEMININ\b|FEMALE|\bSEXE\s*:?\s*F\b/i.test(full)) out.sexe = 'F';
  else if (text.indexOf('\u2642') !== -1) out.sexe = 'M';
  else if (text.indexOf('\u2640') !== -1) out.sexe = 'F';

  // 4. Labels ligne par ligne
  var NOM_RE    = /^(?:NOM|NAM|NDM)\s*[:=]?\s*/i;
  var PRENOM_RE = /^(?:PR[EÉ]NOM|PRENOM|FIRSTNAME|GIVEN\s*NAME)\s*[:=]?\s*/i;
  var LIEU_RE   = /^(?:N[EÉ]\(?E?\)?\s*(?:[AÀ]|LE)?|LIEU\s*(?:DE\s*)?NAISSANCE|PLACE\s*OF\s*BIRTH)\s*[:=]?\s*/i;

  for (var i = 0; i < lines.length; i++) {
    var u = lines[i].toUpperCase();
    if (!out.nom    && NOM_RE.test(u))    { var vn=lines[i].replace(NOM_RE,'').trim();    out.nom    = vn.length>1?vn:((lines[i+1]||'').trim()); }
    if (!out.prenom && PRENOM_RE.test(u)) { var vp=lines[i].replace(PRENOM_RE,'').trim(); out.prenom = vp.length>1?vp:((lines[i+1]||'').trim()); }
    if (!out.ville_naissance && LIEU_RE.test(u)) { var vl=lines[i].replace(LIEU_RE,'').trim(); out.ville_naissance = vl.length>1?vl:((lines[i+1]||'').trim()); }
  }

  // 5. Fallback : lignes de texte pur en majuscules
  if (!out.nom || !out.prenom) {
    var STOP = /ROYAUME|MAROC|NATIONALE|IDENTIT|CARTE|REPUBLIC|KINGDOM|NATIONAL|MAROCAINE|VALABLE|VALID|DATE|EXPIRE|NAISSANCE|SEXE|CIVIL|ADRESSE|CODE|\d{4}/i;
    var nls = lines
      .map(function(l){return l.replace(/[^A-Za-z\u00C0-\u00FF\s\-]/g,'').trim();})
      .filter(function(l){return l.length>=3&&l.length<=40&&/^[A-Z\u00C0-\u00DE]/.test(l)&&!STOP.test(l);});
    if (!out.nom    && nls[0]) out.nom    = nls[0];
    if (!out.prenom && nls[1]) out.prenom = nls[1];
  }

  // 6. Nettoyage
  out.nom             = out.nom.replace(/[^A-Za-z\u00C0-\u00FF\s\-]/g,'').trim().toUpperCase();
  out.prenom          = out.prenom.replace(/[^A-Za-z\u00C0-\u00FF\s\-]/g,'').trim();
  out.ville_naissance = out.ville_naissance.replace(/[^A-Za-z\u00C0-\u00FF\s\-]/g,'').trim();
  if (out.nom.length    < 2) out.nom    = '';
  if (out.prenom.length < 2) out.prenom = '';

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export function compressImage(dataUrl, maxWidth, quality) {
  maxWidth = maxWidth || 2000;
  quality  = quality  || 0.92;
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      try {
        var scale = Math.min(1, maxWidth / Math.max(img.width, 1));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch(e) { reject(e); }
    };
    img.onerror = function() { reject(new Error('Image non chargeable')); };
    img.src = dataUrl;
  });
}

export function scanCIN(rectoDataUrl, versoDataUrl) {
  if (!rectoDataUrl || rectoDataUrl.indexOf('data:image') !== 0) {
    return Promise.reject(new Error('Image recto invalide. Veuillez rescanner.'));
  }

  return preprocessForOCR(rectoDataUrl).then(function(processed) {
    return runOCR(processed);
  }).then(function(rawText) {
    console.log('[OCR] texte brut:\n', rawText);
    if (!rawText || rawText.replace(/\s/g, '').length < 5) {
      throw new Error('Texte non detecte. Reprendre une photo plus nette.');
    }
    var data = parseMarocainCIN(rawText);
    return {
      cin:             data.cin,
      prenom:          data.prenom,
      nom:             data.nom,
      date_naissance:  data.date_naissance,
      ville_naissance: data.ville_naissance,
      sexe:            data.sexe,
      nationalite:     data.nationalite,
      cin_recto:       rectoDataUrl,
      cin_verso:       versoDataUrl || '',
      _ocr_raw:        rawText,
    };
  }).catch(function(err) {
    var msg = (err && err.message) || '';
    throw new Error(
      (msg.length > 0 && msg.length < 140)
        ? msg
        : 'Texte non detecte. Reprendre une photo plus nette.'
    );
  });
}
