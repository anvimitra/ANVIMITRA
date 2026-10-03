/**
 * ANVIMITRA - Easy Crop PVC Card Auto-Crop & Ready to Print Studio
 * Auto-crops Indian Government ID cards (Aadhaar, PAN, Voter, Ayushman, ABHA, etc.)
 * to standard CR80 PVC dimensions (85.6 x 54 mm), with Epson L8050 Tray Studio
 * and A4 Dragon Sheet (10 cards/sheet) layouts.
 */

// Preset coordinates (normalized 0 to 1 relative to source image width/height)
const CARD_PROFILES = {
  aadhaar: {
    name: "Aadhaar / Baal Aadhaar",
    front: { x: 0.075, y: 0.675, w: 0.415, h: 0.285 },
    back:  { x: 0.510, y: 0.675, w: 0.415, h: 0.285 }
  },
  "pan-nsdl": {
    name: "PAN Card (NSDL e-PAN)",
    front: { x: 0.080, y: 0.620, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.620, w: 0.410, h: 0.280 }
  },
  "pan-uti": {
    name: "PAN Card (UTIITSL)",
    front: { x: 0.080, y: 0.560, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.560, w: 0.410, h: 0.280 }
  },
  voter: {
    name: "Voter ID (e-EPIC)",
    front: { x: 0.075, y: 0.650, w: 0.415, h: 0.285 },
    back:  { x: 0.510, y: 0.650, w: 0.415, h: 0.285 }
  },
  ayushman: {
    name: "Ayushman Bharat (PM-JAY)",
    front: { x: 0.080, y: 0.540, w: 0.410, h: 0.285 },
    back:  { x: 0.510, y: 0.540, w: 0.410, h: 0.285 }
  },
  abha: {
    name: "ABHA Health Card",
    front: { x: 0.080, y: 0.520, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.520, w: 0.410, h: 0.280 }
  },
  ration: {
    name: "Ration Card (FOOD / NFSA)",
    front: { x: 0.065, y: 0.120, w: 0.420, h: 0.310 },
    back:  { x: 0.515, y: 0.120, w: 0.420, h: 0.310 }
  },
  eshram: {
    name: "e-Shram Card",
    front: { x: 0.080, y: 0.580, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.580, w: 0.410, h: 0.280 }
  },
  epfo: {
    name: "EPFO / UAN Card",
    front: { x: 0.080, y: 0.550, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.550, w: 0.410, h: 0.280 }
  },
  apaar: {
    name: "APAAR / ABC Student ID",
    front: { x: 0.080, y: 0.580, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.580, w: 0.410, h: 0.280 }
  },
  dl: {
    name: "Driving Licence / RC",
    front: { x: 0.080, y: 0.560, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.560, w: 0.410, h: 0.280 }
  },
  janaadhaar: {
    name: "Jan Aadhaar (Rajasthan)",
    front: { x: 0.080, y: 0.600, w: 0.410, h: 0.285 },
    back:  { x: 0.510, y: 0.600, w: 0.410, h: 0.285 }
  },
  custom: {
    name: "Custom / Manual",
    front: { x: 0.080, y: 0.650, w: 0.410, h: 0.280 },
    back:  { x: 0.510, y: 0.650, w: 0.410, h: 0.280 }
  }
};

// CR80 standard aspect ratio: 85.6 / 54.0 = 1.585185
const CR80_ASPECT = 85.6 / 54.0;

// State
let loadedSourceImage = null;
let currentProfile = "auto";
let frontBox = { ...CARD_PROFILES.aadhaar.front };
let backBox = { ...CARD_PROFILES.aadhaar.back };
let dragTarget = null; // 'front' | 'back' | handle
let dragHandle = null; // 'move' | 'nw' | 'ne' | 'se' | 'sw'
let dragStart = null;
let currentPdfData = null;
let pendingPasswordResolve = null;

// DOM elements
const $ = (id) => document.getElementById(id);

// Initialize when DOM ready
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupUpload();
  setupControls();
  setupEditorCanvas();
  setupOutputActions();
  setupTrayControls();
  setupDragonControls();
});

// -------------------------------------------------------------
// Tabs Switching
// -------------------------------------------------------------
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = `tab-${btn.dataset.tab}`;
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".tab-content").forEach((c) => {
        c.style.display = "none";
      });
      const targetContent = $(targetId);
      if (targetContent) {
        targetContent.style.display = "block";
      }

      // Refresh specific views when tab activated
      if (btn.dataset.tab === "epson-tray") {
        renderTraySimulation();
      } else if (btn.dataset.tab === "dragon-sheet") {
        renderDragonSheet();
      }
    });
  });
}

// -------------------------------------------------------------
// Upload Handling
// -------------------------------------------------------------
function setupUpload() {
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const chooseBtn = $("chooseBtn");
  const sampleAadhaarBtn = $("sampleAadhaarBtn");
  const samplePanBtn = $("samplePanBtn");

  chooseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => {
    if (e.target !== fileInput && !e.target.closest("button")) {
      fileInput.click();
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
    if (e.dataTransfer.files?.length) {
      handleIncomingFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files?.length) {
      handleIncomingFile(e.target.files[0]);
    }
  });

  sampleAadhaarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    loadDemoAadhaar();
  });

  samplePanBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    loadDemoPan();
  });

  // Password Modal
  $("passwordSubmitBtn").addEventListener("click", () => {
    const pwd = $("pdfPasswordInput").value.trim();
    if (pendingPasswordResolve) {
      pendingPasswordResolve(pwd);
      pendingPasswordResolve = null;
    }
    $("passwordModal").classList.remove("active");
  });

  $("passwordCancelBtn").addEventListener("click", () => {
    if (pendingPasswordResolve) {
      pendingPasswordResolve(null);
      pendingPasswordResolve = null;
    }
    $("passwordModal").classList.remove("active");
    setBarStatus("Cancelled", "Upload was cancelled.");
  });
}

// -------------------------------------------------------------
// File Processing
// -------------------------------------------------------------
async function handleIncomingFile(file) {
  setBarStatus("Reading file...", file.name, 20);

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    await processPdfBuffer(arrayBuffer, file.name);
  } else if (file.type.startsWith("image/")) {
    const img = new Image();
    img.onload = () => {
      loadedSourceImage = img;
      setBarStatus("Ready", `${file.name} (${img.width}×${img.height} px)`, 100);
      autoDetectProfile();
      renderAllViews();
    };
    img.src = URL.createObjectURL(file);
  } else {
    alert("Please select a PDF document or image file (JPG, PNG).");
  }
}

async function processPdfBuffer(buffer, fileName) {
  setBarStatus("Loading PDF pages...", fileName, 35);

  if (!window.pdfjsLib) {
    alert("PDF library is not loaded. Please check your internet connection.");
    return;
  }

  const loadingTask = window.pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
    cMapPacked: true
  });

  loadingTask.onPassword = (callback, reason) => {
    $("passwordModal").classList.add("active");
    $("pdfPasswordInput").value = "";
    $("pdfPasswordInput").focus();
    pendingPasswordResolve = (password) => {
      if (password) {
        callback(password);
      } else {
        callback("");
      }
    };
  };

  try {
    const pdf = await loadingTask.promise;
    setBarStatus("Rendering high-res page...", `${fileName} (${pdf.numPages} pages)`, 65);

    // Render Page 1 at high DPI (e.g. scale 2.5 for crispness)
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    // Optional text inspection for auto-detecting card type
    try {
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map((i) => i.str).join(" ").toLowerCase();
      detectProfileFromText(fullText);
    } catch {
      // Ignore text extraction errors
    }

    const img = new Image();
    img.onload = () => {
      loadedSourceImage = img;
      setBarStatus("Auto-crop ready", `${fileName} (Page 1)`, 100);
      applyProfileBoxes(currentProfile);
      renderAllViews();
    };
    img.src = canvas.toDataURL("image/png");
  } catch (err) {
    console.error("PDF load error:", err);
    if (err.name === "PasswordException") {
      alert("Incorrect PDF password. Please try again.");
    } else {
      alert("Failed to render PDF: " + (err.message || "Unknown error"));
    }
  }
}

function detectProfileFromText(text) {
  if (text.includes("uidai") || text.includes("aadhaar") || text.includes("mera aadhaar") || text.includes("unique identification")) {
    currentProfile = "aadhaar";
  } else if (text.includes("income tax department") || text.includes("permanent account number") || text.includes("nsdl")) {
    currentProfile = "pan-nsdl";
  } else if (text.includes("utisl") || text.includes("utiitsl")) {
    currentProfile = "pan-uti";
  } else if (text.includes("election commission") || text.includes("epic") || text.includes("voter")) {
    currentProfile = "voter";
  } else if (text.includes("pm-jay") || text.includes("ayushman") || text.includes("pradhan mantri jan arogya")) {
    currentProfile = "ayushman";
  } else if (text.includes("national health authority") || text.includes("abha") || text.includes("ayushman bharat health")) {
    currentProfile = "abha";
  } else if (text.includes("khadya") || text.includes("ration") || text.includes("food and civil supplies")) {
    currentProfile = "ration";
  } else if (text.includes("e-shram") || text.includes("eshram") || text.includes("ministry of labour")) {
    currentProfile = "eshram";
  } else if (text.includes("epfo") || text.includes("provident fund") || text.includes("uan")) {
    currentProfile = "epfo";
  } else if (text.includes("apaar") || text.includes("abc id") || text.includes("one nation one student")) {
    currentProfile = "apaar";
  } else if (text.includes("driving licence") || text.includes("sarathi") || text.includes("parivahan")) {
    currentProfile = "dl";
  } else if (text.includes("jan aadhaar") || text.includes("janaadhaar") || text.includes("rajasthan")) {
    currentProfile = "janaadhaar";
  } else {
    currentProfile = "aadhaar"; // Default
  }
  $("cardProfile").value = currentProfile;
}

function autoDetectProfile() {
  if ($("cardProfile").value === "auto") {
    currentProfile = "aadhaar";
  } else {
    currentProfile = $("cardProfile").value;
  }
  applyProfileBoxes(currentProfile);
}

function applyProfileBoxes(profileKey) {
  const profile = CARD_PROFILES[profileKey] || CARD_PROFILES.aadhaar;
  frontBox = { ...profile.front };
  backBox = { ...profile.back };
}

function setBarStatus(status, info, pct = 100) {
  $("statusBar").style.display = "flex";
  $("controlsSection").style.display = "block";
  $("statusText").textContent = status;
  $("docInfoText").textContent = info;
  $("progressBar").style.width = `${pct}%`;
}

// -------------------------------------------------------------
// Interactive Source Canvas & Box Dragging
// -------------------------------------------------------------
function setupEditorCanvas() {
  const canvas = $("sourceCanvas");

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
}

function getCanvasPointer(e) {
  const canvas = $("sourceCanvas");
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  // Normalized 0 to 1
  return {
    nx: Math.max(0, Math.min(1, px / canvas.width)),
    ny: Math.max(0, Math.min(1, py / canvas.height)),
    px,
    py
  };
}

function handlePointerDown(e) {
  if (!loadedSourceImage) return;
  const pt = getCanvasPointer(e);
  const canvas = $("sourceCanvas");

  // Check handles or inside of front / back boxes
  const frontPx = toPixelBox(frontBox, canvas.width, canvas.height);
  const backPx = toPixelBox(backBox, canvas.width, canvas.height);

  // Check front handles
  const frontHandle = getBoxHit(pt.px, pt.py, frontPx);
  if (frontHandle) {
    dragTarget = "front";
    dragHandle = frontHandle;
    dragStart = { ...pt, box: { ...frontBox } };
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  // Check back handles
  const backHandle = getBoxHit(pt.px, pt.py, backPx);
  if (backHandle) {
    dragTarget = "back";
    dragHandle = backHandle;
    dragStart = { ...pt, box: { ...backBox } };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
}

function getBoxHit(x, y, boxPx) {
  const tol = 16;
  const { x: bx, y: by, w: bw, h: bh } = boxPx;

  // Corners
  if (Math.hypot(x - bx, y - by) < tol) return "nw";
  if (Math.hypot(x - (bx + bw), y - by) < tol) return "ne";
  if (Math.hypot(x - (bx + bw), y - (by + bh)) < tol) return "se";
  if (Math.hypot(x - bx, y - (by + bh)) < tol) return "sw";

  // Inside box -> move
  if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
    return "move";
  }

  return null;
}

function handlePointerMove(e) {
  if (!dragTarget || !dragStart || !loadedSourceImage) return;
  const pt = getCanvasPointer(e);
  const dx = pt.nx - dragStart.nx;
  const dy = pt.ny - dragStart.ny;
  const cur = dragTarget === "front" ? frontBox : backBox;
  const orig = dragStart.box;

  if (dragHandle === "move") {
    cur.x = Math.max(0, Math.min(1 - orig.w, orig.x + dx));
    cur.y = Math.max(0, Math.min(1 - orig.h, orig.y + dy));
  } else if (dragHandle === "se") {
    cur.w = Math.max(0.05, Math.min(1 - orig.x, orig.w + dx));
    cur.h = Math.max(0.03, Math.min(1 - orig.y, orig.h + dy));
  } else if (dragHandle === "sw") {
    const newX = Math.max(0, Math.min(orig.x + orig.w - 0.05, orig.x + dx));
    cur.w = orig.x + orig.w - newX;
    cur.x = newX;
    cur.h = Math.max(0.03, Math.min(1 - orig.y, orig.h + dy));
  } else if (dragHandle === "ne") {
    cur.w = Math.max(0.05, Math.min(1 - orig.x, orig.w + dx));
    const newY = Math.max(0, Math.min(orig.y + orig.h - 0.03, orig.y + dy));
    cur.h = orig.y + orig.h - newY;
    cur.y = newY;
  } else if (dragHandle === "nw") {
    const newX = Math.max(0, Math.min(orig.x + orig.w - 0.05, orig.x + dx));
    const newY = Math.max(0, Math.min(orig.y + orig.h - 0.03, orig.y + dy));
    cur.w = orig.x + orig.w - newX;
    cur.h = orig.y + orig.h - newY;
    cur.x = newX;
    cur.y = newY;
  }

  drawSourceCanvas();
  renderCards();
}

function handlePointerUp() {
  dragTarget = null;
  dragHandle = null;
  dragStart = null;
  renderAllViews();
}

function toPixelBox(normBox, cw, ch) {
  return {
    x: normBox.x * cw,
    y: normBox.y * ch,
    w: normBox.w * cw,
    h: normBox.h * ch
  };
}

function drawSourceCanvas() {
  const canvas = $("sourceCanvas");
  if (!loadedSourceImage) return;

  const ctx = canvas.getContext("2d");
  const cw = loadedSourceImage.width;
  const ch = loadedSourceImage.height;
  canvas.width = cw;
  canvas.height = ch;

  // Draw base image
  ctx.drawImage(loadedSourceImage, 0, 0);

  // Dark overlay
  ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
  ctx.fillRect(0, 0, cw, ch);

  // Clear front and back cutouts
  const fPx = toPixelBox(frontBox, cw, ch);
  const bPx = toPixelBox(backBox, cw, ch);

  ctx.save();
  ctx.beginPath();
  ctx.rect(fPx.x, fPx.y, fPx.w, fPx.h);
  ctx.rect(bPx.x, bPx.y, bPx.w, bPx.h);
  ctx.clip();
  ctx.drawImage(loadedSourceImage, 0, 0);
  ctx.restore();

  // Draw Front outline & handles (Green)
  drawBoxOverlay(ctx, fPx, "#16a34a", "FRONT (आगे)");

  // Draw Back outline & handles (Blue)
  drawBoxOverlay(ctx, bPx, "#2563eb", "BACK (पीछे)");
}

function drawBoxOverlay(ctx, box, color, label) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.setLineDash([]);

  // Corner Handles
  const r = 10;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h }
  ];

  corners.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Label badge
  ctx.fillStyle = color;
  ctx.fillRect(box.x, Math.max(0, box.y - 28), 120, 26);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.fillText(label, box.x + 8, Math.max(18, box.y - 10));

  ctx.restore();
}

// -------------------------------------------------------------
// Live Cut Card Rendering (CR80 PVC: 85.6 × 54.0 mm)
// -------------------------------------------------------------
function renderCards() {
  if (!loadedSourceImage) return;

  const dpi = parseInt($("dpiSelect").value, 10) || 300;
  // Exact standard CR80 at dpi:
  // 85.6 mm = 3.37008 inches -> at 300 DPI = ~1011 px
  // 54.0 mm = 2.12598 inches -> at 300 DPI = ~638 px
  const cardW = Math.round((85.60 / 25.4) * dpi);
  const cardH = Math.round((54.00 / 25.4) * dpi);

  renderSingleCard($("frontCanvas"), frontBox, cardW, cardH);
  renderSingleCard($("backCanvas"), backBox, cardW, cardH);
}

function renderSingleCard(canvas, normBox, targetW, targetH) {
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { alpha: false });

  // Pure white base
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);

  const sw = loadedSourceImage.width;
  const sh = loadedSourceImage.height;
  const sx = normBox.x * sw;
  const sy = normBox.y * sh;
  const sBoxW = normBox.w * sw;
  const sBoxH = normBox.h * sh;

  // Filters (Brightness, Contrast)
  const bright = $("brightSlider").value;
  const contrast = $("contrastSlider").value;
  ctx.filter = `brightness(${bright}%) contrast(${contrast}%)`;

  // Draw cropped section stretched to exact CR80 target
  ctx.drawImage(loadedSourceImage, sx, sy, sBoxW, sBoxH, 0, 0, targetW, targetH);
  ctx.filter = "none";

  // Border Frame
  const frameMode = $("borderFrameSelect").value;
  if (frameMode === "thin-black") {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = Math.max(1, Math.round(targetW * 0.002));
    ctx.strokeRect(0, 0, targetW, targetH);
  } else if (frameMode === "round-corners") {
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = Math.max(1, Math.round(targetW * 0.002));
    drawRoundedRect(ctx, 0, 0, targetW, targetH, Math.round(targetW * 0.038));
    ctx.stroke();
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderAllViews() {
  drawSourceCanvas();
  renderCards();
  renderTraySimulation();
  renderDragonSheet();
}

// -------------------------------------------------------------
// Setup Controls
// -------------------------------------------------------------
function setupControls() {
  $("cardProfile").addEventListener("change", () => {
    autoDetectProfile();
    renderAllViews();
  });

  $("dpiSelect").addEventListener("change", renderAllViews);
  $("bleedSelect").addEventListener("change", renderAllViews);
  $("borderFrameSelect").addEventListener("change", renderAllViews);

  $("brightSlider").addEventListener("input", (e) => {
    $("brightVal").textContent = e.target.value;
    renderAllViews();
  });

  $("contrastSlider").addEventListener("input", (e) => {
    $("contrastVal").textContent = e.target.value;
    renderAllViews();
  });

  $("reCropBtn").addEventListener("click", () => {
    autoDetectProfile();
    renderAllViews();
  });

  $("swapBtn").addEventListener("click", () => {
    const temp = { ...frontBox };
    frontBox = { ...backBox };
    backBox = temp;
    renderAllViews();
  });

  $("rotateBtn").addEventListener("click", () => {
    rotateSource90();
  });

  $("resetCropBoxesBtn").addEventListener("click", () => {
    applyProfileBoxes($("cardProfile").value);
    renderAllViews();
  });
}

function rotateSource90() {
  if (!loadedSourceImage) return;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = loadedSourceImage.height;
  tempCanvas.height = loadedSourceImage.width;
  const ctx = tempCanvas.getContext("2d");
  ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
  ctx.rotate((90 * Math.PI) / 180);
  ctx.drawImage(loadedSourceImage, -loadedSourceImage.width / 2, -loadedSourceImage.height / 2);

  const img = new Image();
  img.onload = () => {
    loadedSourceImage = img;
    applyProfileBoxes($("cardProfile").value);
    renderAllViews();
  };
  img.src = tempCanvas.toDataURL("image/png");
}

// -------------------------------------------------------------
// Epson L8050 Tray Simulation & Studio
// -------------------------------------------------------------
function setupTrayControls() {
  ["trayModeSelect", "trayShiftX", "trayShiftY", "trayGap", "trayFlipBack", "traySlotReverse"].forEach((id) => {
    $(id)?.addEventListener("change", renderTraySimulation);
    $(id)?.addEventListener("input", renderTraySimulation);
  });

  $("printTrayBtn").addEventListener("click", () => {
    $("tab-epson-tray").style.display = "block";
    document.querySelector('[data-tab="epson-tray"]').click();
    printTrayDirect();
  });

  $("directTrayPrintBtn").addEventListener("click", printTrayDirect);
  $("downloadTrayPdfBtn").addEventListener("click", downloadTrayPdf);
}

function renderTraySimulation() {
  const canvas = $("trayCanvas");
  const ctx = canvas.getContext("2d");

  // Tray physical dimension in mm (approx standard Epson ID Tray 120 mm wide x 240 mm tall)
  const trayW_mm = 130;
  const trayH_mm = 240;
  const scale = 3; // px per mm for preview
  canvas.width = Math.round(trayW_mm * scale);
  canvas.height = Math.round(trayH_mm * scale);

  // Draw Tray Bed
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border & notch
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Tray feed arrow
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("▲ INSERT TRAY THIS WAY INTO EPSON L8050 ▲", canvas.width / 2, 28);

  const shiftX = (parseFloat($("trayShiftX").value) || 0) * scale;
  const shiftY = (parseFloat($("trayShiftY").value) || 0) * scale;
  const gap = (parseFloat($("trayGap").value) || 2.5) * scale;
  const flipBack = $("trayFlipBack").checked;
  const slotReverse = $("traySlotReverse").checked;

  const cardW_px = 85.60 * scale;
  const cardH_px = 54.00 * scale;
  const cardX = (canvas.width - cardW_px) / 2 + shiftX;

  // Slot 1 (Top)
  const slot1_Y = 46 * scale + shiftY;
  // Slot 2 (Bottom)
  const slot2_Y = slot1_Y + cardH_px + gap;

  const mode = $("trayModeSelect").value;
  const frontCanvas = $("frontCanvas");
  const backCanvas = $("backCanvas");

  // Draw Slot 1 Slot Holder
  drawTraySlotPocket(ctx, cardX, slot1_Y, cardW_px, cardH_px, slotReverse ? "SLOT 2" : "SLOT 1");
  // Draw Slot 2 Slot Holder
  drawTraySlotPocket(ctx, cardX, slot2_Y, cardW_px, cardH_px, slotReverse ? "SLOT 1" : "SLOT 2");

  if (!frontCanvas.width || !backCanvas.width) return;

  // Slot 1 Image
  if (mode === "both" || mode === "two-fronts" || mode === "front-only") {
    ctx.save();
    ctx.drawImage(frontCanvas, cardX, slot1_Y, cardW_px, cardH_px);
    ctx.restore();
  }

  // Slot 2 Image
  if (mode === "both") {
    ctx.save();
    if (flipBack) {
      ctx.translate(cardX + cardW_px / 2, slot2_Y + cardH_px / 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(backCanvas, -cardW_px / 2, -cardH_px / 2, cardW_px, cardH_px);
    } else {
      ctx.drawImage(backCanvas, cardX, slot2_Y, cardW_px, cardH_px);
    }
    ctx.restore();
  } else if (mode === "two-fronts") {
    ctx.drawImage(frontCanvas, cardX, slot2_Y, cardW_px, cardH_px);
  } else if (mode === "two-backs") {
    ctx.drawImage(backCanvas, cardX, slot1_Y, cardW_px, cardH_px);
    ctx.drawImage(backCanvas, cardX, slot2_Y, cardW_px, cardH_px);
  }
}

function drawTraySlotPocket(ctx, x, y, w, h, label) {
  ctx.save();
  ctx.fillStyle = "#0f172a";
  drawRoundedRect(ctx, x - 2, y - 2, w + 4, h + 4, 10);
  ctx.fill();

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "bold 14px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

function printTrayDirect() {
  const trayCanvas = $("trayCanvas");
  if (!trayCanvas || !trayCanvas.width) return;

  const printContainer = $("printContainer");
  printContainer.innerHTML = "";
  const img = document.createElement("img");
  img.src = trayCanvas.toDataURL("image/png");
  img.className = "print-page-canvas";
  printContainer.appendChild(img);

  window.print();
}

function downloadTrayPdf() {
  const trayCanvas = $("trayCanvas");
  if (!window.jspdf || !trayCanvas) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [130, 240]
  });

  const imgData = trayCanvas.toDataURL("image/jpeg", 0.98);
  doc.addImage(imgData, "JPEG", 0, 0, 130, 240, undefined, "FAST");
  doc.save("ANVI-Epson-L8050-Tray-Print.pdf");
}

// -------------------------------------------------------------
// Dragon Sheet (A4 10-Card Layout)
// -------------------------------------------------------------
function setupDragonControls() {
  ["dragonLayoutSelect", "dragonCutStyle", "dragonMarginX", "dragonMarginY"].forEach((id) => {
    $(id)?.addEventListener("change", renderDragonSheet);
    $(id)?.addEventListener("input", renderDragonSheet);
  });

  $("printDragonBtn").addEventListener("click", () => {
    $("tab-dragon-sheet").style.display = "block";
    document.querySelector('[data-tab="dragon-sheet"]').click();
    printDragonDirect();
  });

  $("printDragonDirectBtn").addEventListener("click", printDragonDirect);
  $("downloadDragonPdfBtn").addEventListener("click", downloadDragonPdf);
}

function renderDragonSheet() {
  const canvas = $("dragonCanvas");
  const ctx = canvas.getContext("2d");

  // A4 dimensions: 210 x 297 mm
  const a4W_mm = 210;
  const a4H_mm = 297;
  const dpiScale = 2.5; // for canvas rendering preview
  canvas.width = Math.round(a4W_mm * dpiScale);
  canvas.height = Math.round(a4H_mm * dpiScale);

  // Pure white A4 page
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const frontCanvas = $("frontCanvas");
  const backCanvas = $("backCanvas");
  if (!frontCanvas.width || !backCanvas.width) return;

  const layout = $("dragonLayoutSelect").value;
  const cutStyle = $("dragonCutStyle").value;
  const marginX_mm = parseFloat($("dragonMarginX").value) || 14;
  const marginY_mm = parseFloat($("dragonMarginY").value) || 10;

  const cardW_mm = 85.60;
  const cardH_mm = 54.00;
  const cardW_px = cardW_mm * dpiScale;
  const cardH_px = cardH_mm * dpiScale;

  // Single set mode
  if (layout === "single-set") {
    const y_px = marginY_mm * dpiScale;
    const x1_px = marginX_mm * dpiScale;
    const x2_px = x1_px + cardW_px + 8 * dpiScale;

    ctx.drawImage(frontCanvas, x1_px, y_px, cardW_px, cardH_px);
    ctx.drawImage(backCanvas, x2_px, y_px, cardW_px, cardH_px);

    if (cutStyle === "corner-ticks") {
      drawCutTicks(ctx, x1_px, y_px, cardW_px, cardH_px);
      drawCutTicks(ctx, x2_px, y_px, cardW_px, cardH_px);
    }
    return;
  }

  // 10 Cards Layout: 2 Columns x 5 Rows
  const colGap_mm = (a4W_mm - (2 * marginX_mm) - (2 * cardW_mm));
  const rowGap_mm = (a4H_mm - (2 * marginY_mm) - (5 * cardH_mm)) / 4;

  const colGap_px = colGap_mm * dpiScale;
  const rowGap_px = rowGap_mm * dpiScale;

  for (let r = 0; r < 5; r++) {
    const y = (marginY_mm * dpiScale) + r * (cardH_px + rowGap_px);

    // Col 1 (Left)
    const x1 = marginX_mm * dpiScale;
    let card1Img = frontCanvas;
    if (layout === "all-backs") card1Img = backCanvas;

    ctx.drawImage(card1Img, x1, y, cardW_px, cardH_px);
    if (cutStyle === "corner-ticks") drawCutTicks(ctx, x1, y, cardW_px, cardH_px);

    // Col 2 (Right)
    const x2 = x1 + cardW_px + colGap_px;
    let card2Img = backCanvas;
    if (layout === "all-fronts") card2Img = frontCanvas;

    ctx.drawImage(card2Img, x2, y, cardW_px, cardH_px);
    if (cutStyle === "corner-ticks") drawCutTicks(ctx, x2, y, cardW_px, cardH_px);
  }
}

function drawCutTicks(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  const t = 12;

  // NW
  ctx.beginPath();
  ctx.moveTo(x - t, y); ctx.lineTo(x, y); ctx.lineTo(x, y - t);
  ctx.stroke();

  // NE
  ctx.beginPath();
  ctx.moveTo(x + w + t, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - t);
  ctx.stroke();

  // SE
  ctx.beginPath();
  ctx.moveTo(x + w + t, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h + t);
  ctx.stroke();

  // SW
  ctx.beginPath();
  ctx.moveTo(x - t, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h + t);
  ctx.stroke();

  ctx.restore();
}

function printDragonDirect() {
  const dragonCanvas = $("dragonCanvas");
  if (!dragonCanvas || !dragonCanvas.width) return;

  const printContainer = $("printContainer");
  printContainer.innerHTML = "";
  const img = document.createElement("img");
  img.src = dragonCanvas.toDataURL("image/png");
  img.className = "print-page-canvas";
  printContainer.appendChild(img);

  window.print();
}

function downloadDragonPdf() {
  const dragonCanvas = $("dragonCanvas");
  if (!window.jspdf || !dragonCanvas) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const imgData = dragonCanvas.toDataURL("image/jpeg", 0.98);
  doc.addImage(imgData, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  doc.save("ANVI-Dragon-Sheet-10-Cards-A4.pdf");
}

// -------------------------------------------------------------
// Output & Download Handlers
// -------------------------------------------------------------
function setupOutputActions() {
  $("dlFrontBtn").addEventListener("click", () => {
    downloadCanvas($("frontCanvas"), "PVC-Card-Front.png");
  });

  $("dlBackBtn").addEventListener("click", () => {
    downloadCanvas($("backCanvas"), "PVC-Card-Back.png");
  });

  $("downloadPdfBtn").addEventListener("click", () => {
    downloadDragonPdf();
  });

  $("downloadPngZipBtn").addEventListener("click", () => {
    downloadCanvas($("frontCanvas"), "PVC-Card-Front.png");
    setTimeout(() => {
      downloadCanvas($("backCanvas"), "PVC-Card-Back.png");
    }, 400);
  });
}

function downloadCanvas(canvas, filename) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

// -------------------------------------------------------------
// Demo Card Generators
// -------------------------------------------------------------
function loadDemoAadhaar() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1697; // A4 ratio
  const ctx = canvas.getContext("2d");

  // A4 background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // UIDAI Header & letters
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(80, 80, 1040, 30);
  ctx.fillRect(80, 140, 500, 20);
  ctx.fillRect(80, 180, 800, 15);
  ctx.fillRect(80, 210, 750, 15);

  // Lower Aadhaar Card Section Cutout
  const cardY = 1140;
  const cardH = 480;
  const cardW = 500;

  // Front Card (Left)
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  ctx.strokeRect(80, cardY, cardW, cardH);

  ctx.fillStyle = "#fee2e2";
  ctx.fillRect(85, cardY + 5, cardW - 10, 50);
  ctx.fillStyle = "#b91c1c";
  ctx.font = "bold 20px Arial";
  ctx.fillText("भारत सरकार / Government of India", 110, cardY + 38);

  // Photo
  ctx.fillStyle = "#0284c7";
  ctx.fillRect(110, cardY + 80, 120, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Arial";
  ctx.fillText("PHOTO", 140, cardY + 160);

  // Details
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px Arial";
  ctx.fillText("अनिता शर्मा / Anita Sharma", 250, cardY + 110);
  ctx.font = "17px Arial";
  ctx.fillText("DOB: 15/08/1995", 250, cardY + 145);
  ctx.fillText("महिला / Female", 250, cardY + 175);

  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 30px Arial";
  ctx.fillText("XXXX XXXX 1234", 170, cardY + 300);

  // Back Card (Right)
  ctx.strokeRect(620, cardY, cardW, cardH);
  ctx.fillStyle = "#fee2e2";
  ctx.fillRect(625, cardY + 5, cardW - 10, 50);
  ctx.fillStyle = "#b91c1c";
  ctx.font = "bold 20px Arial";
  ctx.fillText("विशिष्ट पहचान प्राधिकरण / UIDAI", 650, cardY + 38);

  ctx.fillStyle = "#0f172a";
  ctx.font = "16px Arial";
  ctx.fillText("पता: ग्राम व पोस्ट - सांवरा, जिला - जयपुर,", 650, cardY + 100);
  ctx.fillText("राजस्थान - 302001", 650, cardY + 130);

  // QR Code
  ctx.fillStyle = "#000000";
  ctx.fillRect(940, cardY + 80, 150, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Arial";
  ctx.fillText("QR CODE", 975, cardY + 160);

  const img = new Image();
  img.onload = () => {
    loadedSourceImage = img;
    currentProfile = "aadhaar";
    $("cardProfile").value = "aadhaar";
    applyProfileBoxes("aadhaar");
    setBarStatus("Demo Aadhaar Ready", "Sample Document (1200×1697 px)", 100);
    renderAllViews();
  };
  img.src = canvas.toDataURL("image/png");
}

function loadDemoPan() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1697;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(80, 60, 1040, 20);
  ctx.fillRect(80, 100, 600, 15);

  const cardY = 1050;
  const cardW = 500;
  const cardH = 470;

  // Front PAN
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 3;
  ctx.strokeRect(80, cardY, cardW, cardH);
  ctx.fillStyle = "#f0fdf4";
  ctx.fillRect(85, cardY + 5, cardW - 10, 60);

  ctx.fillStyle = "#15803d";
  ctx.font = "bold 19px Arial";
  ctx.fillText("आयकर विभाग / INCOME TAX DEPARTMENT", 100, cardY + 40);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 24px Arial";
  ctx.fillText("ABCDE1234F", 200, cardY + 130);
  ctx.font = "18px Arial";
  ctx.fillText("Name: RAHUL KUMAR", 120, cardY + 190);
  ctx.fillText("Father's Name: SURESH KUMAR", 120, cardY + 230);
  ctx.fillText("DOB: 01/01/1990", 120, cardY + 270);

  // Back PAN
  ctx.strokeRect(620, cardY, cardW, cardH);
  ctx.fillStyle = "#000000";
  ctx.fillRect(780, cardY + 120, 180, 180);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Arial";
  ctx.fillText("PAN QR CODE", 810, cardY + 215);

  const img = new Image();
  img.onload = () => {
    loadedSourceImage = img;
    currentProfile = "pan-nsdl";
    $("cardProfile").value = "pan-nsdl";
    applyProfileBoxes("pan-nsdl");
    setBarStatus("Demo PAN Card Ready", "Sample Document (1200×1697 px)", 100);
    renderAllViews();
  };
  img.src = canvas.toDataURL("image/png");
}
