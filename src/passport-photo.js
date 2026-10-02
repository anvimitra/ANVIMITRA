import { PDFDocument, rgb } from 'pdf-lib';

// -----------------------------------------------------------------------------
// Constants & Configuration
// -----------------------------------------------------------------------------
const DPI = 300;
const MM_TO_INCH = 1 / 25.4;

// Standard passport photo sizes (mm and 300 DPI pixels)
const PHOTO_PRESETS = {
  'indian-passport': { name: 'Indian Passport / Exam (3.5 × 4.5 cm)', mmW: 35, mmH: 45, pxW: 413, pxH: 531 },
  'us-visa': { name: 'US / International Visa (2 × 2 inch / 5 × 5 cm)', mmW: 50.8, mmH: 50.8, pxW: 600, pxH: 600 },
  'stamp-size': { name: 'Stamp Size / Pocket Photo (2.5 × 3.0 cm)', mmW: 25, mmH: 30, pxW: 295, pxH: 354 },
  'custom': { name: 'Custom Size (Manual mm)', mmW: 35, mmH: 45, pxW: 413, pxH: 531 }
};

const PAPER_PRESETS = {
  'a4': { name: 'A4 Sheet (210 × 297 mm)', mmW: 210, mmH: 297, pxW: 2480, pxH: 3508 },
  '4x6': { name: '4 × 6 inch Photo Paper (102 × 152 mm)', mmW: 101.6, mmH: 152.4, pxW: 1200, pxH: 1800 }
};

// -----------------------------------------------------------------------------
// Application State
// -----------------------------------------------------------------------------
let originalImage = null;
let originalFileName = 'passport-photo';
let detectedFace = null;
let segmenterMaskCanvas = null;
let segmenterScale = 1;
let isProcessing = false;
let webcamStream = null;

// User Customizable Settings
const state = {
  preset: 'indian-passport',
  mmW: 35,
  mmH: 45,
  pxW: 413,
  pxH: 531,
  
  // Background
  bgColorType: 'white', // 'white', 'studio-blue', 'sky-blue', 'gray', 'red', 'custom', 'original'
  customBgColor: '#ffffff',
  edgeFeather: 3,

  // Framing & Transform
  zoom: 1.0,
  panX: 0,
  panY: 0,
  rotation: 0,

  // AI Enhancements
  brightness: 4,
  contrast: 6,
  saturation: 4,
  sharpness: 45,
  skinSmooth: 30,
  warmth: 0,
  autoEnhanced: true,

  // Exam Name & Date Banner
  nameDateEnabled: false,
  candidateName: '',
  photoDate: getFormattedCurrentDate(),

  // Print Sheet
  paper: 'a4',
  photoCount: 12, // 6, 8, 12, 16, 30
  borderStyle: 'black', // 'black', 'gray', 'none'
  marginMm: 8,
  gapMm: 4
};

function getFormattedCurrentDate() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// -----------------------------------------------------------------------------
// DOM Helper Utilities
// -----------------------------------------------------------------------------
const $ = id => document.getElementById(id);

function setStatus(text, type = 'normal') {
  const el = $('statusText');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-badge ' + type;
}

function setProgress(pct, label) {
  const wrap = $('progressWrap');
  const bar = $('progressBar');
  const txt = $('progressLabel');
  if (!wrap || !bar) return;
  if (pct >= 100 || pct < 0) {
    wrap.hidden = true;
  } else {
    wrap.hidden = false;
    bar.style.width = Math.max(5, Math.min(100, pct)) + '%';
    if (txt) txt.textContent = label || `${Math.round(pct)}%`;
  }
}

// -----------------------------------------------------------------------------
// MediaPipe Vision AI (Face Detection & Selfie Segmentation)
// -----------------------------------------------------------------------------
let mediaPipeVision = null;
let faceDetectorInstance = null;
let segmenterInstance = null;

async function getMediaPipeVision() {
  if (mediaPipeVision) return mediaPipeVision;
  try {
    mediaPipeVision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm');
    return mediaPipeVision;
  } catch (err) {
    console.warn('Failed to load MediaPipe tasks-vision:', err);
    return null;
  }
}

async function getFaceDetector() {
  if (faceDetectorInstance) return faceDetectorInstance;
  const vision = await getMediaPipeVision();
  if (!vision) return null;
  try {
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
    );
    faceDetectorInstance = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'CPU'
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.45
    });
    return faceDetectorInstance;
  } catch (err) {
    console.warn('MediaPipe FaceDetector failed:', err);
    return null;
  }
}

async function getSegmenter() {
  if (segmenterInstance) return segmenterInstance;
  const vision = await getMediaPipeVision();
  if (!vision) return null;
  try {
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
    );
    segmenterInstance = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
        delegate: 'CPU'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: true
    });
    return segmenterInstance;
  } catch (err) {
    console.warn('MediaPipe ImageSegmenter failed:', err);
    return null;
  }
}

async function runFaceDetection(img) {
  try {
    const detector = await getFaceDetector();
    if (detector) {
      const results = detector.detect(img);
      if (results && results.detections && results.detections.length > 0) {
        const box = results.detections[0].boundingBox;
        if (box) {
          return {
            x: box.originX,
            y: box.originY,
            width: box.width,
            height: box.height
          };
        }
      }
    }
  } catch (e) {
    console.warn('MediaPipe face detector detection error:', e);
  }

  // Native Shape Detection API fallback
  try {
    if ('FaceDetector' in window) {
      const nativeDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await nativeDetector.detect(img);
      if (faces && faces[0] && faces[0].boundingBox) {
        const b = faces[0].boundingBox;
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    }
  } catch (e) {
    console.warn('Native FaceDetector error:', e);
  }

  return null;
}

async function runSelfieSegmentation(orig) {
  const seg = await getSegmenter();
  if (!seg) throw new Error('AI Segmentation module not available');

  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(orig.naturalWidth, orig.naturalHeight));
  const sc = document.createElement('canvas');
  sc.width = Math.max(1, Math.round(orig.naturalWidth * scale));
  sc.height = Math.max(1, Math.round(orig.naturalHeight * scale));
  const sx = sc.getContext('2d');
  sx.imageSmoothingEnabled = true;
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(orig, 0, 0, sc.width, sc.height);

  const result = seg.segment(sc);
  try {
    let maskObj = null;
    let vals = null;
    if (result.confidenceMasks && result.confidenceMasks.length > 0) {
      maskObj = result.confidenceMasks.length > 1 ? result.confidenceMasks[1] : result.confidenceMasks[0];
      vals = maskObj.getAsFloat32Array();
    } else if (result.categoryMask) {
      maskObj = result.categoryMask;
      vals = maskObj.getAsFloat32Array();
    }

    if (!maskObj || !vals || !vals.length) {
      throw new Error('AI segmentation returned no mask');
    }

    const mw = maskObj.width;
    const mh = maskObj.height;
    const mc = document.createElement('canvas');
    mc.width = mw;
    mc.height = mh;
    const mx = mc.getContext('2d');
    const md = mx.createImageData(mw, mh);
    const p = md.data;

    // Smoothstep anti-aliased edge feathering
    for (let i = 0, j = 0; i < vals.length; i++, j += 4) {
      let v = vals[i];
      if (!Number.isFinite(v)) v = 0;
      v = Math.max(0, Math.min(1, v));
      // Smoothstep curve between 0.15 and 0.82 for hair and soft edge transparency
      const t = Math.max(0, Math.min(1, (v - 0.15) / 0.67));
      const a = Math.round(t * t * (3 - 2 * t) * 255);
      p[j] = 255;
      p[j + 1] = 255;
      p[j + 2] = 255;
      p[j + 3] = a;
    }
    mx.putImageData(md, 0, 0);

    return { maskCanvas: mc, scale };
  } finally {
    if (result && typeof result.close === 'function') {
      result.close();
    }
  }
}

// -----------------------------------------------------------------------------
// Image Processing & Enhancement Filters
// -----------------------------------------------------------------------------

function applyColorAdjustments(pixels, width, height, opts) {
  const { brightness = 0, contrast = 0, saturation = 0, warmth = 0 } = opts;
  const b = brightness * 1.5;
  const cFactor = (contrast + 100) / 100;
  const sFactor = (saturation + 100) / 100;
  const wR = warmth * 0.75;
  const wB = -warmth * 0.75;

  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i];
    let g = pixels[i + 1];
    let bVal = pixels[i + 2];

    // Contrast & Brightness
    r = (r - 128) * cFactor + 128 + b;
    g = (g - 128) * cFactor + 128 + b;
    bVal = (bVal - 128) * cFactor + 128 + b;

    // Warmth adjustment (temperature)
    r += wR;
    bVal += wB;

    // Saturation
    if (sFactor !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * bVal;
      r = gray + (r - gray) * sFactor;
      g = gray + (g - gray) * sFactor;
      bVal = gray + (bVal - gray) * sFactor;
    }

    pixels[i] = Math.min(255, Math.max(0, r));
    pixels[i + 1] = Math.min(255, Math.max(0, g));
    pixels[i + 2] = Math.min(255, Math.max(0, bVal));
  }
}

function applyUnsharpMask(pixels, width, height, amount) {
  if (amount <= 0) return;
  const k = (amount / 100) * 0.75;
  const copy = new Uint8ClampedArray(pixels);
  const w = width;
  const h = height;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const up = copy[((y - 1) * w + x) * 4 + c];
        const down = copy[((y + 1) * w + x) * 4 + c];
        const left = copy[(y * w + (x - 1)) * 4 + c];
        const right = copy[(y * w + (x + 1)) * 4 + c];
        const val = center + k * (4 * center - up - down - left - right);
        pixels[idx + c] = Math.min(255, Math.max(0, val));
      }
    }
  }
}

function applyEdgeAwareSkinSmoothing(pixels, width, height, amount) {
  if (amount <= 0) return;
  const factor = amount / 100;
  const threshold = 26;
  const copy = new Uint8ClampedArray(pixels);
  const w = width;
  const h = height;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const r = copy[idx];
      const g = copy[idx + 1];
      const b = copy[idx + 2];

      // Detect human skin tones (RGB heuristic)
      const isSkin = r > 65 && r > g && g > b && (r - g) > 8 && (r - b) > 12;
      if (!isSkin) continue;

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = ((y + dy) * w + (x + dx)) * 4;
          const nr = copy[nIdx];
          const ng = copy[nIdx + 1];
          const nb = copy[nIdx + 2];
          const diff = Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb);
          if (diff < threshold * 3) {
            rSum += nr;
            gSum += ng;
            bSum += nb;
            count++;
          }
        }
      }

      if (count > 0) {
        pixels[idx] = Math.round(r * (1 - factor) + (rSum / count) * factor);
        pixels[idx + 1] = Math.round(g * (1 - factor) + (gSum / count) * factor);
        pixels[idx + 2] = Math.round(b * (1 - factor) + (bSum / count) * factor);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Auto-Framing & Crop Calculation (ICAO Standard)
// -----------------------------------------------------------------------------
function calculateCrop(orig, face, targetW, targetH) {
  const sw = orig.naturalWidth;
  const sh = orig.naturalHeight;
  const targetRatio = targetW / targetH;

  let cw = sw;
  let ch = sw / targetRatio;
  if (ch > sh) {
    ch = sh;
    cw = ch * targetRatio;
  }

  let sx = (sw - cw) / 2;
  let sy = (sh - ch) * 0.15;

  if (face) {
    // ICAO Indian Passport Standard:
    // Face height should take approx 68-75% of the total photo height.
    // Total head with hair is roughly face.height * 1.35.
    const targetFaceRatio = 0.36; // Face box as fraction of crop
    ch = Math.min(sh, Math.max(face.height / targetFaceRatio, face.height * 2.75));
    cw = ch * targetRatio;
    if (cw > sw) {
      cw = sw;
      ch = cw / targetRatio;
    }

    const fx = face.x + face.width / 2;
    sx = fx - cw / 2;
    // Proper headroom above eyebrows/hair
    sy = face.y - face.height * 0.65;
  }

  // Apply user manual adjustments
  const zoomFactor = state.zoom || 1.0;
  cw = cw / zoomFactor;
  ch = ch / zoomFactor;

  // Add pan offsets (scaled to crop dimensions)
  sx += (state.panX || 0) * (cw / targetW);
  sy += (state.panY || 0) * (ch / targetH);

  // Clamping
  sx = Math.max(0, Math.min(sw - cw, sx));
  sy = Math.max(0, Math.min(sh - ch, sy));

  return { sx, sy, cw, ch };
}

// -----------------------------------------------------------------------------
// Single Passport Photo Rendering
// -----------------------------------------------------------------------------
function renderSinglePassportPhoto() {
  if (!originalImage) return null;

  const pw = state.pxW;
  const ph = state.pxH;

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Fill Background Color
  let bgColor = '#ffffff';
  if (state.bgColorType === 'studio-blue') bgColor = '#2563eb';
  else if (state.bgColorType === 'sky-blue') bgColor = '#dbeafe';
  else if (state.bgColorType === 'gray') bgColor = '#f1f5f9';
  else if (state.bgColorType === 'red') bgColor = '#dc2626';
  else if (state.bgColorType === 'custom') bgColor = state.customBgColor || '#ffffff';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, pw, ph);

  const { sx, sy, cw, ch } = calculateCrop(originalImage, detectedFace, pw, ph);

  // 2. Render Foreground Person
  if (state.bgColorType === 'original' || !segmenterMaskCanvas) {
    // Keep original background or fallback
    ctx.save();
    if (state.rotation !== 0) {
      ctx.translate(pw / 2, ph / 2);
      ctx.rotate((state.rotation * Math.PI) / 180);
      ctx.translate(-pw / 2, -ph / 2);
    }
    ctx.drawImage(originalImage, sx, sy, cw, ch, 0, 0, pw, ph);
    ctx.restore();
  } else {
    // Cut out person using MediaPipe segmentation mask
    const fg = document.createElement('canvas');
    fg.width = pw;
    fg.height = ph;
    const fCtx = fg.getContext('2d');
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = 'high';

    fCtx.save();
    if (state.rotation !== 0) {
      fCtx.translate(pw / 2, ph / 2);
      fCtx.rotate((state.rotation * Math.PI) / 180);
      fCtx.translate(-pw / 2, -ph / 2);
    }
    fCtx.drawImage(originalImage, sx, sy, cw, ch, 0, 0, pw, ph);
    fCtx.restore();

    // Prepare crop mask from segmented mask
    const cropMask = document.createElement('canvas');
    cropMask.width = pw;
    cropMask.height = ph;
    const cmCtx = cropMask.getContext('2d');
    cmCtx.imageSmoothingEnabled = true;
    cmCtx.imageSmoothingQuality = 'high';

    const mx = sx * segmenterScale;
    const my = sy * segmenterScale;
    const mw = cw * segmenterScale;
    const mh = ch * segmenterScale;

    cmCtx.save();
    if (state.rotation !== 0) {
      cmCtx.translate(pw / 2, ph / 2);
      cmCtx.rotate((state.rotation * Math.PI) / 180);
      cmCtx.translate(-pw / 2, -ph / 2);
    }
    cmCtx.drawImage(segmenterMaskCanvas, mx, my, mw, mh, 0, 0, pw, ph);
    cmCtx.restore();

    // Composite person with destination-in mask
    fCtx.globalCompositeOperation = 'destination-in';
    fCtx.drawImage(cropMask, 0, 0);

    // Draw cutout person onto chosen background
    ctx.drawImage(fg, 0, 0);
  }

  // 3. Apply AI Enhancements (Exposure, Sharpness, Skin Retouch)
  const imgData = ctx.getImageData(0, 0, pw, ph);
  const pixels = imgData.data;

  // Apply Brightness, Contrast, Saturation, Warmth
  applyColorAdjustments(pixels, pw, ph, {
    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
    warmth: state.warmth
  });

  // Apply Skin Smoothing
  if (state.skinSmooth > 0) {
    applyEdgeAwareSkinSmoothing(pixels, pw, ph, state.skinSmooth);
  }

  // Apply Unsharp Mask Face Sharpening
  if (state.sharpness > 0) {
    applyUnsharpMask(pixels, pw, ph, state.sharpness);
  }

  ctx.putImageData(imgData, 0, 0);

  // 4. Candidate Name & Date of Photo (DOP) Strip (Mandatory for SSC/Govt Exams)
  if (state.nameDateEnabled && (state.candidateName.trim() || state.photoDate.trim())) {
    const bannerH = Math.round(ph * 0.17);
    const bannerY = ph - bannerH;

    // Solid white rectangular strip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, bannerY, pw, bannerH);

    // Thin top border of the strip
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, bannerY);
    ctx.lineTo(pw, bannerY);
    ctx.stroke();

    // Render Name and Date
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const hasName = Boolean(state.candidateName.trim());
    const hasDate = Boolean(state.photoDate.trim());

    if (hasName && hasDate) {
      ctx.font = `bold ${Math.round(bannerH * 0.38)}px Arial, sans-serif`;
      ctx.fillText(state.candidateName.trim().toUpperCase(), pw / 2, bannerY + bannerH * 0.32);

      ctx.font = `600 ${Math.round(bannerH * 0.32)}px Arial, sans-serif`;
      const dateText = state.photoDate.trim().startsWith('DOP') ? state.photoDate.trim() : `DOP: ${state.photoDate.trim()}`;
      ctx.fillText(dateText, pw / 2, bannerY + bannerH * 0.74);
    } else {
      const singleText = hasName ? state.candidateName.trim().toUpperCase() : `DOP: ${state.photoDate.trim()}`;
      ctx.font = `bold ${Math.round(bannerH * 0.44)}px Arial, sans-serif`;
      ctx.fillText(singleText, pw / 2, bannerY + bannerH * 0.52);
    }
  }

  // 5. Outer Border (if specified)
  if (state.borderStyle === 'black') {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, pw - 2, ph - 2);
  } else if (state.borderStyle === 'gray') {
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, pw - 2, ph - 2);
  }

  return canvas;
}

// -----------------------------------------------------------------------------
// Sheet Rendering (A4 & 4×6 Grid)
// -----------------------------------------------------------------------------
function renderPrintSheetCanvas() {
  const photoCanvas = renderSinglePassportPhoto();
  if (!photoCanvas) return null;

  const paper = PAPER_PRESETS[state.paper] || PAPER_PRESETS['a4'];
  const sheetW = paper.pxW;
  const sheetH = paper.pxH;

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Crisp pure white paper
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheetW, sheetH);

  // Convert mm margins & gaps to 300 DPI pixels
  const pxPerMm = (DPI / 25.4);
  const marginPx = Math.round(state.marginMm * pxPerMm);
  const gapPx = Math.round(state.gapMm * pxPerMm);

  const pw = state.pxW;
  const ph = state.pxH;

  // Calculate available columns and rows
  const availW = sheetW - 2 * marginPx;
  const cols = Math.max(1, Math.floor((availW + gapPx) / (pw + gapPx)));
  const count = state.photoCount;

  // Center the grid on the sheet horizontally
  const gridW = cols * pw + (cols - 1) * gapPx;
  const startX = Math.max(marginPx, Math.round((sheetW - gridW) / 2));
  const startY = marginPx;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (pw + gapPx);
    const y = startY + row * (ph + gapPx);

    // Stop if drawing outside page
    if (y + ph > sheetH) break;

    ctx.drawImage(photoCanvas, x, y, pw, ph);

    // Draw subtle scissor cut dashed lines around photos if border style is none
    if (state.borderStyle === 'none') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, pw, ph);
    }
  }

  // Draw header mark at bottom (studio attribution & date)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `ANVI E-Mitra & CSC Centre • A4 300 DPI Passport Sheet • ${new Date().toLocaleDateString()}`,
    sheetW / 2,
    sheetH - 24
  );

  return canvas;
}

// -----------------------------------------------------------------------------
// Interactive UI Update & Preview
// -----------------------------------------------------------------------------
function updateLivePreviews() {
  if (!originalImage) return;

  // 1. Single passport photo preview
  const singleCanvas = renderSinglePassportPhoto();
  if (singleCanvas) {
    const previewHolder = $('singlePreviewHolder');
    if (previewHolder) {
      previewHolder.innerHTML = '';
      const img = document.createElement('img');
      img.src = singleCanvas.toDataURL('image/jpeg', 0.95);
      img.className = 'passport-thumb';
      img.alt = 'Passport Photo';
      previewHolder.appendChild(img);
    }
  }

  // 2. Full Sheet Preview
  const sheetCanvas = renderPrintSheetCanvas();
  if (sheetCanvas) {
    const sheetHolder = $('sheetPreviewHolder');
    if (sheetHolder) {
      sheetHolder.innerHTML = '';
      const img = document.createElement('img');
      img.src = sheetCanvas.toDataURL('image/jpeg', 0.92);
      img.className = 'sheet-thumb';
      img.alt = 'A4 Sheet Print Preview';
      sheetHolder.appendChild(img);
    }
  }

  // Update summary badge
  const infoEl = $('sheetInfoBadge');
  if (infoEl) {
    const pName = PAPER_PRESETS[state.paper]?.name || 'A4';
    infoEl.textContent = `${state.photoCount} Copies • ${pName} • 300 DPI`;
  }
}

// -----------------------------------------------------------------------------
// Core File & Camera Ingestion
// -----------------------------------------------------------------------------
async function processInputImage(fileOrBlob) {
  if (isProcessing) return;
  isProcessing = true;

  $('actionsSection').hidden = false;
  $('editorSection').hidden = false;
  $('pdfBtn').disabled = true;
  $('pngBtn').disabled = true;
  $('singleBtn').disabled = true;
  $('printBtn').disabled = true;

  setStatus('⏳ Loading image…', 'loading');
  setProgress(10, 'Loading file…');

  const objUrl = URL.createObjectURL(fileOrBlob);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = objUrl;
    });

    originalImage = img;
    originalFileName = (fileOrBlob.name || 'passport-photo').replace(/\.[^.]+$/, '');

    // Step 1: AI Face Detection
    setStatus('👤 AI detecting face & calculating head framing…', 'loading');
    setProgress(35, 'AI Face Detection…');
    detectedFace = await runFaceDetection(img);

    // Step 2: AI Selfie Segmentation (Background Removal)
    setStatus('🎨 AI removing background with edge feathering…', 'loading');
    setProgress(65, 'AI Background Removal…');
    try {
      const segResult = await runSelfieSegmentation(img);
      segmenterMaskCanvas = segResult.maskCanvas;
      segmenterScale = segResult.scale;
    } catch (segErr) {
      console.warn('AI Segmentation error:', segErr);
      segmenterMaskCanvas = null;
      setStatus('⚠️ AI background removal failed — using original background', 'warning');
      state.bgColorType = 'original';
      const origRadio = document.querySelector('input[name="bgColor"][value="original"]');
      if (origRadio) origRadio.checked = true;
    }

    // Step 3: Auto-apply enhancements & render
    setProgress(90, 'Applying studio enhancements…');
    updateLivePreviews();

    $('pdfBtn').disabled = false;
    $('pngBtn').disabled = false;
    $('singleBtn').disabled = false;
    $('printBtn').disabled = false;

    setProgress(100, 'Complete');
    setStatus('✓ Ready — AI background removed, face centered & 300 DPI sheet ready!', 'success');
  } catch (err) {
    console.error('Processing error:', err);
    setStatus('❌ Error processing photo: ' + (err.message || err), 'error');
  } finally {
    URL.revokeObjectURL(objUrl);
    isProcessing = false;
    setTimeout(() => setProgress(-1), 1200);
  }
}

// -----------------------------------------------------------------------------
// Webcam / Camera Live Capture
// -----------------------------------------------------------------------------
async function openWebcamModal() {
  const modal = $('webcamModal');
  const video = $('webcamVideo');
  if (!modal || !video) return;

  modal.hidden = false;
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
    video.srcObject = webcamStream;
    video.play();
  } catch (err) {
    console.error('Camera access failed:', err);
    alert('Camera access denied or unavailable: ' + (err.message || err));
    closeWebcamModal();
  }
}

function closeWebcamModal() {
  const modal = $('webcamModal');
  const video = $('webcamVideo');
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  if (video) video.srcObject = null;
  if (modal) modal.hidden = true;
}

function captureWebcamSnapshot() {
  const video = $('webcamVideo');
  if (!video || video.videoWidth === 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  // Mirror back for natural selfie view
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    if (blob) {
      closeWebcamModal();
      processInputImage(new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' }));
    }
  }, 'image/jpeg', 0.98);
}

// -----------------------------------------------------------------------------
// Demo Sample Generator
// -----------------------------------------------------------------------------
async function loadDemoSample() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 800, 1000);
  bgGrad.addColorStop(0, '#f1f5f9');
  bgGrad.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 1000);

  // Shoulders & suit jacket
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(400, 950, 320, 220, 0, 0, Math.PI * 2);
  ctx.fill();

  // White shirt collar
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(350, 750);
  ctx.lineTo(400, 860);
  ctx.lineTo(450, 750);
  ctx.closePath();
  ctx.fill();

  // Blue tie
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.moveTo(390, 810);
  ctx.lineTo(410, 810);
  ctx.lineTo(415, 960);
  ctx.lineTo(400, 990);
  ctx.lineTo(385, 960);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillStyle = '#f5c6a5';
  ctx.fillRect(360, 680, 80, 90);

  // Face
  ctx.fillStyle = '#fcd5b8';
  ctx.beginPath();
  ctx.ellipse(400, 520, 150, 190, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = '#27272a';
  ctx.beginPath();
  ctx.ellipse(400, 390, 155, 110, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(245, 390, 30, 90);
  ctx.fillRect(525, 390, 30, 90);

  // Eyebrows
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(320, 465);
  ctx.lineTo(370, 460);
  ctx.moveTo(430, 460);
  ctx.lineTo(480, 465);
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(345, 490, 20, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(455, 490, 20, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3f2212';
  ctx.beginPath();
  ctx.arc(345, 490, 9, 0, Math.PI * 2);
  ctx.arc(455, 490, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(345, 490, 4.5, 0, Math.PI * 2);
  ctx.arc(455, 490, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.strokeStyle = '#d49b74';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(400, 490);
  ctx.lineTo(395, 545);
  ctx.lineTo(410, 545);
  ctx.stroke();

  // Smile / Lips
  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(400, 575, 35, 0.15, Math.PI - 0.15);
  ctx.stroke();

  canvas.toBlob(blob => {
    if (blob) {
      processInputImage(new File([blob], 'demo-customer-portrait.png', { type: 'image/png' }));
    }
  }, 'image/png');
}

// -----------------------------------------------------------------------------
// Export & Download Actions
// -----------------------------------------------------------------------------

// 1. Direct High-DPI Print
function printSheetDirectly() {
  const sheetCanvas = renderPrintSheetCanvas();
  if (!sheetCanvas) return;

  const printContainer = $('printContainer');
  if (!printContainer) return;
  printContainer.innerHTML = '';

  const img = document.createElement('img');
  img.src = sheetCanvas.toDataURL('image/png');
  img.className = 'print-page-img';
  printContainer.appendChild(img);

  window.print();
}

// 2. Download A4 PDF using pdf-lib
async function downloadA4Pdf() {
  const sheetCanvas = renderPrintSheetCanvas();
  if (!sheetCanvas) return;

  setStatus('📄 Generating 300 DPI PDF…', 'loading');
  try {
    const pdfDoc = await PDFDocument.create();
    const paper = PAPER_PRESETS[state.paper] || PAPER_PRESETS['a4'];

    // Points in PDF: 72 points per inch. 1 mm = 72 / 25.4 = 2.8346 pt
    const ptW = paper.mmW * (72 / 25.4);
    const ptH = paper.mmH * (72 / 25.4);

    const page = pdfDoc.addPage([ptW, ptH]);
    const pngBytes = await new Promise(res => {
      sheetCanvas.toBlob(async b => {
        res(new Uint8Array(await b.arrayBuffer()));
      }, 'image/png');
    });

    const embeddedPng = await pdfDoc.embedPng(pngBytes);
    page.drawImage(embeddedPng, {
      x: 0,
      y: 0,
      width: ptW,
      height: ptH
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ANVI_Passport_${state.paper.toUpperCase()}_300DPI.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus('✓ PDF Downloaded successfully!', 'success');
  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Failed to create PDF: ' + err.message);
  }
}

// 3. Download Full Sheet PNG (300 DPI)
function downloadSheetPng() {
  const sheetCanvas = renderPrintSheetCanvas();
  if (!sheetCanvas) return;

  sheetCanvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ANVI_Passport_${state.paper.toUpperCase()}_300DPI.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus('✓ 300 DPI PNG Sheet Downloaded!', 'success');
  }, 'image/png');
}

// 4. Download Single Passport Photo (20-50 KB JPG for Online Application Forms)
function downloadSinglePassportPhoto() {
  const singleCanvas = renderSinglePassportPhoto();
  if (!singleCanvas) return;

  // Optimize JPEG quality to hit 20 KB - 50 KB range required by Govt forms
  let quality = 0.88;
  const tryExport = q => {
    return new Promise(res => {
      singleCanvas.toBlob(b => res(b), 'image/jpeg', q);
    });
  };

  (async () => {
    let blob = await tryExport(quality);
    if (blob.size > 50000 && quality > 0.6) {
      quality = 0.72;
      blob = await tryExport(quality);
    }
    if (blob.size > 50000 && quality > 0.45) {
      quality = 0.55;
      blob = await tryExport(quality);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const kb = (blob.size / 1024).toFixed(1);
    a.download = `${originalFileName}_passport_${kb}KB.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus(`✓ Single Photo Downloaded (${kb} KB - Online Form Ready)!`, 'success');
  })();
}

// -----------------------------------------------------------------------------
// UI Event Bindings
// -----------------------------------------------------------------------------
function setupEventListeners() {
  // File Dropzone
  const dropzone = $('dropzone');
  const fileInput = $('fileInput');
  const chooseBtn = $('chooseBtn');
  const sampleBtn = $('sampleBtn');
  const cameraBtn = $('cameraBtn');

  if (chooseBtn && fileInput) {
    chooseBtn.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        processInputImage(e.target.files[0]);
      }
    });
  }
  if (sampleBtn) {
    sampleBtn.addEventListener('click', loadDemoSample);
  }
  if (cameraBtn) {
    cameraBtn.addEventListener('click', openWebcamModal);
  }

  // Drag and Drop
  if (dropzone) {
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processInputImage(e.dataTransfer.files[0]);
      }
    });
    dropzone.addEventListener('click', e => {
      if (e.target !== chooseBtn && e.target !== sampleBtn && e.target !== cameraBtn) {
        fileInput.click();
      }
    });
  }

  // Camera Modal
  $('snapBtn')?.addEventListener('click', captureWebcamSnapshot);
  $('closeWebcamBtn')?.addEventListener('click', closeWebcamModal);

  // Background Color Selector
  document.querySelectorAll('input[name="bgColor"]').forEach(radio => {
    radio.addEventListener('change', e => {
      state.bgColorType = e.target.value;
      $('customColorWrap').hidden = state.bgColorType !== 'custom';
      updateLivePreviews();
    });
  });
  $('customColorPicker')?.addEventListener('input', e => {
    state.customBgColor = e.target.value;
    updateLivePreviews();
  });

  // Passport Size Preset
  $('presetSelect')?.addEventListener('change', e => {
    state.preset = e.target.value;
    const p = PHOTO_PRESETS[state.preset];
    if (p) {
      state.mmW = p.mmW;
      state.mmH = p.mmH;
      state.pxW = p.pxW;
      state.pxH = p.pxH;
      $('customDimWrap').hidden = state.preset !== 'custom';
    }
    updateLivePreviews();
  });

  // Framing Adjustments (Zoom, Pan, Rotate)
  const bindRange = (id, prop, isFloat = false) => {
    const el = $(id);
    const valEl = $(id + 'Val');
    if (!el) return;
    el.addEventListener('input', e => {
      state[prop] = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      if (valEl) valEl.textContent = e.target.value;
      updateLivePreviews();
    });
  };

  bindRange('zoomRange', 'zoom', true);
  bindRange('panXRange', 'panX');
  bindRange('panYRange', 'panY');
  bindRange('rotateRange', 'rotation');

  $('resetFramingBtn')?.addEventListener('click', () => {
    state.zoom = 1.0;
    state.panX = 0;
    state.panY = 0;
    state.rotation = 0;
    $('zoomRange').value = '1';
    $('zoomRangeVal').textContent = '1.0';
    $('panXRange').value = '0';
    $('panXRangeVal').textContent = '0';
    $('panYRange').value = '0';
    $('panYRangeVal').textContent = '0';
    $('rotateRange').value = '0';
    $('rotateRangeVal').textContent = '0°';
    updateLivePreviews();
  });

  // AI Enhancements (Brightness, Contrast, Saturation, Sharpness, Skin, Warmth)
  bindRange('brightnessRange', 'brightness');
  bindRange('contrastRange', 'contrast');
  bindRange('saturationRange', 'saturation');
  bindRange('sharpnessRange', 'sharpness');
  bindRange('skinSmoothRange', 'skinSmooth');
  bindRange('warmthRange', 'warmth');

  $('magicEnhanceBtn')?.addEventListener('click', () => {
    state.brightness = 6;
    state.contrast = 8;
    state.saturation = 6;
    state.sharpness = 55;
    state.skinSmooth = 35;
    state.warmth = 2;
    $('brightnessRange').value = '6';
    $('brightnessRangeVal').textContent = '+6';
    $('contrastRange').value = '8';
    $('contrastRangeVal').textContent = '+8';
    $('saturationRange').value = '6';
    $('saturationRangeVal').textContent = '+6';
    $('sharpnessRange').value = '55';
    $('sharpnessRangeVal').textContent = '55%';
    $('skinSmoothRange').value = '35';
    $('skinSmoothRangeVal').textContent = '35%';
    $('warmthRange').value = '2';
    $('warmthRangeVal').textContent = '+2';
    updateLivePreviews();
    setStatus('✨ AI Magic Studio Enhancement applied!', 'success');
  });

  $('resetEnhanceBtn')?.addEventListener('click', () => {
    state.brightness = 0;
    state.contrast = 0;
    state.saturation = 0;
    state.sharpness = 0;
    state.skinSmooth = 0;
    state.warmth = 0;
    $('brightnessRange').value = '0';
    $('brightnessRangeVal').textContent = '0';
    $('contrastRange').value = '0';
    $('contrastRangeVal').textContent = '0';
    $('saturationRange').value = '0';
    $('saturationRangeVal').textContent = '0';
    $('sharpnessRange').value = '0';
    $('sharpnessRangeVal').textContent = '0%';
    $('skinSmoothRange').value = '0';
    $('skinSmoothRangeVal').textContent = '0%';
    $('warmthRange').value = '0';
    $('warmthRangeVal').textContent = '0';
    updateLivePreviews();
  });

  // Name & Date on Photo
  $('nameDateCheck')?.addEventListener('change', e => {
    state.nameDateEnabled = e.target.checked;
    $('nameDateFields').hidden = !state.nameDateEnabled;
    updateLivePreviews();
  });
  $('candidateNameInput')?.addEventListener('input', e => {
    state.candidateName = e.target.value;
    updateLivePreviews();
  });
  $('photoDateInput')?.addEventListener('input', e => {
    state.photoDate = e.target.value;
    updateLivePreviews();
  });

  // Print Sheet Options
  $('paperSelect')?.addEventListener('change', e => {
    state.paper = e.target.value;
    updateLivePreviews();
  });
  $('photoCountSelect')?.addEventListener('change', e => {
    state.photoCount = parseInt(e.target.value, 10);
    updateLivePreviews();
  });
  $('borderSelect')?.addEventListener('change', e => {
    state.borderStyle = e.target.value;
    updateLivePreviews();
  });
  $('marginInput')?.addEventListener('input', e => {
    state.marginMm = parseFloat(e.target.value) || 0;
    updateLivePreviews();
  });
  $('gapInput')?.addEventListener('input', e => {
    state.gapMm = parseFloat(e.target.value) || 0;
    updateLivePreviews();
  });

  // Action Buttons
  $('printBtn')?.addEventListener('click', printSheetDirectly);
  $('pdfBtn')?.addEventListener('click', downloadA4Pdf);
  $('pngBtn')?.addEventListener('click', downloadSheetPng);
  $('singleBtn')?.addEventListener('click', downloadSinglePassportPhoto);
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setStatus('Upload a photo or capture via camera to start.', 'normal');
});
