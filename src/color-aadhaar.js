/**
 * ANVIMITRA - Color Aadhaar Instant 2.0 Engine
 * Ultra HD PVC Card Maker (CR80: 85.6 × 54.0 mm, 2598 × 1632 Master Canvas)
 * Auto-detects all text (Hindi & English Name, DOB, Gender, Hindi & English Address, QR, Photo)
 * Full Epson L8050/L8100 2-Card PVC Tray Studio & A4 Dragon Sheet
 */

// =========================================================================
// GLOBAL STATE & TEMPLATES
// =========================================================================
let rawPdfBytes = null;
let loadedPdfDoc = null;
let sourcePageCanvas = null;
let pendingPasswordResolve = null;

let templateFrontImg = new Image();
let templateBackImg = new Image();
let templatesLoaded = false;
templateFrontImg.crossOrigin = "anonymous";
templateBackImg.crossOrigin = "anonymous";

let extractedPhotoImg = null;
let extractedQrImg = null;
let currentTheme = "official-hd"; // "official-hd", "tricolor", "royal-blue", "gold-green"
let activeDpi = 600;
let fontScale = 1.15; // Extra Large by default as requested by user

// Card Data Model
const cardData = {
  nameEn: "ANITA SHARMA",
  nameHi: "अनिता शर्मा",
  dob: "15/08/1995",
  gender: "महिला / Female",
  mobile: "",
  aadhaarNo: "5432 1080 5555",
  vidNo: "VID : 9123 4567 8901 2345",
  issueDate: "Issue Date : 15/08/2021",
  detailsAsOn: "Details as on : 15/08/2021",
  addressHi: "पता: पत्नी: राजेश शर्मा, मकान नं. 42, सांवरा, वार्ड नं. 5, जयपुर, राजस्थान - 302001",
  addressEn: "Address: W/O Rajesh Sharma, House No. 42, Sanwara, Ward No. 5, Jaipur, Rajasthan - 302001"
};

// Canvas Coordinate Placements (% of Native 2598x1632 Template)
// All font sizes enlarged significantly for bold, crystal-clear readability
const cardCoords = {
  photo: { x: 7.8, y: 22.0, w: 21.0, h: 42.0, border: true, brightness: 105, contrast: 110 },
  ghostPhoto: { enabled: true, x: 86.0, y: 16.0, w: 7.0, h: 14.0, opacity: 80, textY: 31.0, textSize: 32 },
  frontText: {
    x: 32.5,
    nameY: 24.5,
    nameSize: 84,       // Large bold name
    bodySize: 70,       // Large bold DOB & Gender
    aadhaarY: 78.5,
    aadhaarSize: 136,   // Big bold Aadhaar number
    vidY: 86.5,
    vidSize: 64,        // Big clear VID
    issueDateX: 3.0,
    issueDateY: 46.5,
    issueDateSize: 54,
    mobileX: 32.5,
    mobileY: 53.0,
    mobileSize: 64
  },
  backText: {
    addrX: 7.0,
    addrRegY: 22.0,
    addrW: 54.5,
    addrSize: 72,       // Large bold Address (Hindi & English)
    aadhaarY: 78.5,
    aadhaarSize: 136,
    vidY: 86.5,
    vidSize: 64,
    detailsDateX: 3.0,
    detailsDateY: 46.0,
    detailsDateSize: 54
  },
  qr: { x: 63.5, y: 22.0, size: 30.0 }
};

// Standard UIDAI e-Aadhaar Bounding Box Coordinates Preset (% of page 1 width/height)
const SEGMENT_PRESET_COORDS = {
  candidate_photo: { page: 1, x: 11.9, y: 76.8, w: 8.3, h: 7.9 },
  qr_code: { page: 1, x: 76.0, y: 76.4, w: 14.7, h: 11.3 },
  issue_date: { page: 1, x: 8.9, y: 75.7, w: 2.3, h: 12.3 },
  aadhaar_no: { page: 1, x: 61.0, y: 87.8, w: 21.9, h: 2.8 },
  back_address: { page: 1, x: 49.0, y: 74.0, w: 27.0, h: 14.0 },
  details_as_on: { page: 1, x: 51.1, y: 76.2, w: 1.3, h: 9.9 }
};

// DOM helper
const $ = (id) => document.getElementById(id);

// =========================================================================
// INITIALIZATION
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTemplates();
  setupTabs();
  setupUpload();
  setupControls();
  setupTrayControls();
  setupSheetControls();
  setupOutputActions();
});

// Load background templates asynchronously with multiple fallback URLs
function initTemplates() {
  const sourcesFront = [
    "./templates/frontadhar.webp",
    "/templates/frontadhar.webp",
    "https://www.ikprinthub.in/samples/frontadhar.webp"
  ];
  const sourcesBack = [
    "./templates/backadhar.webp",
    "/templates/backadhar.webp",
    "https://www.ikprinthub.in/samples/backadhar.webp"
  ];

  loadTemplateImage(templateFrontImg, sourcesFront);
  loadTemplateImage(templateBackImg, sourcesBack);
}

function loadTemplateImage(imgObj, urls) {
  let idx = 0;
  function tryNext() {
    if (idx >= urls.length) {
      console.warn("Could not load external template, using vector fallback.");
      return;
    }
    const url = urls[idx++];
    imgObj.onload = () => {
      templatesLoaded = true;
      console.log("Template loaded:", url);
      renderColorCards();
    };
    imgObj.onerror = () => {
      tryNext();
    };
    imgObj.src = url;
  }
  tryNext();
}

// =========================================================================
// TABS SETUP
// =========================================================================
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

// =========================================================================
// FILE UPLOAD & PASSWORD HANDLING
// =========================================================================
function setupUpload() {
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const chooseBtn = $("chooseBtn");
  const sampleBtn = $("sampleAadhaarBtn");

  chooseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => {
    if (e.target !== fileInput && !e.target.closest("button") && !e.target.closest("label")) {
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

  // Password Modal Buttons
  $("passwordSubmitBtn").addEventListener("click", () => {
    const pwd = $("pdfPasswordInput").value.trim();
    if (pendingPasswordResolve) {
      pendingPasswordResolve(pwd);
      pendingPasswordResolve = null;
    }
    $("passwordModal").classList.remove("active");
  });

  $("pdfPasswordInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      $("passwordSubmitBtn").click();
    }
  });

  $("passwordCancelBtn").addEventListener("click", () => {
    if (pendingPasswordResolve) {
      pendingPasswordResolve(null);
      pendingPasswordResolve = null;
    }
    $("passwordModal").classList.remove("active");
    hideLoading();
  });

  // Custom photo & QR replacements
  $("customPhotoInput").addEventListener("change", (e) => {
    if (e.target.files?.length) {
      const img = new Image();
      img.onload = () => {
        extractedPhotoImg = img;
        renderColorCards();
      };
      img.src = URL.createObjectURL(e.target.files[0]);
    }
  });

  $("customQrInput").addEventListener("change", (e) => {
    if (e.target.files?.length) {
      const img = new Image();
      img.onload = () => {
        extractedQrImg = img;
        renderColorCards();
      };
      img.src = URL.createObjectURL(e.target.files[0]);
    }
  });

  $("reExtractBtn").addEventListener("click", () => {
    if (loadedPdfDoc) {
      processAadhaarDoc(loadedPdfDoc, "e-Aadhaar PDF");
    } else {
      alert("कृपया पहले e-Aadhaar PDF फ़ाइल अपलोड करें।");
    }
  });
}

async function handleIncomingFile(file) {
  setStatusBar("Reading e-Aadhaar file...", file.name, 20);

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const buffer = await file.arrayBuffer();
    rawPdfBytes = new Uint8Array(buffer);
    await attemptAutoUnlockAndLoad(file.name);
  } else if (file.type.startsWith("image/")) {
    const img = new Image();
    img.onload = () => {
      processAadhaarImage(img, file.name);
    };
    img.src = URL.createObjectURL(file);
  } else {
    alert("कृपया मान्य e-Aadhaar PDF फ़ाइल अपलोड करें।");
    hideLoading();
  }
}

// Auto password candidates extraction from filename
function extractPasswordCandidatesFromFilename(fileName) {
  if (!fileName || typeof fileName !== "string") return [];
  const candidates = [];
  const baseName = fileName.replace(/\.pdf$/i, "").trim();

  // 1. Year match
  const yearMatch = baseName.match(/(?:^|[^0-9])((?:19|20)\d{2}|\d{4})(?:[^0-9]|$)/);
  const year = yearMatch ? yearMatch[1] : null;

  // 2. Alpha words
  const words = baseName.match(/[A-Za-z]+/g) || [];
  const ignored = new Set(["eaadhaar", "aadhaar", "aadhar", "pdf", "signed", "download", "card", "doc"]);

  if (year) {
    for (const w of words) {
      if (ignored.has(w.toLowerCase())) continue;
      if (w.length >= 4) {
        const cand = (w.slice(0, 4) + year).toUpperCase();
        if (!candidates.includes(cand)) candidates.push(cand);
      }
    }
  }

  // 3. Direct 4 letters + 4 digits pattern
  const directMatches = baseName.match(/[A-Za-z]{4}\d{4}/g);
  if (directMatches) {
    directMatches.forEach((m) => {
      const u = m.toUpperCase();
      if (!candidates.includes(u)) candidates.push(u);
    });
  }

  // 4. Exact 8 alphanumeric
  if (baseName.length === 8 && /^[A-Za-z0-9]+$/.test(baseName)) {
    const u = baseName.toUpperCase();
    if (!candidates.includes(u)) candidates.push(u);
  }

  return candidates;
}

async function attemptAutoUnlockAndLoad(fileName) {
  if (!rawPdfBytes) return;
  setStatusBar("Checking PDF security...", fileName, 35);

  const candidates = extractPasswordCandidatesFromFilename(fileName);

  // Try empty password first
  try {
    const testDoc = await window.pdfjsLib.getDocument({
      data: new Uint8Array(rawPdfBytes),
      password: ""
    }).promise;
    await processAadhaarDoc(testDoc, fileName);
    return;
  } catch (err) {
    if (err.name !== "PasswordException") {
      alert("PDF Error: " + (err.message || "Cannot open PDF."));
      return;
    }
  }

  // Try candidate passwords
  for (const pwd of candidates) {
    try {
      const candDoc = await window.pdfjsLib.getDocument({
        data: new Uint8Array(rawPdfBytes),
        password: pwd
      }).promise;
      console.log("Unlocked with candidate password:", pwd);
      await processAadhaarDoc(candDoc, fileName);
      return;
    } catch (e) {
      // Keep trying
    }
  }

  // Prompt user for password
  promptPasswordAndOpen(fileName);
}

function promptPasswordAndOpen(fileName) {
  $("passwordModal").classList.add("active");
  $("pdfPasswordInput").value = "";
  $("pdfPasswordInput").focus();

  pendingPasswordResolve = async (password) => {
    if (!password) {
      setStatusBar("Password cancelled", fileName, 0);
      return;
    }

    setStatusBar("Decrypting e-Aadhaar...", fileName, 45);
    try {
      const doc = await window.pdfjsLib.getDocument({
        data: new Uint8Array(rawPdfBytes),
        password: password
      }).promise;
      await processAadhaarDoc(doc, fileName);
    } catch (err) {
      if (err.name === "PasswordException") {
        alert("गलत पासवर्ड! आधार का पासवर्ड नाम के पहले 4 अक्षर CAPITAL + जन्म वर्ष होता है (उदा. ANVI1995)।");
        promptPasswordAndOpen(fileName);
      } else {
        alert("Error opening PDF: " + (err.message || "Decryption failed"));
      }
    }
  };
}

// =========================================================================
// HIGH-PRECISION TEXT PARSER & SPATIAL LINE CLUSTERING
// =========================================================================
async function processAadhaarDoc(pdf, fileName) {
  loadedPdfDoc = pdf;
  setStatusBar("Analyzing e-Aadhaar Data...", `${fileName} (${pdf.numPages} Page)`, 65);

  // 1. High-precision spatial text extraction
  await autoExtractTextFromPdfLayer(pdf);

  // 2. High-res page 1 render for Photo & QR crop
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 3.2 }); // Ultra high resolution master

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  sourcePageCanvas = canvas;

  // 3. Auto-crop Candidate Photo & Square QR Code
  extractPhotoAndQrFromCanvas(canvas);

  // 4. Update UI Form
  syncFormInputs();

  // 5. Render cards
  setStatusBar("Color Aadhaar Ready!", `${fileName} (Processed)`, 100);
  renderColorCards();
}

function cropCanvasBox(sourceCanvas, box) {
  if (!sourceCanvas || !box) return null;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const cx = Math.max(0, (box.x / 100) * sw);
  const cy = Math.max(0, (box.y / 100) * sh);
  const cw = Math.min(sw - cx, Math.max(10, (box.w / 100) * sw));
  const ch = Math.min(sh - cy, Math.max(10, (box.h / 100) * sh));

  const outCanvas = document.createElement("canvas");
  outCanvas.width = Math.round(cw);
  outCanvas.height = Math.round(ch);
  const ctx = outCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, cx, cy, cw, ch, 0, 0, outCanvas.width, outCanvas.height);
  return outCanvas;
}

function extractPhotoAndQrFromCanvas(pageCanvas) {
  // Candidate photo crop
  const photoCanvas = cropCanvasBox(pageCanvas, SEGMENT_PRESET_COORDS.candidate_photo);
  if (photoCanvas) {
    const pImg = new Image();
    pImg.onload = () => {
      extractedPhotoImg = pImg;
      renderColorCards();
    };
    pImg.src = photoCanvas.toDataURL("image/png");
  }

  // QR Code crop
  const qrCanvas = cropCanvasBox(pageCanvas, SEGMENT_PRESET_COORDS.qr_code);
  if (qrCanvas) {
    const qImg = new Image();
    qImg.onload = () => {
      extractedQrImg = qImg;
      renderColorCards();
    };
    qImg.src = qrCanvas.toDataURL("image/png");
  }
}

async function autoExtractTextFromPdfLayer(pdf) {
  try {
    let allRawItems = [];

    for (let p = 1; p <= Math.min(pdf.numPages, 2); p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageWidth = viewport.width || 595.28;
      const pageHeight = viewport.height || 841.89;
      const content = await page.getTextContent();

      content.items.forEach((it) => {
        const str = (it.str || "").trim();
        if (!str) return;
        const x = it.transform ? it.transform[4] : 0;
        const y = it.transform ? it.transform[5] : 0;
        const pctX = (x / pageWidth) * 100;
        const pctY = ((pageHeight - y) / pageHeight) * 100; // 0% top, 100% bottom

        allRawItems.push({
          str,
          x,
          y,
          pctX,
          pctY,
          page: p
        });
      });
    }

    // Line clustering algorithm by horizontal bands
    function clusterPdfItemsIntoLines(items) {
      if (!items || items.length === 0) return [];
      const valid = items.filter((it) => it && typeof it.str === "string" && it.str.trim().length > 0);
      if (valid.length === 0) return [];

      const sorted = valid.slice().sort((a, b) => a.pctY - b.pctY);
      const lineBuckets = [];
      const Y_THRESHOLD = 0.9;

      sorted.forEach((item) => {
        let matchedBucket = null;
        for (const bucket of lineBuckets) {
          if (Math.abs(item.pctY - bucket.avgY) <= Y_THRESHOLD) {
            matchedBucket = bucket;
            break;
          }
        }
        if (matchedBucket) {
          matchedBucket.items.push(item);
          matchedBucket.avgY = matchedBucket.items.reduce((sum, it) => sum + it.pctY, 0) / matchedBucket.items.length;
        } else {
          lineBuckets.push({ avgY: item.pctY, items: [item] });
        }
      });

      lineBuckets.sort((a, b) => a.avgY - b.avgY);

      return lineBuckets
        .map((b) => {
          b.items.sort((a, b) => a.pctX - b.pctX);
          return {
            pctY: b.avgY,
            text: b.items
              .map((it) => it.str.trim())
              .filter(Boolean)
              .join(" ")
          };
        })
        .filter((l) => l.text.length > 0);
    }

    // Spatial partitioning of Page 1 with generous bounding boxes
    const p1Items = allRawItems.filter((it) => it.page === 1);
    const frontCardItems = p1Items.filter((it) => it.pctY >= 64 && it.pctX < 49);
    // Back card address box: expanded Y to 60-92% and X to 47-84% to never miss Hindi lines
    const backAddressItems = p1Items.filter((it) => it.pctY >= 60 && it.pctX >= 47 && it.pctX <= 84);
    const letterItems = p1Items.filter((it) => it.pctY < 64 && it.pctX < 60);

    const frontLines = clusterPdfItemsIntoLines(frontCardItems).map((l) => l.text);
    const backLines = clusterPdfItemsIntoLines(backAddressItems).map((l) => l.text);
    const letterLines = clusterPdfItemsIntoLines(letterItems).map((l) => l.text);
    const allLines = clusterPdfItemsIntoLines(p1Items).map((l) => l.text);

    const fullText = allLines.join(" \n ");

    // 1. Aadhaar Number (12 digits, strip VID first)
    const cleanText = fullText.replace(/VID\s*:\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}/gi, "");
    const aadharMatch = cleanText.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
    if (aadharMatch) {
      cardData.aadhaarNo = aadharMatch[0];
    } else {
      const raw12 = cleanText.match(/\b\d{12}\b/);
      if (raw12) {
        cardData.aadhaarNo = raw12[0].replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
      }
    }

    // 2. VID (16 digits)
    const vidMatch = fullText.match(/VID\s*:\s*(\d{4}\s\d{4}\s\d{4}\s\d{4})/i);
    if (vidMatch) cardData.vidNo = `VID : ${vidMatch[1]}`;

    // 3. Issue Date & Details As On Date
    const issueRegex = /(?:Aadhaar(?:\s*no\.?)?\s*issued|Issue\s*Date|Date\s*of\s*Issue|Download\s*Date|Print\s*Date|\bissued\b)[\s:]*([0-9]{2}[\/-][0-9]{2}[\/-][0-9]{4})/i;
    let issueMatch = fullText.match(issueRegex);
    if (!issueMatch && Array.isArray(frontLines)) {
      for (const line of frontLines) {
        issueMatch = line.match(issueRegex);
        if (issueMatch) break;
      }
    }
    if (issueMatch) {
      const d = issueMatch[1].trim();
      cardData.issueDate = `Issue Date : ${d}`;
      cardData.detailsAsOn = `Details as on : ${d}`;
    }

    const detailsRegex = /(?:Details\s*as\s*on|As\s*on)[\s:]*([0-9]{2}[\/-][0-9]{2}[\/-][0-9]{4})/i;
    const detailsMatch = fullText.match(detailsRegex);
    if (detailsMatch) {
      cardData.detailsAsOn = `Details as on : ${detailsMatch[1].trim()}`;
    }

    // 4. DOB & Gender
    let dobIdx = frontLines.findIndex((l) => /(?:DOB|Birth|তারিখ|तिथि|தேதி|తేదీ|ದಿನಾಂಕ|जन्म)/i.test(l));
    if (dobIdx === -1) dobIdx = frontLines.findIndex((l) => /\b(MALE|FEMALE|TRANSGENDER|महिला|पुरुष)\b/i.test(l));

    if (dobIdx !== -1) {
      const dobLine = frontLines[dobIdx];
      const dobValMatch = dobLine.match(/([0-9]{2}[\/-][0-9]{2}[\/-][0-9]{4}|[0-9]{4})/);
      if (dobValMatch) cardData.dob = dobValMatch[1];

      // Gender
      let genderLine = frontLines.find((l, idx) => idx >= dobIdx && /(?:महिला|पुरुष|MALE|FEMALE|TRANSGENDER)/i.test(l));
      if (!genderLine) genderLine = fullText.match(/(?:महिला\s*\/\s*FEMALE|पुरुष\s*\/\s*MALE|\bMALE\b|\bFEMALE\b)/i)?.[0];
      if (genderLine) {
        if (/महिला|FEMALE/i.test(genderLine)) cardData.gender = "महिला / Female";
        else if (/पुरुष|MALE/i.test(genderLine)) cardData.gender = "पुरुष / Male";
        else cardData.gender = genderLine.trim();
      }

      // Names (strictly lines before dobIdx)
      const candidateNameLines = frontLines.slice(0, dobIdx).filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (/Government|India|Authority|UIDAI|Unique|भारत|सरकार|प्राधिकरण|Enrollment|www\.|help@|Address|Issue|Mera Aadhaar|Meri Pehchan/i.test(t)) return false;
        if (/^\d+$/.test(t.replace(/\s+/g, ""))) return false;
        return true;
      });

      if (candidateNameLines.length >= 2) {
        const candReg = candidateNameLines[candidateNameLines.length - 2].trim();
        const candEn = candidateNameLines[candidateNameLines.length - 1].toUpperCase().trim();
        if (/[\u0900-\u0D7F]/.test(candReg)) cardData.nameHi = candReg;
        cardData.nameEn = candEn;
      } else if (candidateNameLines.length === 1) {
        const single = candidateNameLines[0].trim();
        if (/[A-Za-z]/.test(single)) cardData.nameEn = single.toUpperCase();
        else if (/[\u0900-\u0D7F]/.test(single)) cardData.nameHi = single;
      }
    }

    // Fallback for Name: Check Letter Section for To <Name>
    const toIdx = letterLines.findIndex((l) => /^To\b/i.test(l.trim()));
    if (toIdx !== -1 && toIdx < letterLines.length - 1) {
      for (let i = toIdx + 1; i < Math.min(toIdx + 4, letterLines.length); i++) {
        const cand = letterLines[i].trim();
        if (!cand || /^(?:C\/O|S\/O|W\/O|D\/O|House|Vill|PO|Pin|\d)/i.test(cand)) break;
        if (/[A-Za-z]/.test(cand) && !/Government|India|Authority|UIDAI/i.test(cand)) {
          if (!cardData.nameEn) cardData.nameEn = cand.toUpperCase();
        } else if (/[\u0900-\u0D7F]/.test(cand)) {
          if (!cardData.nameHi) cardData.nameHi = cand;
        }
      }
    }

    // 5. Back Card Address (Hindi & English 100% Robust Detection)
    let addrHiParts = [];
    let addrEnParts = [];

    backLines.forEach((line) => {
      let trimmed = line.trim();
      if (!trimmed) return;
      // Filter out system and header lines
      if (/Unique Identification Authority|भारतीय विशिष्ट पहचान प्राधिकरण|Government of India|भारत सरकार|UIDAI|help@|www\.|1947/i.test(trimmed)) return;
      trimmed = trimmed.replace(/Details as on\s*[:\uff1a]?\s*[0-9\/-]+/gi, "").trim();
      if (!trimmed) return;
      if (/\b\d{4}\s\d{4}\s\d{4}\b|VID\s*[:\uff1a]/i.test(trimmed)) return;

      // Classify line: Devanagari script belongs to Hindi address
      if (/[\u0900-\u097F]/.test(trimmed)) {
        addrHiParts.push(trimmed);
      } else if (/[A-Za-z]/.test(trimmed)) {
        addrEnParts.push(trimmed);
      }
    });

    // Fallback 1: If Hindi address was not found in back box, scan letterLines (top of page 1)
    if (addrHiParts.length === 0 && letterLines.length > 0) {
      letterLines.forEach((line) => {
        const trimmed = line.trim();
        if (/[\u0900-\u097F]/.test(trimmed) && /(?:पता|आत्मज|पत्नी|सुपुत्र|सुपुत्री|मकान|ग्राम|वार्ड|पोस्ट|तहसील|थाना|जिला|गली|नगर|मोहल्ला|निवासी|मार्ग|पिन)/i.test(trimmed)) {
          addrHiParts.push(trimmed);
        }
      });
    }

    // Fallback 2: If Hindi address is still empty, scan allLines for Devanagari address words
    if (addrHiParts.length === 0 && allLines.length > 0) {
      allLines.forEach((line) => {
        const trimmed = line.trim();
        if (/[\u0900-\u097F]/.test(trimmed) && !/भारत सरकार|भारतीय विशिष्ट पहचान प्राधिकरण|मेरा आधार/i.test(trimmed)) {
          if (/(?:आत्मज|पत्नी|सुपुत्र|सुपुत्री|मकान|ग्राम|वार्ड|पोस्ट|तहसील|थाना|जिला|गली|नगर|मोहल्ला|निवासी)/i.test(trimmed)) {
            addrHiParts.push(trimmed);
          }
        }
      });
    }

    // Fallback 3 for English Address: check letterLines (C/O ...)
    if (addrEnParts.length === 0 && letterLines.length > 0) {
      let capturingEn = false;
      letterLines.forEach((l) => {
        const t = l.trim();
        if (/^(?:Address|C\/O|S\/O|W\/O|D\/O|Care of|Son of|Wife of)\b/i.test(t)) capturingEn = true;
        if (capturingEn) {
          if (/\b\d{4}\s\d{4}\s\d{4}\b|VID\s*[:\uff1a]|(?:Download Date|Issue Date|Mobile)/i.test(t)) {
            capturingEn = false;
          } else if (/[A-Za-z]/.test(t)) {
            addrEnParts.push(t);
          }
        }
      });
    }

    // Format Hindi Address with standard "पता: " prefix
    if (addrHiParts.length > 0) {
      let cleanHi = addrHiParts.join(", ").replace(/\s+,/g, ",").replace(/,+/g, ",");
      cleanHi = cleanHi.replace(/^पता\s*[:\uff1a]?\s*/i, "").trim();
      cardData.addressHi = `पता: ${cleanHi}`;
    }

    // Format English Address with standard "Address: " prefix
    if (addrEnParts.length > 0) {
      let cleanEn = addrEnParts.join(", ").replace(/\s+,/g, ",").replace(/,+/g, ",");
      cleanEn = cleanEn.replace(/^Address\s*[:\uff1a]?\s*/i, "").trim();
      cardData.addressEn = `Address: ${cleanEn}`;
    }

    // 6. Mobile Number
    const mobMatch = fullText.match(/(?:Mobile|Phone|मोबाइल)[\s:]*([6-9]\d{9})/i) || fullText.match(/\b([6-9]\d{9})\b/);
    if (mobMatch) {
      cardData.mobile = mobMatch[1];
    }
  } catch (err) {
    console.warn("Error extracting PDF text layer:", err);
  }
}

function syncFormInputs() {
  $("inputNameEn").value = cardData.nameEn || "";
  $("inputNameHi").value = cardData.nameHi || "";
  $("inputDob").value = cardData.dob || "";
  $("inputGender").value = cardData.gender || "";
  $("inputMobile").value = cardData.mobile || "";
  $("inputAadhaarNo").value = cardData.aadhaarNo || "";
  $("inputVidNo").value = cardData.vidNo || "";
  $("inputIssueDate").value = cardData.issueDate || "";
  $("inputDetailsAsOn").value = cardData.detailsAsOn || "";
  $("inputAddressHi").value = cardData.addressHi || "";
  $("inputAddressEn").value = cardData.addressEn || "";
}

function readInputsToData() {
  cardData.nameEn = $("inputNameEn").value.trim();
  cardData.nameHi = $("inputNameHi").value.trim();
  cardData.dob = $("inputDob").value.trim();
  cardData.gender = $("inputGender").value.trim();
  cardData.mobile = $("inputMobile").value.trim();
  cardData.aadhaarNo = $("inputAadhaarNo").value.trim();
  cardData.vidNo = $("inputVidNo").value.trim();
  cardData.issueDate = $("inputIssueDate").value.trim();
  cardData.detailsAsOn = $("inputDetailsAsOn").value.trim();
  cardData.addressHi = $("inputAddressHi").value.trim();
  cardData.addressEn = $("inputAddressEn").value.trim();
}

function setStatusBar(status, info, pct) {
  $("statusBar").style.display = "flex";
  $("controlsSection").style.display = "block";
  $("statusText").textContent = status;
  $("docInfoText").textContent = info;
  $("progressBar").style.width = `${pct}%`;
}

function hideLoading() {
  $("statusBar").style.display = "none";
}

// Demo Data Loader
function loadDemoColorAadhaar() {
  cardData.nameEn = "ANITA SHARMA";
  cardData.nameHi = "अनिता शर्मा";
  cardData.dob = "15/08/1995";
  cardData.gender = "महिला / Female";
  cardData.mobile = "9829012345";
  cardData.aadhaarNo = "5432 1080 5555";
  cardData.vidNo = "VID : 9123 4567 8901 2345";
  cardData.issueDate = "Issue Date : 15/08/2021";
  cardData.detailsAsOn = "Details as on : 15/08/2021";
  cardData.addressHi = "पता: पत्नी: राजेश शर्मा, मकान नं. 42, सांवरा, वार्ड नं. 5, जयपुर, राजस्थान - 302001";
  cardData.addressEn = "Address: W/O Rajesh Sharma, House No. 42, Sanwara, Ward No. 5, Jaipur, Rajasthan - 302001";
  syncFormInputs();
  setStatusBar("Demo Color Aadhaar Loaded", "Sample Preview", 100);
  renderColorCards();
}

function processAadhaarImage(img, fileName) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  sourcePageCanvas = canvas;

  extractPhotoAndQrFromCanvas(canvas);
  setStatusBar("Image Aadhaar Loaded", fileName, 100);
  renderColorCards();
}

// =========================================================================
// CONTROLS SETUP
// =========================================================================
function setupControls() {
  ["themeSelect", "dpiSelect", "numStyleSelect", "ghostSelect"].forEach((id) => {
    $(id).addEventListener("change", () => {
      currentTheme = $("themeSelect").value;
      activeDpi = parseInt($("dpiSelect").value, 10) || 600;
      renderColorCards();
    });
  });

  const fontScaleEl = $("fontScaleSelect");
  if (fontScaleEl) {
    fontScaleEl.addEventListener("change", (e) => {
      fontScale = parseFloat(e.target.value) || 1.15;
      renderColorCards();
    });
  }

  $("brightSlider").addEventListener("input", (e) => {
    $("brightVal").textContent = e.target.value;
    cardCoords.photo.brightness = parseInt(e.target.value, 10);
    renderColorCards();
  });

  $("contrastSlider").addEventListener("input", (e) => {
    $("contrastVal").textContent = e.target.value;
    cardCoords.photo.contrast = parseInt(e.target.value, 10);
    renderColorCards();
  });

  [
    "inputNameEn",
    "inputNameHi",
    "inputDob",
    "inputGender",
    "inputMobile",
    "inputAadhaarNo",
    "inputVidNo",
    "inputIssueDate",
    "inputDetailsAsOn",
    "inputAddressHi",
    "inputAddressEn"
  ].forEach((id) => {
    $(id).addEventListener("input", () => {
      readInputsToData();
      renderColorCards();
    });
  });
}

// =========================================================================
// ULTRA HD COLOR AADHAAR CARD RENDERING (NATIVE 2598 × 1632)
// =========================================================================
function renderColorCards() {
  readInputsToData();

  const fCanvas = $("frontCanvas");
  const bCanvas = $("backCanvas");
  if (!fCanvas || !bCanvas) return;

  const W = 2598;
  const H = 1632;
  if (fCanvas.width !== W) fCanvas.width = W;
  if (fCanvas.height !== H) fCanvas.height = H;
  if (bCanvas.width !== W) bCanvas.width = W;
  if (bCanvas.height !== H) bCanvas.height = H;

  renderFrontCard(fCanvas, W, H);
  renderBackCard(bCanvas, W, H);

  renderTraySimulation();
  renderSheetSimulation();
}

function renderFrontCard(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // 1. Draw Front Background (Template Image or Vector)
  if (currentTheme === "official-hd" && templatesLoaded && templateFrontImg.complete && templateFrontImg.naturalWidth > 0) {
    ctx.drawImage(templateFrontImg, 0, 0, W, H);
  } else {
    drawVectorBackground(ctx, W, H, "front");
  }

  // 2. Candidate Photo (Left)
  const px = (cardCoords.photo.x / 100) * W;
  const py = (cardCoords.photo.y / 100) * H;
  const pw = (cardCoords.photo.w / 100) * W;
  const ph = (cardCoords.photo.h / 100) * H;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = `brightness(${cardCoords.photo.brightness}%) contrast(${cardCoords.photo.contrast}%)`;

  if (extractedPhotoImg && extractedPhotoImg.complete && extractedPhotoImg.naturalWidth > 0) {
    ctx.drawImage(extractedPhotoImg, px, py, pw, ph);
  } else {
    // Neutral placeholder
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "#64748b";
    ctx.font = `bold 44px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PHOTO", px + pw / 2, py + ph / 2);
  }

  if (cardCoords.photo.border) {
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.strokeRect(px, py, pw, ph);
  }
  ctx.restore();

  // 3. Ghost / Miniature Photo (Top Right)
  if ($("ghostSelect").value === "yes" && extractedPhotoImg) {
    const gx = (cardCoords.ghostPhoto.x / 100) * W;
    const gy = (cardCoords.ghostPhoto.y / 100) * H;
    const gw = (cardCoords.ghostPhoto.w / 100) * W;
    const gh = (cardCoords.ghostPhoto.h / 100) * H;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = "grayscale(100%) contrast(125%) brightness(105%)";
    ctx.globalAlpha = 0.8;
    ctx.drawImage(extractedPhotoImg, gx, gy, gw, gh);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.restore();

    // Micro Aadhaar Number below Ghost
    if (cardData.aadhaarNo) {
      ctx.save();
      ctx.fillStyle = "#0f172a";
      ctx.font = `700 ${cardCoords.ghostPhoto.textSize}px "Lato", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(cardData.aadhaarNo, gx + gw / 2, (cardCoords.ghostPhoto.textY / 100) * H);
      ctx.restore();
    }
  }

  // 4. Front Text (Regional Name, English Name, DOB, Gender, Mobile)
  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "top";

  const tx = (cardCoords.frontText.x / 100) * W;
  let curY = (cardCoords.frontText.nameY / 100) * H;

  const currentNameSize = Math.round(cardCoords.frontText.nameSize * fontScale);
  const currentBodySize = Math.round(cardCoords.frontText.bodySize * fontScale);

  // Name (Regional / Hindi) - Extra Large & Bold
  if (cardData.nameHi) {
    ctx.font = `700 ${currentNameSize}px "Noto Sans Devanagari", sans-serif`;
    ctx.fillText(cardData.nameHi, tx, curY);
    curY += currentNameSize + Math.round(14 * fontScale);
  }

  // Name (English - UPPERCASE) - Extra Large & Bold
  if (cardData.nameEn) {
    ctx.font = `700 ${Math.round(currentNameSize * 0.94)}px "Lato", "Inter", sans-serif`;
    ctx.fillText(cardData.nameEn.toUpperCase(), tx, curY);
    curY += currentNameSize + Math.round(20 * fontScale);
  }

  // DOB - Extra Large & Bold
  if (cardData.dob) {
    let dobStr = cardData.dob.trim();
    if (!/DOB|जन्म/i.test(dobStr)) {
      dobStr = `जन्म तिथि / DOB: ${dobStr}`;
    }
    ctx.font = `600 ${currentBodySize}px "Noto Sans Devanagari", "Lato", sans-serif`;
    ctx.fillText(dobStr, tx, curY);
    curY += currentBodySize + Math.round(16 * fontScale);
  }

  // Gender - Extra Large & Bold
  if (cardData.gender) {
    let genStr = cardData.gender.trim();
    if (!/लिंग|Gender/i.test(genStr)) {
      genStr = `लिंग / GENDER: ${genStr}`;
    }
    ctx.font = `600 ${currentBodySize}px "Noto Sans Devanagari", "Lato", sans-serif`;
    ctx.fillText(genStr, tx, curY);
    curY += currentBodySize + Math.round(16 * fontScale);
  }

  // Mobile
  if (cardData.mobile) {
    const mobSize = Math.round(cardCoords.frontText.mobileSize * fontScale);
    ctx.font = `600 ${mobSize}px "Lato", sans-serif`;
    let mStr = cardData.mobile.trim();
    if (!/^Mobile/i.test(mStr)) mStr = `Mobile: ${mStr}`;
    ctx.fillText(mStr, tx, curY);
  }

  // Aadhaar Number (Centered Big Bold)
  if (cardData.aadhaarNo) {
    const numStyle = $("numStyleSelect").value;
    let numColor = "#dc2626"; // Default bold red
    if (numStyle === "bold-navy") numColor = "#1e3a8a";
    if (numStyle === "bold-black") numColor = "#0f172a";

    const currentAadhaarSize = Math.round(cardCoords.frontText.aadhaarSize * fontScale);
    ctx.save();
    ctx.fillStyle = numColor;
    ctx.font = `700 ${currentAadhaarSize}px "Lato", "Poppins", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(cardData.aadhaarNo, W / 2, (cardCoords.frontText.aadhaarY / 100) * H);
    ctx.restore();
  }

  // VID Number
  if (cardData.vidNo) {
    const currentVidSize = Math.round(cardCoords.frontText.vidSize * fontScale);
    ctx.save();
    ctx.fillStyle = "#334155";
    ctx.font = `600 ${currentVidSize}px "Lato", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(cardData.vidNo, W / 2, (cardCoords.frontText.vidY / 100) * H);
    ctx.restore();
  }

  // Front Vertical Issue Date (Left edge)
  if (cardData.issueDate) {
    ctx.save();
    ctx.translate((cardCoords.frontText.issueDateX / 100) * W, (cardCoords.frontText.issueDateY / 100) * H);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `600 ${cardCoords.frontText.issueDateSize}px "Lato", sans-serif`;
    ctx.fillStyle = "#475569";
    ctx.fillText(cardData.issueDate, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function renderBackCard(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // 1. Draw Back Background (Template Image or Vector)
  if (currentTheme === "official-hd" && templatesLoaded && templateBackImg.complete && templateBackImg.naturalWidth > 0) {
    ctx.drawImage(templateBackImg, 0, 0, W, H);
  } else {
    drawVectorBackground(ctx, W, H, "back");
  }

  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "top";

  const bx = (cardCoords.backText.addrX / 100) * W;
  const maxW = (cardCoords.backText.addrW / 100) * W;
  let curBackY = (cardCoords.backText.addrRegY / 100) * H;
  const currentAddrSize = Math.round(cardCoords.backText.addrSize * fontScale);

  // 2. Hindi / Regional Address - Extra Large & Clean Bold
  if (cardData.addressHi && cardData.addressHi.trim()) {
    ctx.font = `600 ${currentAddrSize}px "Noto Sans Devanagari", sans-serif`;
    curBackY = wrapTextLines(ctx, cardData.addressHi.trim(), bx, curBackY, maxW, currentAddrSize * 1.35);
    curBackY += Math.round(22 * fontScale);
  }

  // 3. English Address - Extra Large & Clean Bold
  if (cardData.addressEn && cardData.addressEn.trim()) {
    let enAddr = cardData.addressEn.trim();
    if (!/^(?:Address|पता)/i.test(enAddr)) {
      enAddr = `Address: ${enAddr}`;
    }
    ctx.font = `600 ${Math.round(currentAddrSize * 0.96)}px "Lato", "Inter", sans-serif`;
    wrapTextLines(ctx, enAddr, bx, curBackY, maxW, currentAddrSize * 1.34);
  }

  // 4. Square High-Contrast QR Code (Right)
  const qx = (cardCoords.qr.x / 100) * W;
  const qy = (cardCoords.qr.y / 100) * H;
  const qs = (cardCoords.qr.size / 100) * W;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (extractedQrImg && extractedQrImg.complete && extractedQrImg.naturalWidth > 0) {
    ctx.drawImage(extractedQrImg, qx, qy, qs, qs);
  } else {
    drawQrMock(ctx, qx, qy, qs);
  }
  ctx.restore();

  // 5. Back Aadhaar Number & VID
  if (cardData.aadhaarNo) {
    const numStyle = $("numStyleSelect").value;
    let numColor = "#dc2626";
    if (numStyle === "bold-navy") numColor = "#1e3a8a";
    if (numStyle === "bold-black") numColor = "#0f172a";

    const currentAadhaarSize = Math.round(cardCoords.backText.aadhaarSize * fontScale);
    ctx.save();
    ctx.fillStyle = numColor;
    ctx.font = `700 ${currentAadhaarSize}px "Lato", "Poppins", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(cardData.aadhaarNo, W / 2, (cardCoords.backText.aadhaarY / 100) * H);
    ctx.restore();
  }

  if (cardData.vidNo) {
    const currentVidSize = Math.round(cardCoords.backText.vidSize * fontScale);
    ctx.save();
    ctx.fillStyle = "#334155";
    ctx.font = `600 ${currentVidSize}px "Lato", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(cardData.vidNo, W / 2, (cardCoords.backText.vidY / 100) * H);
    ctx.restore();
  }

  // 6. Back Vertical Details As On Date (Left edge)
  if (cardData.detailsAsOn) {
    ctx.save();
    ctx.translate((cardCoords.backText.detailsDateX / 100) * W, (cardCoords.backText.detailsDateY / 100) * H);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `600 ${cardCoords.backText.detailsDateSize}px "Lato", sans-serif`;
    ctx.fillStyle = "#475569";
    ctx.fillText(cardData.detailsAsOn, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function wrapTextLines(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const paragraphs = String(text).split("\n");
  let curY = y;

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line ? `${line} ${words[n]}` : words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, curY);
        line = words[n];
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
  }
  return curY;
}

// Fallback dynamic vector artwork
function drawVectorBackground(ctx, W, H, side) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.save();
  ctx.fillStyle = currentTheme === "royal-blue" ? "#1e3a8a" : currentTheme === "gold-green" ? "#065f46" : "#ea580c";
  ctx.fillRect(0, 0, W, 175);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 60px "Noto Sans Devanagari", sans-serif`;
  ctx.fillText(side === "front" ? "भारत सरकार" : "भारतीय विशिष्ट पहचान प्राधिकरण", 200, 75);

  ctx.font = `600 42px "Lato", sans-serif`;
  ctx.fillText(side === "front" ? "Government of India" : "Unique Identification Authority of India", 200, 135);
  ctx.restore();

  // National tricolor soft wave
  const grad = ctx.createLinearGradient(0, 175, W, H);
  grad.addColorStop(0, "rgba(255, 237, 213, 0.35)");
  grad.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
  grad.addColorStop(1, "rgba(220, 252, 231, 0.35)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 175, W, H - 175);

  // Bottom helpline / tagline
  ctx.save();
  ctx.fillStyle = "#475569";
  ctx.font = `600 42px "Lato", "Noto Sans Devanagari", sans-serif`;
  ctx.textAlign = "center";
  if (side === "front") {
    ctx.fillText("मेरा आधार, मेरी पहचान", W / 2, H - 75);
  } else {
    ctx.fillText("📞 1947  |  ✉ help@uidai.gov.in  |  🌐 www.uidai.gov.in", W / 2, H - 75);
  }
  ctx.restore();
}

function drawQrMock(ctx, x, y, size) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 14;
  // Corner markers
  const marker = (mx, my) => {
    ctx.strokeRect(mx, my, 120, 120);
    ctx.fillRect(mx + 30, my + 30, 60, 60);
  };
  marker(x + 20, y + 20);
  marker(x + size - 140, y + 20);
  marker(x + 20, y + size - 140);
}

// =========================================================================
// EPSON L8050 / L8100 2-CARD PVC TRAY STUDIO
// =========================================================================
function setupTrayControls() {
  ["trayModeSelect", "trayShiftX", "trayShiftY", "trayGap", "trayFlipBack"].forEach((id) => {
    $(id).addEventListener("input", renderTraySimulation);
    $(id).addEventListener("change", renderTraySimulation);
  });

  $("printTrayBtn").addEventListener("click", () => {
    document.querySelector(".tab-btn[data-tab='epson-tray']").click();
  });

  $("directTrayPrintBtn").addEventListener("click", printTrayDirect);
  $("downloadTrayPdfBtn").addEventListener("click", downloadTrayPdf);
}

function renderTraySimulation() {
  const canvas = $("trayCanvas");
  if (!canvas) return;

  // Epson ID Tray physical specs: 130 mm × 240 mm at 300 DPI
  const trayWidthMm = 130;
  const trayHeightMm = 240;
  const dpi = 300;
  const mmToPx = (mm) => Math.round((mm / 25.4) * dpi);

  canvas.width = mmToPx(trayWidthMm);
  canvas.height = mmToPx(trayHeightMm);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tray body guide
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  // Card specs: 85.6 mm × 54.0 mm
  const cardW = mmToPx(85.6);
  const cardH = mmToPx(54.0);

  const shiftX = parseFloat($("trayShiftX").value) || 0;
  const shiftY = parseFloat($("trayShiftY").value) || 0;
  const flipBack = $("trayFlipBack").checked;

  const centerX = canvas.width / 2;
  const slot1Y = mmToPx(38 + shiftY);
  const slot2Y = mmToPx(138 + shiftY);
  const cardX = centerX - cardW / 2 + mmToPx(shiftX);

  const fCanvas = $("frontCanvas");
  const bCanvas = $("backCanvas");

  // Slot 1 (Front Card)
  ctx.drawImage(fCanvas, cardX, slot1Y, cardW, cardH);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 3;
  ctx.strokeRect(cardX, slot1Y, cardW, cardH);

  // Slot 2 (Back Card)
  ctx.save();
  if (flipBack) {
    ctx.translate(cardX + cardW / 2, slot2Y + cardH / 2);
    ctx.rotate(Math.PI);
    ctx.drawImage(bCanvas, -cardW / 2, -cardH / 2, cardW, cardH);
  } else {
    ctx.drawImage(bCanvas, cardX, slot2Y, cardW, cardH);
  }
  ctx.restore();

  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 3;
  ctx.strokeRect(cardX, slot2Y, cardW, cardH);
}

function printTrayDirect() {
  const trayCanvas = $("trayCanvas");
  if (!trayCanvas) return;

  const dataUrl = trayCanvas.toDataURL("image/png");
  const printContainer = $("printContainer");
  printContainer.innerHTML = `<img src="${dataUrl}" style="width:130mm; height:240mm; display:block; margin:0 auto;">`;
  window.print();
}

function downloadTrayPdf() {
  if (!window.jspdf?.jsPDF) {
    alert("jsPDF library not available.");
    return;
  }
  const trayCanvas = $("trayCanvas");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [130, 240]
  });

  const dataUrl = trayCanvas.toDataURL("image/jpeg", 0.98);
  pdf.addImage(dataUrl, "JPEG", 0, 0, 130, 240);
  pdf.save(`Epson_L8050_Tray_${(cardData.nameEn || "Aadhaar").replace(/\s+/g, "_")}.pdf`);
}

// =========================================================================
// A4 DRAGON SHEET (10 CARDS) & 4×6 PHOTO PAPER
// =========================================================================
function setupSheetControls() {
  ["sheetSpacing", "sheetMargins", "showCutMarks"].forEach((id) => {
    $(id).addEventListener("input", renderSheetSimulation);
  });

  $("printDragonBtn").addEventListener("click", () => {
    document.querySelector(".tab-btn[data-tab='dragon-sheet']").click();
  });

  $("directSheetPrintBtn").addEventListener("click", () => {
    const canvas = $("dragonCanvas");
    if (!canvas) return;
    const printContainer = $("printContainer");
    printContainer.innerHTML = `<img src="${canvas.toDataURL("image/png")}" style="width:210mm; height:297mm; display:block; margin:0 auto;">`;
    window.print();
  });

  $("downloadSheetPdfBtn").addEventListener("click", () => {
    if (!window.jspdf?.jsPDF) return;
    const canvas = $("dragonCanvas");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297);
    pdf.save(`Dragon_Sheet_10Cards_${(cardData.nameEn || "Aadhaar").replace(/\s+/g, "_")}.pdf`);
  });
}

function renderSheetSimulation() {
  const canvas = $("dragonCanvas");
  if (!canvas) return;

  // A4 at 300 DPI: 2480 × 3508 px
  canvas.width = 2480;
  canvas.height = 3508;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 10 Cards layout: 5 rows × 2 cols (Col 1: Front, Col 2: Back)
  const cardW = Math.round((85.6 / 25.4) * 300); // 1011 px
  const cardH = Math.round((54.0 / 25.4) * 300); // 638 px

  const startX = Math.round((14 / 25.4) * 300);
  const gapX = Math.round((10 / 25.4) * 300);
  const startY = Math.round((14 / 25.4) * 300);
  const gapY = Math.round((5 / 25.4) * 300);

  const fCanvas = $("frontCanvas");
  const bCanvas = $("backCanvas");

  for (let row = 0; row < 5; row++) {
    const y = startY + row * (cardH + gapY);

    // Front Card (Col 1)
    const x1 = startX;
    ctx.drawImage(fCanvas, x1, y, cardW, cardH);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, y, cardW, cardH);

    // Back Card (Col 2)
    const x2 = startX + cardW + gapX;
    ctx.drawImage(bCanvas, x2, y, cardW, cardH);
    ctx.strokeRect(x2, y, cardW, cardH);

    // Cut mark lines
    if ($("showCutMarks").checked) {
      ctx.strokeStyle = "#94a3b8";
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(x1 - 20, y);
      ctx.lineTo(x2 + cardW + 20, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// =========================================================================
// OUTPUT ACTIONS (DOWNLOADS & 4x6 PRINT)
// =========================================================================
function setupOutputActions() {
  $("dlFrontBtn").addEventListener("click", () => {
    downloadCanvasPng($("frontCanvas"), `Color_Aadhaar_Front_${(cardData.nameEn || "Card").replace(/\s+/g, "_")}.png`);
  });

  $("dlBackBtn").addEventListener("click", () => {
    downloadCanvasPng($("backCanvas"), `Color_Aadhaar_Back_${(cardData.nameEn || "Card").replace(/\s+/g, "_")}.png`);
  });

  $("downloadZipPngBtn").addEventListener("click", () => {
    $("dlFrontBtn").click();
    setTimeout(() => $("dlBackBtn").click(), 400);
  });

  $("downloadPdfBtn").addEventListener("click", () => {
    if (!window.jspdf?.jsPDF) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const fData = $("frontCanvas").toDataURL("image/jpeg", 0.98);
    const bData = $("backCanvas").toDataURL("image/jpeg", 0.98);

    // Place Front + Back on A4 top center
    pdf.addImage(fData, "JPEG", 18, 20, 85.6, 54.0);
    pdf.addImage(bData, "JPEG", 108, 20, 85.6, 54.0);
    pdf.save(`Color_Aadhaar_CR80_${(cardData.nameEn || "Print").replace(/\s+/g, "_")}.pdf`);
  });

  $("printPhoto46Btn").addEventListener("click", () => {
    if (!window.jspdf?.jsPDF) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [102, 152] // 4×6 inches in mm
    });

    const fData = $("frontCanvas").toDataURL("image/jpeg", 0.98);
    const bData = $("backCanvas").toDataURL("image/jpeg", 0.98);

    pdf.addImage(fData, "JPEG", 12, 10, 85.6, 54.0);
    pdf.addImage(bData, "JPEG", 12, 70, 85.6, 54.0);
    pdf.save(`Aadhaar_Photo_4x6_${(cardData.nameEn || "Card").replace(/\s+/g, "_")}.pdf`);
  });
}

function downloadCanvasPng(canvas, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
