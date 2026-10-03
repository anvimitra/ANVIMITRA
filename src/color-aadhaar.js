/**
 * ANVIMITRA - Color Aadhaar Instant 2.0 Engine
 * Converts e-Aadhaar PDFs into vibrant HD Color PVC Cards (CR80: 85.6 x 54.0 mm)
 * Supports Direct Epson L8050 Card Tray Printing, A4 Dragon Sheet & 4x6 Photo Paper
 */

// State
let loadedPdfDoc = null;
let sourcePageCanvas = null;
let extractedPhotoImg = null;
let extractedQrImg = null;
let currentTheme = "tricolor";
let activeDpi = 600;
let pendingPasswordResolve = null;

let cardData = {
  nameEn: "ANITA SHARMA",
  nameHi: "अनिता शर्मा",
  dob: "15/08/1995",
  gender: "महिला / Female",
  aadhaarNo: "XXXX XXXX 1234",
  addressEn: "W/O Rajesh Sharma, House No. 42, Sanwara, Ward No. 5, Jaipur, Rajasthan - 302001",
  addressHi: "पत्नी: राजेश शर्मा, मकान नं. 42, सांवरा, वार्ड नं. 5, जयपुर, राजस्थान - 302001"
};

// DOM helper
const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupUpload();
  setupControls();
  setupTrayControls();
  setupSheetControls();
  setupOutputActions();
});

// -------------------------------------------------------------
// Tabs Setup
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
      if (targetContent) targetContent.style.display = "block";

      if (btn.dataset.tab === "epson-tray") {
        renderTraySimulation();
      } else if (btn.dataset.tab === "dragon-sheet") {
        renderSheetSimulation();
      }
    });
  });
}

// -------------------------------------------------------------
// Upload & PDF Password Handling
// -------------------------------------------------------------
function setupUpload() {
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const chooseBtn = $("chooseBtn");
  const sampleBtn = $("sampleAadhaarBtn");

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

  // Paste support (Ctrl + V)
  window.addEventListener("paste", (e) => {
    if (e.clipboardData?.files?.length) {
      handleIncomingFile(e.clipboardData.files[0]);
    }
  });

  sampleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    loadDemoColorAadhaar();
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
  });
}

async function handleIncomingFile(file) {
  setStatusBar("Reading e-Aadhaar...", file.name, 25);

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const buffer = await file.arrayBuffer();
    await processAadhaarPdf(buffer, file.name);
  } else if (file.type.startsWith("image/")) {
    const img = new Image();
    img.onload = () => {
      processAadhaarImage(img, file.name);
    };
    img.src = URL.createObjectURL(file);
  } else {
    alert("Please upload a valid e-Aadhaar PDF or image file.");
  }
}

async function processAadhaarPdf(buffer, fileName) {
  setStatusBar("Decrypting PDF...", fileName, 40);

  if (!window.pdfjsLib) {
    alert("PDF library not loaded.");
    return;
  }

  const loadingTask = window.pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
    cMapPacked: true
  });

  loadingTask.onPassword = (callback) => {
    $("passwordModal").classList.add("active");
    $("pdfPasswordInput").value = "";
    $("pdfPasswordInput").focus();
    pendingPasswordResolve = (password) => {
      callback(password || "");
    };
  };

  try {
    const pdf = await loadingTask.promise;
    setStatusBar("Rendering high-res document...", `${fileName} (${pdf.numPages} pages)`, 65);

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    sourcePageCanvas = canvas;

    // Extract text details
    try {
      const textContent = await page.getTextContent();
      parseAadhaarText(textContent.items.map((i) => i.str).join("\n"));
    } catch (e) {
      console.warn("Text extract error:", e);
    }

    // Extract Photo and QR Code from standard bottom Aadhaar layout
    extractCardPartsFromPage(canvas);

    setStatusBar("Color Aadhaar Ready!", `${fileName} (Processed)`, 100);
    renderColorCards();
  } catch (err) {
    console.error("PDF error:", err);
    if (err.name === "PasswordException") {
      alert("Incorrect password. Aadhaar password is first 4 letters of name in CAPITAL + year of birth (e.g. ANVI1995).");
    } else {
      alert("Error reading PDF: " + (err.message || "Failed to parse."));
    }
  }
}

function processAadhaarImage(img, fileName) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  sourcePageCanvas = canvas;

  extractCardPartsFromPage(canvas);
  setStatusBar("Color Aadhaar Ready!", fileName, 100);
  renderColorCards();
}

function parseAadhaarText(rawText) {
  // Regex parsing for Aadhaar number
  const aadhaarMatch = rawText.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
  if (aadhaarMatch) cardData.aadhaarNo = aadhaarMatch[0];

  // DOB match
  const dobMatch = rawText.match(/(?:DOB|जन्म तारीख|जन्म तिथि)[:\s]+(\d{2}\/\d{2}\/\d{4}|\d{4})/i);
  if (dobMatch) cardData.dob = dobMatch[1];

  // Gender match
  if (/महिला|FEMALE/i.test(rawText)) cardData.gender = "महिला / Female";
  else if (/पुरुष|MALE/i.test(rawText)) cardData.gender = "पुरुष / Male";

  // Name heuristic (look for lines above DOB or near Government of India)
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const dobIdx = lines.findIndex((l) => /DOB|जन्म/i.test(l));
  if (dobIdx > 0) {
    cardData.nameEn = lines[dobIdx - 1] || cardData.nameEn;
    if (dobIdx > 1) cardData.nameHi = lines[dobIdx - 2] || cardData.nameHi;
  }

  // Address heuristic (look for "Address:" or "पता:")
  const addrIdx = lines.findIndex((l) => /Address|पता/i.test(l));
  if (addrIdx >= 0) {
    const addrLines = lines.slice(addrIdx + 1, addrIdx + 6).join(", ");
    if (addrLines.length > 10) cardData.addressEn = addrLines;
  }

  syncFormInputs();
}

function syncFormInputs() {
  $("inputNameEn").value = cardData.nameEn;
  $("inputNameHi").value = cardData.nameHi;
  $("inputDob").value = cardData.dob;
  $("inputGender").value = cardData.gender;
  $("inputAadhaarNo").value = cardData.aadhaarNo;
  $("inputAddress").value = cardData.addressEn;
}

function extractCardPartsFromPage(pageCanvas) {
  const pw = pageCanvas.width;
  const ph = pageCanvas.height;

  // Standard bottom card location in UIDAI e-Aadhaar
  // Front Photo is typically at X: ~9% to 19%, Y: ~72% to 84%
  const photoCanvas = document.createElement("canvas");
  const photoW = Math.round(pw * 0.11);
  const photoH = Math.round(ph * 0.11);
  photoCanvas.width = photoW;
  photoCanvas.height = photoH;
  const pCtx = photoCanvas.getContext("2d");
  pCtx.drawImage(pageCanvas, pw * 0.09, ph * 0.72, photoW, photoH, 0, 0, photoW, photoH);

  const pImg = new Image();
  pImg.onload = () => {
    extractedPhotoImg = pImg;
    renderColorCards();
  };
  pImg.src = photoCanvas.toDataURL("image/png");

  // QR Code is typically on back card right side at X: ~78% to 91%, Y: ~72% to 84%
  const qrCanvas = document.createElement("canvas");
  const qrSize = Math.round(pw * 0.13);
  qrCanvas.width = qrSize;
  qrCanvas.height = qrSize;
  const qCtx = qrCanvas.getContext("2d");
  qCtx.drawImage(pageCanvas, pw * 0.78, ph * 0.72, qrSize, qrSize, 0, 0, qrSize, qrSize);

  const qImg = new Image();
  qImg.onload = () => {
    extractedQrImg = qImg;
    renderColorCards();
  };
  qImg.src = qrCanvas.toDataURL("image/png");
}

function setStatusBar(status, info, pct) {
  $("statusBar").style.display = "flex";
  $("controlsSection").style.display = "block";
  $("statusText").textContent = status;
  $("docInfoText").textContent = info;
  $("progressBar").style.width = `${pct}%`;
}

// -------------------------------------------------------------
// Live Controls
// -------------------------------------------------------------
function setupControls() {
  ["themeSelect", "dpiSelect", "numStyleSelect", "ghostSelect"].forEach((id) => {
    $(id).addEventListener("change", () => {
      currentTheme = $("themeSelect").value;
      activeDpi = parseInt($("dpiSelect").value, 10) || 600;
      renderColorCards();
    });
  });

  $("brightSlider").addEventListener("input", (e) => {
    $("brightVal").textContent = e.target.value;
    renderColorCards();
  });

  $("contrastSlider").addEventListener("input", (e) => {
    $("contrastVal").textContent = e.target.value;
    renderColorCards();
  });

  // Metadata form live inputs
  ["inputNameEn", "inputNameHi", "inputDob", "inputGender", "inputAadhaarNo", "inputAddress"].forEach((id) => {
    $(id).addEventListener("input", () => {
      cardData.nameEn = $("inputNameEn").value;
      cardData.nameHi = $("inputNameHi").value;
      cardData.dob = $("inputDob").value;
      cardData.gender = $("inputGender").value;
      cardData.aadhaarNo = $("inputAadhaarNo").value;
      cardData.addressEn = $("inputAddress").value;
      renderColorCards();
    });
  });
}

// -------------------------------------------------------------
// High-Resolution Color Card Rendering (CR80: 85.6 × 54.0 mm)
// -------------------------------------------------------------
function renderColorCards() {
  const fCanvas = $("frontCanvas");
  const bCanvas = $("backCanvas");

  // At 600 DPI: 2022 x 1276 px. At 300 DPI: 1011 x 638 px
  const W = activeDpi === 600 ? 2022 : 1011;
  const H = activeDpi === 600 ? 1276 : 638;

  fCanvas.width = W;
  fCanvas.height = H;
  bCanvas.width = W;
  bCanvas.height = H;

  renderFrontColorCard(fCanvas, W, H);
  renderBackColorCard(bCanvas, W, H);

  renderTraySimulation();
  renderSheetSimulation();
}

function renderFrontColorCard(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  const scale = W / 1011; // base design reference 1011 x 638

  // Base background
  drawCardBackground(ctx, W, H, "front");

  // Top Header: "भारत सरकार / Government of India"
  ctx.save();
  // Saffron header bar
  ctx.fillStyle = currentTheme === "royal-blue" ? "#1e3a8a" : "#ea580c";
  ctx.fillRect(0, 0, W, 72 * scale);

  // Ashoka Emblem / Ashoka Lion Vector representation
  drawAshokaEmblem(ctx, 36 * scale, 36 * scale, 24 * scale);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${24 * scale}px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText("भारत सरकार", 78 * scale, 32 * scale);

  ctx.font = `bold ${18 * scale}px "Inter", sans-serif`;
  ctx.fillText("Government of India", 78 * scale, 58 * scale);

  // UIDAI Logo on top right
  drawUidaiLogo(ctx, W - 60 * scale, 36 * scale, 26 * scale);
  ctx.restore();

  // Photo Box on left
  const photoX = 46 * scale;
  const photoY = 110 * scale;
  const photoW = 240 * scale;
  const photoH = 300 * scale;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(photoX - 4, photoY - 4, photoW + 8, photoH + 8);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(photoX - 4, photoY - 4, photoW + 8, photoH + 8);

  const bright = $("brightSlider").value;
  const contrast = $("contrastSlider").value;
  ctx.filter = `brightness(${bright}%) contrast(${contrast}%)`;

  if (extractedPhotoImg) {
    ctx.drawImage(extractedPhotoImg, photoX, photoY, photoW, photoH);
  } else {
    // Placeholder silhouette
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = "#64748b";
    ctx.font = `bold ${22 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PHOTO", photoX + photoW / 2, photoY + photoH / 2);
  }
  ctx.filter = "none";
  ctx.restore();

  // Ghost miniature photo (Top Right)
  if ($("ghostSelect").value === "yes" && extractedPhotoImg) {
    const gx = W - 145 * scale;
    const gy = 100 * scale;
    const gw = 105 * scale;
    const gh = 130 * scale;

    ctx.save();
    ctx.filter = "grayscale(100%) contrast(120%)";
    ctx.globalAlpha = 0.85;
    ctx.drawImage(extractedPhotoImg, gx, gy, gw, gh);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.restore();
  }

  // Cardholder Details (Middle / Right)
  const textX = 320 * scale;
  ctx.save();
  ctx.fillStyle = "#0f172a";

  // Name (Hindi)
  ctx.font = `800 ${28 * scale}px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText(cardData.nameHi || "अनिता शर्मा", textX, 155 * scale);

  // Name (English)
  ctx.font = `700 ${24 * scale}px "Inter", sans-serif`;
  ctx.fillText(cardData.nameEn || "ANITA SHARMA", textX, 195 * scale);

  // DOB
  ctx.font = `600 ${20 * scale}px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText(`जन्म तिथि / DOB: ${cardData.dob || "15/08/1995"}`, textX, 245 * scale);

  // Gender
  ctx.fillText(`लिंग / Gender: ${cardData.gender || "महिला / Female"}`, textX, 285 * scale);
  ctx.restore();

  // Bold Aadhaar Number Box (Bottom)
  const numY = 485 * scale;
  const numStyle = $("numStyleSelect").value;
  let numColor = "#dc2626";
  if (numStyle === "bold-navy") numColor = "#1e3a8a";
  if (numStyle === "bold-black") numColor = "#0f172a";

  ctx.save();
  ctx.fillStyle = numColor;
  ctx.font = `900 ${48 * scale}px "Inter", "Poppins", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(formatAadhaarDisplay(cardData.aadhaarNo), W / 2, numY);

  // Red separator underline
  ctx.strokeStyle = numColor;
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(W * 0.18, numY + 12 * scale);
  ctx.lineTo(W * 0.82, numY + 12 * scale);
  ctx.stroke();

  // Bottom Tagline: "मेरा आधार, मेरी पहचान"
  ctx.fillStyle = "#1e293b";
  ctx.font = `700 ${20 * scale}px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText("मेरा आधार, मेरी पहचान", W / 2, numY + 44 * scale);
  ctx.restore();
}

function renderBackColorCard(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  const scale = W / 1011;

  drawCardBackground(ctx, W, H, "back");

  // Top Header: "भारतीय विशिष्ट पहचान प्राधिकरण / UIDAI"
  ctx.save();
  ctx.fillStyle = currentTheme === "royal-blue" ? "#1e3a8a" : "#ea580c";
  ctx.fillRect(0, 0, W, 72 * scale);

  drawAshokaEmblem(ctx, 36 * scale, 36 * scale, 24 * scale);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${22 * scale}px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText("भारतीय विशिष्ट पहचान प्राधिकरण", 78 * scale, 32 * scale);

  ctx.font = `bold ${16 * scale}px "Inter", sans-serif`;
  ctx.fillText("Unique Identification Authority of India", 78 * scale, 58 * scale);

  drawUidaiLogo(ctx, W - 60 * scale, 36 * scale, 26 * scale);
  ctx.restore();

  // Left Side: Address Details
  const addrX = 46 * scale;
  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.font = `bold ${22 * scale}px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText("पता:", addrX, 125 * scale);

  ctx.font = `600 ${18 * scale}px "Noto Sans Devanagari", sans-serif`;
  wrapText(ctx, cardData.addressHi || cardData.addressEn, addrX, 160 * scale, 520 * scale, 28 * scale);

  ctx.font = `bold ${20 * scale}px "Inter", sans-serif`;
  ctx.fillText("Address:", addrX, 275 * scale);

  ctx.font = `500 ${17 * scale}px "Inter", sans-serif`;
  wrapText(ctx, cardData.addressEn, addrX, 305 * scale, 520 * scale, 26 * scale);
  ctx.restore();

  // Right Side: Square High-Res QR Code
  const qrX = W - 360 * scale;
  const qrY = 110 * scale;
  const qrSize = 310 * scale;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);

  if (extractedQrImg) {
    ctx.drawImage(extractedQrImg, qrX, qrY, qrSize, qrSize);
  } else {
    // Generate clean QR placeholder
    drawQrMock(ctx, qrX, qrY, qrSize);
  }
  ctx.restore();

  // Back Aadhaar Number strip
  const numY = 485 * scale;
  ctx.save();
  ctx.fillStyle = "#dc2626";
  ctx.font = `900 ${44 * scale}px "Inter", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(formatAadhaarDisplay(cardData.aadhaarNo), W / 2, numY);

  // Bottom Helpline
  ctx.fillStyle = "#475569";
  ctx.font = `600 ${17 * scale}px "Inter", sans-serif`;
  ctx.fillText("📞 1947  |  ✉ help@uidai.gov.in  |  🌐 www.uidai.gov.in", W / 2, numY + 44 * scale);
  ctx.restore();
}

function drawCardBackground(ctx, W, H, side) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (currentTheme === "tricolor") {
    // Elegant Tricolor security wave background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "rgba(255, 237, 213, 0.45)"); // Soft saffron
    grad.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
    grad.addColorStop(1, "rgba(220, 252, 231, 0.45)"); // Soft green
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle curved national ribbons
    ctx.save();
    ctx.strokeStyle = "rgba(234, 88, 12, 0.12)";
    ctx.lineWidth = 32;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 1.2, W * 0.7, 0, Math.PI);
    ctx.stroke();

    ctx.strokeStyle = "rgba(22, 163, 74, 0.12)";
    ctx.lineWidth = 32;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * -0.2, W * 0.7, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  } else if (currentTheme === "royal-blue") {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "rgba(239, 246, 255, 0.8)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else if (currentTheme === "gold-green") {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "rgba(254, 252, 232, 0.7)");
    grad.addColorStop(1, "rgba(240, 253, 244, 0.7)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Guilloche watermarked Ashoka Chakra in center
  ctx.save();
  ctx.strokeStyle = "rgba(30, 58, 138, 0.05)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, H * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.lineTo(W / 2 + Math.cos(angle) * H * 0.35, H / 2 + Math.sin(angle) * H * 0.35);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle outer border (CR80)
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, W, H);
}

function drawAshokaEmblem(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ea580c";
  ctx.font = `bold ${r * 0.9}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏛️", x, y);
  ctx.restore();
}

function drawUidaiLogo(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ea580c";
  ctx.font = `bold ${r * 0.9}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("☀", x, y);
  ctx.restore();
}

function drawQrMock(ctx, x, y, size) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 10, y + 10, size - 20, size - 20);
  ctx.fillStyle = "#000000";
  // Position markers
  ctx.fillRect(x + 20, y + 20, 50, 50);
  ctx.fillRect(x + size - 70, y + 20, 50, 50);
  ctx.fillRect(x + 20, y + size - 70, 50, 50);
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("QR CODE", x + size / 2, y + size / 2);
}

function formatAadhaarDisplay(no) {
  const digits = (no || "").replace(/\D/g, "");
  if (digits.length === 12) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
  }
  return no || "XXXX XXXX 1234";
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || "").split(" ");
  let line = "";
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = words[n] + " ";
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}

// -------------------------------------------------------------
// Epson L8050 Tray Simulation & Studio
// -------------------------------------------------------------
function setupTrayControls() {
  ["trayModeSelect", "trayShiftX", "trayShiftY", "trayGap", "trayFlipBack"].forEach((id) => {
    $(id)?.addEventListener("change", renderTraySimulation);
    $(id)?.addEventListener("input", renderTraySimulation);
  });

  $("printTrayBtn").addEventListener("click", () => {
    document.querySelector('[data-tab="epson-tray"]').click();
    printTrayDirect();
  });

  $("directTrayPrintBtn").addEventListener("click", printTrayDirect);
  $("downloadTrayPdfBtn").addEventListener("click", downloadTrayPdf);
}

function renderTraySimulation() {
  const canvas = $("trayCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Epson ID Tray 130 x 240 mm
  const scale = 3;
  canvas.width = 130 * scale;
  canvas.height = 240 * scale;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("▲ INSERT INTO EPSON L8050 / L8100 TRAY ▲", canvas.width / 2, 28);

  const shiftX = (parseFloat($("trayShiftX").value) || 0) * scale;
  const shiftY = (parseFloat($("trayShiftY").value) || 0) * scale;
  const gap = (parseFloat($("trayGap").value) || 2.5) * scale;
  const flipBack = $("trayFlipBack").checked;

  const cardW = 85.60 * scale;
  const cardH = 54.00 * scale;
  const cardX = (canvas.width - cardW) / 2 + shiftX;
  const slot1_Y = 46 * scale + shiftY;
  const slot2_Y = slot1_Y + cardH + gap;

  // Draw holders
  drawTrayPocket(ctx, cardX, slot1_Y, cardW, cardH, "SLOT 1 (FRONT)");
  drawTrayPocket(ctx, cardX, slot2_Y, cardW, cardH, "SLOT 2 (BACK)");

  const fCanvas = $("frontCanvas");
  const bCanvas = $("backCanvas");
  if (!fCanvas.width) return;

  const mode = $("trayModeSelect").value;
  // Slot 1
  if (mode === "both" || mode === "two-fronts" || mode === "front-only") {
    ctx.drawImage(fCanvas, cardX, slot1_Y, cardW, cardH);
  } else if (mode === "two-backs") {
    ctx.drawImage(bCanvas, cardX, slot1_Y, cardW, cardH);
  }

  // Slot 2
  if (mode === "both") {
    ctx.save();
    if (flipBack) {
      ctx.translate(cardX + cardW / 2, slot2_Y + cardH / 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(bCanvas, -cardW / 2, -cardH / 2, cardW, cardH);
    } else {
      ctx.drawImage(bCanvas, cardX, slot2_Y, cardW, cardH);
    }
    ctx.restore();
  } else if (mode === "two-fronts") {
    ctx.drawImage(fCanvas, cardX, slot2_Y, cardW, cardH);
  } else if (mode === "two-backs") {
    ctx.drawImage(bCanvas, cardX, slot2_Y, cardW, cardH);
  }
}

function drawTrayPocket(ctx, x, y, w, h, label) {
  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

function printTrayDirect() {
  const canvas = $("trayCanvas");
  if (!canvas) return;

  const printContainer = $("printContainer");
  printContainer.innerHTML = "";
  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  img.className = "print-page-canvas";
  printContainer.appendChild(img);

  window.print();
}

function downloadTrayPdf() {
  const canvas = $("trayCanvas");
  if (!window.jspdf || !canvas) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [130, 240] });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 130, 240, undefined, "FAST");
  doc.save("ANVI-Color-Aadhaar-Epson-Tray.pdf");
}

// -------------------------------------------------------------
// Dragon Sheet & 4x6 Photo Paper
// -------------------------------------------------------------
function setupSheetControls() {
  ["sheetPaperType", "dragonCutStyle"].forEach((id) => {
    $(id)?.addEventListener("change", renderSheetSimulation);
  });

  $("printDragonBtn").addEventListener("click", () => {
    document.querySelector('[data-tab="dragon-sheet"]').click();
    printSheetDirect();
  });

  $("printPhoto46Btn").addEventListener("click", () => {
    $("sheetPaperType").value = "photo-4x6";
    document.querySelector('[data-tab="dragon-sheet"]').click();
    printSheetDirect();
  });

  $("printDragonDirectBtn").addEventListener("click", printSheetDirect);
  $("downloadDragonPdfBtn").addEventListener("click", downloadSheetPdf);
}

function renderSheetSimulation() {
  const canvas = $("dragonCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const paperType = $("sheetPaperType").value;
  const cutStyle = $("dragonCutStyle").value;
  const fCanvas = $("frontCanvas");
  const bCanvas = $("backCanvas");
  if (!fCanvas.width) return;

  if (paperType === "photo-4x6") {
    // 4x6 inch = 101.6 x 152.4 mm (portrait or landscape)
    // 2 cards side-by-side (1 Front + 1 Back)
    const scale = 3;
    canvas.width = Math.round(152.4 * scale);
    canvas.height = Math.round(101.6 * scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cardW = 85.6 * scale;
    const cardH = 54.0 * scale;

    // Stack or side-by-side
    const x = (canvas.width - cardW) / 2;
    const y1 = (canvas.height - (cardH * 2 + 10)) / 2;
    const y2 = y1 + cardH + 10;

    ctx.drawImage(fCanvas, x, y1, cardW, cardH);
    ctx.drawImage(bCanvas, x, y2, cardW, cardH);

    if (cutStyle === "corner-ticks") {
      drawTicks(ctx, x, y1, cardW, cardH);
      drawTicks(ctx, x, y2, cardW, cardH);
    }
  } else {
    // A4 Sheet: 210 x 297 mm
    const scale = 2.5;
    canvas.width = Math.round(210 * scale);
    canvas.height = Math.round(297 * scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cardW = 85.6 * scale;
    const cardH = 54.0 * scale;
    const marginX = 14 * scale;
    const marginY = 10 * scale;
    const colGap = (canvas.width - 2 * marginX - 2 * cardW);
    const rowGap = (canvas.height - 2 * marginY - 5 * cardH) / 4;

    for (let r = 0; r < 5; r++) {
      const y = marginY + r * (cardH + rowGap);
      const x1 = marginX;
      const x2 = x1 + cardW + colGap;

      ctx.drawImage(fCanvas, x1, y, cardW, cardH);
      ctx.drawImage(bCanvas, x2, y, cardW, cardH);

      if (cutStyle === "corner-ticks") {
        drawTicks(ctx, x1, y, cardW, cardH);
        drawTicks(ctx, x2, y, cardW, cardH);
      }
    }
  }
}

function drawTicks(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  const t = 12;

  // 4 corners
  ctx.beginPath();
  ctx.moveTo(x - t, y); ctx.lineTo(x, y); ctx.lineTo(x, y - t);
  ctx.moveTo(x + w + t, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - t);
  ctx.moveTo(x + w + t, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h + t);
  ctx.moveTo(x - t, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h + t);
  ctx.stroke();
  ctx.restore();
}

function printSheetDirect() {
  const canvas = $("dragonCanvas");
  if (!canvas) return;

  const printContainer = $("printContainer");
  printContainer.innerHTML = "";
  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  img.className = "print-page-canvas";
  printContainer.appendChild(img);

  window.print();
}

function downloadSheetPdf() {
  const canvas = $("dragonCanvas");
  if (!window.jspdf || !canvas) return;

  const { jsPDF } = window.jspdf;
  const paperType = $("sheetPaperType").value;
  const isPhoto46 = paperType === "photo-4x6";

  const doc = new jsPDF({
    orientation: isPhoto46 ? "landscape" : "portrait",
    unit: "mm",
    format: isPhoto46 ? [101.6, 152.4] : "a4"
  });

  const w = isPhoto46 ? 152.4 : 210;
  const h = isPhoto46 ? 101.6 : 297;
  doc.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, w, h, undefined, "FAST");
  doc.save(`ANVI-Color-Aadhaar-${isPhoto46 ? "4x6-Photo" : "A4-Dragon"}.pdf`);
}

// -------------------------------------------------------------
// Output Exports
// -------------------------------------------------------------
function setupOutputActions() {
  $("dlFrontBtn").addEventListener("click", () => {
    downloadCanvas($("frontCanvas"), "Color-Aadhaar-Front.png");
  });

  $("dlBackBtn").addEventListener("click", () => {
    downloadCanvas($("backCanvas"), "Color-Aadhaar-Back.png");
  });

  $("downloadZipPngBtn").addEventListener("click", () => {
    downloadCanvas($("frontCanvas"), "Color-Aadhaar-Front.png");
    setTimeout(() => {
      downloadCanvas($("backCanvas"), "Color-Aadhaar-Back.png");
    }, 400);
  });

  $("downloadPdfBtn").addEventListener("click", downloadSheetPdf);
}

function downloadCanvas(canvas, filename) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

// -------------------------------------------------------------
// Demo Generator
// -------------------------------------------------------------
function loadDemoColorAadhaar() {
  cardData = {
    nameEn: "ANITA SHARMA",
    nameHi: "अनिता शर्मा",
    dob: "15/08/1995",
    gender: "महिला / Female",
    aadhaarNo: "9876 5432 1098",
    addressEn: "W/O Rajesh Sharma, Plot No. 12, Gandhi Nagar, Jaipur, Rajasthan - 302015",
    addressHi: "पत्नी: राजेश शर्मा, प्लॉट नं. 12, गांधी नगर, जयपुर, राजस्थान - 302015"
  };
  syncFormInputs();

  // Create demo photo
  const pCanvas = document.createElement("canvas");
  pCanvas.width = 300;
  pCanvas.height = 360;
  const pCtx = pCanvas.getContext("2d");
  pCtx.fillStyle = "#e0f2fe";
  pCtx.fillRect(0, 0, 300, 360);
  pCtx.fillStyle = "#0284c7";
  pCtx.beginPath();
  pCtx.arc(150, 140, 70, 0, Math.PI * 2);
  pCtx.fill();
  pCtx.beginPath();
  pCtx.arc(150, 320, 110, 0, Math.PI);
  pCtx.fill();

  const pImg = new Image();
  pImg.onload = () => {
    extractedPhotoImg = pImg;
    setStatusBar("Demo Color Aadhaar Ready", "Sample Beneficiary Card", 100);
    renderColorCards();
  };
  pImg.src = pCanvas.toDataURL("image/png");
}
