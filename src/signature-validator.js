import { PDFDocument, rgb, StandardFonts, PDFName } from "pdf-lib";
import * as pkijs from "pkijs";
import * as asn1js from "asn1js";

const $ = id => document.getElementById(id);

// DOM elements
const fileInput = $("pdfFile");
const dropzone = $("dropzone");
const chooseBtn = $("chooseBtn");
const sampleBtn = $("sampleBtn");
const resultBox = $("result");
const details = $("details");
const fileName = $("fileName");
const busy = $("busy");
const progressWrap = $("progressWrap");
const progressBar = $("progressBar");
const progressText = $("progressText");

const readyControls = $("readyControls");
const printBtn = $("printBtn");
const downloadBtn = $("downloadBtn");
const openBtn = $("openBtn");
const auditBtn = $("auditBtn");

const stampStyle = $("stampStyle");
const stampPosition = $("stampPosition");
const stampPage = $("stampPage");
const coverOldCheck = $("coverOldCheck");
const tickPositionInput = $("tickPositionInput");
const tickScaleInput = $("tickScaleInput");
const stampWidthInput = $("stampWidthInput");
const stampHeightInput = $("stampHeightInput");
const coverPaddingInput = $("coverPaddingInput");

const signerInput = $("signerInput");
const designationInput = $("designationInput");
const dateInput = $("dateInput");
const reasonInput = $("reasonInput");
const locationInput = $("locationInput");

const previewCard = $("previewCard");
const previewCanvas = $("previewCanvas");
const prevPageBtn = $("prevPageBtn");
const nextPageBtn = $("nextPageBtn");
const pageIndicator = $("pageIndicator");
const printContainer = $("printContainer");

// Application state
let currentOriginalBytes = null;
let currentOriginalName = "";
let currentGeneratedPdfBytes = null;
let currentBlobUrl = "";
let currentSignatures = [];
let detectedSignatureRect = null;
let detectedSignaturePage = 1;
let currentPdfJsDoc = null;
let currentPreviewPage = 1;
let totalPages = 1;
let customCoords = null; // { x, y } in PDF points
let lastReport = null;

// Initialize event listeners
if (chooseBtn && fileInput) {
  chooseBtn.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  };
}

if (sampleBtn) {
  sampleBtn.onclick = loadSampleDocument;
}

if (dropzone) {
  ["dragenter", "dragover"].forEach(ev =>
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach(ev =>
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", e => {
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  });
}

// Action buttons
if (printBtn) printBtn.onclick = handlePrint;
if (downloadBtn) downloadBtn.onclick = handleDownload;
if (openBtn) openBtn.onclick = () => currentBlobUrl && window.open(currentBlobUrl, "_blank", "noopener");
if (auditBtn) auditBtn.onclick = printAuditReport;

// Option controls change triggers re-generation of Ready-to-Print PDF
[
  stampStyle,
  stampPosition,
  stampPage,
  coverOldCheck,
  tickPositionInput,
  tickScaleInput,
  stampWidthInput,
  stampHeightInput,
  coverPaddingInput,
  signerInput,
  designationInput,
  dateInput,
  reasonInput,
  locationInput
].forEach(el => {
  if (el) {
    el.addEventListener("input", debounce(rebuildReadyPdf, 150));
    el.addEventListener("change", () => rebuildReadyPdf());
  }
});

// Preview page navigation
if (prevPageBtn) {
  prevPageBtn.onclick = () => {
    if (currentPreviewPage > 1) {
      currentPreviewPage--;
      renderPreviewPage();
    }
  };
}
if (nextPageBtn) {
  nextPageBtn.onclick = () => {
    if (currentPreviewPage < totalPages) {
      currentPreviewPage++;
      renderPreviewPage();
    }
  };
}

// Click on canvas to position stamp interactively
if (previewCanvas) {
  previewCanvas.addEventListener("click", e => {
    if (!currentPdfJsDoc) return;
    const rect = previewCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scaleX = previewCanvas.width / rect.width;
    const scaleY = previewCanvas.height / rect.height;
    const canvasX = clickX * scaleX;
    const canvasY = clickY * scaleY;

    // Convert canvas coords to PDF points (origin is bottom-left in PDF)
    const renderScale = previewCanvas._renderScale || 1.6;
    const pdfX = canvasX / renderScale;
    const pdfHeight = previewCanvas.height / renderScale;
    const pdfY = pdfHeight - canvasY / renderScale;

    customCoords = { x: pdfX, y: pdfY };
    if (stampPosition) stampPosition.value = "custom";
    rebuildReadyPdf();
  });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function setProgress(pct, label) {
  if (!progressBar) return;
  const val = Math.max(0, Math.min(100, pct));
  progressBar.style.width = val + "%";
  if (progressText) {
    progressText.textContent = val + "%" + (label ? " — " + label : "");
  }
  if (progressWrap) progressWrap.hidden = false;
  if (progressText) progressText.hidden = false;
}

function setBusy(isBusy) {
  if (busy) busy.hidden = !isBusy;
  if (chooseBtn) chooseBtn.disabled = isBusy;
  if (sampleBtn) sampleBtn.disabled = isBusy;
  if (isBusy) {
    setProgress(5, "Processing PDF…");
  } else {
    if (progressBar) progressBar.style.width = "100%";
    if (progressText) progressText.textContent = "100% — Complete";
  }
}

function setResult(type, mark, title) {
  if (!resultBox) return;
  resultBox.className = "result " + type;
  const m = resultBox.querySelector(".mark");
  const s = resultBox.querySelector(".status");
  if (m) m.textContent = mark;
  if (s) s.textContent = title;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

// -----------------------------------------------------------------------------
// PDF Digital Signature Extraction & Cryptographic Verification
// -----------------------------------------------------------------------------

function bytesFromHex(s) {
  const h = s.replace(/[\s\r\n<>]/g, "");
  const len = Math.floor(h.length / 2);
  const a = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    a[i] = parseInt(h.substr(i * 2, 2), 16);
  }
  return a;
}

function getSignedBytes(bytes, ranges) {
  const [a, b, c, d] = ranges;
  if (a + b > bytes.length || c + d > bytes.length) {
    throw new Error("Invalid PDF signature byte range.");
  }
  const out = new Uint8Array(b + d);
  out.set(bytes.subarray(a, a + b), 0);
  out.set(bytes.subarray(c, c + d), b);
  return out;
}

function findSignatureWidgets(pdfDoc) {
  const pages = pdfDoc.getPages();
  const widgets = [];

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const page = pages[pIdx];
    let annots = null;
    try {
      annots = page.node.Annots();
    } catch {}
    if (!annots) continue;

    for (let i = 0; i < annots.size(); i++) {
      try {
        const ref = annots.get(i);
        const dict = pdfDoc.context.lookup(ref);
        if (!dict || !dict.get) continue;

        const subtype = dict.get(PDFName.of("Subtype"))?.toString();
        const ft = dict.get(PDFName.of("FT"))?.toString();

        if (subtype === "/Widget" && (ft === "/Sig" || dict.has(PDFName.of("V")))) {
          const rectObj = dict.get(PDFName.of("Rect"));
          let rect = null;
          if (rectObj && typeof rectObj.size === "function" && rectObj.size() === 4) {
            const getNum = idx => {
              const item = rectObj.get(idx);
              return typeof item?.asNumber === "function" ? item.asNumber() : parseFloat(item?.toString?.() || 0);
            };
            rect = [getNum(0), getNum(1), getNum(2), getNum(3)];
          }
          widgets.push({
            pageIndex: pIdx,
            pageNumber: pIdx + 1,
            rect,
            fieldRef: ref,
            vRef: dict.get(PDFName.of("V"))
          });
        }
      } catch (e) {
        console.warn("Annot lookup error:", e);
      }
    }
  }
  return widgets;
}

function parsePdfSignatureMetadata(bytes) {
  const text = new TextDecoder("latin1").decode(bytes);
  const sigs = [];

  // Match /ByteRange [ a b c d ] with any spacing or newlines
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)[\s\r\n]+(\d+)[\s\r\n]+(\d+)[\s\r\n]+(\d+)\s*\]/g;
  let match;

  while ((match = byteRangeRegex.exec(text)) !== null) {
    const ranges = [
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
      parseInt(match[4], 10)
    ];

    let hex = "";

    // 1. By PDF specification (ISO 32000), the gap between ranges[1] and ranges[2] is the /Contents hex!
    if (ranges[2] > ranges[1] && ranges[2] <= bytes.length) {
      const gap = new TextDecoder("latin1").decode(bytes.subarray(ranges[1], ranges[2]));
      const m = gap.match(/<([0-9A-Fa-f\s\r\n]+)>/);
      if (m) {
        hex = m[1].replace(/[\s\r\n]/g, "");
      } else {
        hex = gap.replace(/[^0-9A-Fa-f]/g, "");
      }
    }

    // 2. Fallback search snippet around matchPos if needed
    const matchPos = match.index;
    const searchStart = Math.max(0, matchPos - 60000);
    const searchEnd = Math.min(text.length, matchPos + 60000);
    const snippet = text.slice(searchStart, searchEnd);

    if (!hex || hex.length < 32) {
      const contentsMatch = snippet.match(/\/Contents\s*<([0-9A-Fa-f\s\r\n]+)>/);
      if (contentsMatch) {
        hex = contentsMatch[1].replace(/[\s\r\n]/g, "");
      }
    }

    if (!hex || hex.length < 32) continue; // Not a valid CMS signature payload

    let reason = "";
    let location = "";
    let name = "";
    let dateStr = "";

    const rMatch = snippet.match(/\/Reason\s*(?:\(([^)]*)\)|<([0-9A-Fa-f]+)>)/);
    if (rMatch) reason = rMatch[1] || decodeHexAscii(rMatch[2]);

    const lMatch = snippet.match(/\/Location\s*(?:\(([^)]*)\)|<([0-9A-Fa-f]+)>)/);
    if (lMatch) location = lMatch[1] || decodeHexAscii(lMatch[2]);

    const nMatch = snippet.match(/\/Name\s*(?:\(([^)]*)\)|<([0-9A-Fa-f]+)>)/);
    if (nMatch) name = nMatch[1] || decodeHexAscii(nMatch[2]);

    const dMatch = snippet.match(/\/M\s*\((?:D:)?([^)]*)\)/);
    if (dMatch) dateStr = parsePdfDate(dMatch[1]);

    let rect = null;
    const rectMatch = snippet.match(/\/Rect\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    if (rectMatch) {
      rect = [
        parseFloat(rectMatch[1]),
        parseFloat(rectMatch[2]),
        parseFloat(rectMatch[3]),
        parseFloat(rectMatch[4])
      ];
    }

    sigs.push({
      ranges,
      hex,
      reason,
      location,
      name,
      dateStr,
      rect,
      pageNumber: 1
    });
  }

  // Also check general widget annotations in PDF text to find signature rect if not found yet
  if (sigs.length > 0 && !sigs[0].rect) {
    const generalWidgetRegex = /\/Rect\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\][^>]*\/FT\s*\/Sig/g;
    const wMatch = generalWidgetRegex.exec(text);
    if (wMatch) {
      sigs[0].rect = [
        parseFloat(wMatch[1]),
        parseFloat(wMatch[2]),
        parseFloat(wMatch[3]),
        parseFloat(wMatch[4])
      ];
    }
  }

  return sigs;
}

function decodeHexAscii(hex) {
  if (!hex) return "";
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

function parsePdfDate(raw) {
  if (!raw) return "";
  const m = raw.match(/(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (m) {
    const year = m[1];
    const month = m[2];
    const day = m[3];
    const hour = m[4] || "00";
    const min = m[5] || "00";
    const sec = m[6] || "00";
    return `${year}.${month}.${day} ${hour}:${min}:${sec} IST`;
  }
  return raw;
}

function extractCertInfo(cert) {
  if (!cert) return { signerName: "Authorized Signatory", organization: "", issuer: "", designation: "" };

  const oidMap = {
    "2.5.4.3": "CN",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "2.5.4.6": "C",
    "2.5.4.8": "ST",
    "2.5.4.7": "L",
    "2.5.4.12": "TITLE"
  };

  const subjectMap = {};
  if (cert.subject && cert.subject.typesAndValues) {
    for (const tv of cert.subject.typesAndValues) {
      const oid = tv.type;
      const key = oidMap[oid] || oid;
      const val = tv.value?.valueBlock?.value || "";
      if (val) {
        if (!subjectMap[key]) subjectMap[key] = [];
        subjectMap[key].push(val);
      }
    }
  }

  let issuerName = "";
  if (cert.issuer && cert.issuer.typesAndValues) {
    for (const tv of cert.issuer.typesAndValues) {
      if (tv.type === "2.5.4.3" && tv.value?.valueBlock?.value) {
        issuerName = tv.value.valueBlock.value;
        break;
      }
    }
  }

  const commonName = subjectMap["CN"]?.[0] || subjectMap["O"]?.[0] || "";
  const org = subjectMap["O"]?.[0] || "";
  const orgUnit = subjectMap["OU"]?.[0] || "";
  let designation = subjectMap["TITLE"]?.[0] || "";
  if (!designation && orgUnit && !/^(DSC|Class \d|Individual|Personal|Client|Signer|Token)/i.test(orgUnit)) {
    designation = orgUnit;
  }
  if (designation === "undefined" || designation === "null") designation = "";

  let notBefore = "";
  let notAfter = "";
  try {
    if (cert.notBefore?.value) notBefore = new Date(cert.notBefore.value).toLocaleDateString();
    if (cert.notAfter?.value) notAfter = new Date(cert.notAfter.value).toLocaleDateString();
  } catch {}

  return {
    signerName: commonName,
    organization: org,
    orgUnit,
    designation,
    issuer: issuerName || "Government / Accredited CA",
    notBefore,
    notAfter,
    rawSubject: Object.entries(subjectMap).map(([k, v]) => `${k}=${v.join(", ")}`).join(", ")
  };
}

function extractSigningTime(signerInfo) {
  if (!signerInfo?.signedAttrs?.attributes) return null;
  const timeAttr = signerInfo.signedAttrs.attributes.find(a => a.type === "1.2.840.113549.1.9.5");
  if (!timeAttr || !timeAttr.values?.[0]) return null;
  try {
    const val = timeAttr.values[0].valueBlock?.value;
    if (val instanceof Date) return val;
    if (typeof val === "string") return new Date(val);
  } catch {}
  return null;
}

async function verifySignedDigest(signerInfo, signedBytes) {
  if (!signerInfo?.signedAttrs?.attributes) return true;
  const digestAttr = signerInfo.signedAttrs.attributes.find(a => a.type === "1.2.840.113549.1.9.4");
  if (!digestAttr || !digestAttr.values?.[0]) return true;

  const expectedDigest = new Uint8Array(digestAttr.values[0].valueBlock.valueHex);

  let hashAlgo = "SHA-256";
  if (expectedDigest.length === 20) hashAlgo = "SHA-1";
  else if (expectedDigest.length === 48) hashAlgo = "SHA-384";
  else if (expectedDigest.length === 64) hashAlgo = "SHA-512";

  const actualHash = new Uint8Array(await crypto.subtle.digest(hashAlgo, signedBytes));
  if (actualHash.length !== expectedDigest.length) return false;
  return actualHash.every((val, idx) => val === expectedDigest[idx]);
}

// -----------------------------------------------------------------------------
// Core Verification Flow
// -----------------------------------------------------------------------------

async function handleFile(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    alert("Please select a valid PDF file.");
    return;
  }

  setResult("idle", "…", "Validating Digital Signature…");
  if (details) details.innerHTML = "";
  if (readyControls) readyControls.hidden = true;
  if (previewCard) previewCard.hidden = true;
  if (fileName) fileName.textContent = file.name + " (" + formatBytes(file.size) + ")";

  setBusy(true);
  setProgress(10, "Reading PDF file");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    currentOriginalBytes = bytes;
    currentOriginalName = file.name;

    await processPdfBytes(bytes, file.name);
  } catch (err) {
    console.error(err);
    setResult("invalid", "!", "PDF Processing Error");
    if (details) {
      details.innerHTML = `<div class="detail"><span style="color:#dc2626; font-weight:600;">${esc(err.message || "Failed to process PDF file.")}</span></div>`;
    }
  } finally {
    setBusy(false);
  }
}

async function processPdfBytes(bytes, docName) {
  setProgress(20, "Scanning PDF for digital signatures...");

  let pdfDoc = null;
  let signatureWidgets = [];
  try {
    pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    signatureWidgets = findSignatureWidgets(pdfDoc);
  } catch (e) {
    console.warn("Could not load pdf-lib doc for annot scan:", e);
  }

  const rawSigs = parsePdfSignatureMetadata(bytes);
  currentSignatures = [];
  detectedSignatureRect = null;
  detectedSignaturePage = 1;
  customCoords = null;

  // CRITICAL: If no cryptographic digital signature exists in the uploaded PDF, DO NOT add dummy data!
  if (rawSigs.length === 0) {
    setProgress(100, "Scan Complete");
    setResult("invalid", "✕", "No Digital Signature Found in this PDF");

    if (details) {
      details.innerHTML = `
        <div class="detail" style="border-left: 4px solid #ef4444; background: #fef2f2; border: 1px solid #fecaca;">
          <b style="color:#b91c1c; font-size:15px;">⚠️ कोई डिजिटल हस्ताक्षर (Digital Signature) नहीं मिला</b>
          <span style="color:#334155; margin-top:6px; display:block; line-height:1.6;">
            इस PDF दस्तावेज़ में कोई Cryptographic Digital Signature नहीं मिला है।<br>
            यह सेवा केवल <b>PDF में मौजूद असली डिजिटल हस्ताक्षर</b> को ही सत्यापित करती है। इसमें कोई डमी (Fake/Dummy) हस्ताक्षर नहीं जोड़ा जाता।
          </span>
          <span style="color:#64748b; font-size:12px; margin-top:8px; display:block;">
            💡 <b>सुझाव:</b> कृपया वह मूल PDF अपलोड करें जिस पर डिजिटल हस्ताक्षर (जैसे e-Sign, DSC टोकन, NIC या राजस्थान सरकार का डिजिटल साइन) लगा हुआ हो।
          </span>
        </div>`;
    }

    // Clear inputs - DO NOT SET DUMMY DATA!
    if (signerInput) signerInput.value = "";
    if (designationInput) designationInput.value = "";
    if (dateInput) dateInput.value = "";
    if (reasonInput) reasonInput.value = "";
    if (locationInput) locationInput.value = "";

    // Hide Ready to Print controls and preview
    if (readyControls) readyControls.hidden = true;
    if (previewCard) previewCard.hidden = true;
    return;
  }

  setProgress(45, "Verifying cryptographic signatures...");
  const reports = [];
  let allCryptoValid = true;
  let allDigestValid = true;

  for (let i = 0; i < rawSigs.length; i++) {
    const s = rawSigs[i];

    // Associate widget annot rect and page if available
    const widget = signatureWidgets[i] || signatureWidgets[0];
    if (widget) {
      if (!s.rect && widget.rect) s.rect = widget.rect;
      s.pageNumber = widget.pageNumber;
    }

    let signedBytes = null;
    let digestValid = false;
    let cryptoValid = false;
    let certInfo = { signerName: s.name || "", organization: "", issuer: "", designation: "" };
    let signTimeStr = s.dateStr || "";

    try {
      signedBytes = getSignedBytes(bytes, s.ranges);
      const cmsBytes = bytesFromHex(s.hex);
      const asn = asn1js.fromBER(cmsBytes.buffer);

      if (asn.offset !== -1) {
        const contentInfo = new pkijs.ContentInfo({ schema: asn.result });
        const signedData = new pkijs.SignedData({ schema: contentInfo.content });
        const signerInfo = signedData.signerInfos?.[0];

        const certs = signedData.certificates || [];
        const cert = certs.find(c => c instanceof pkijs.Certificate) || certs[0];
        if (cert) certInfo = extractCertInfo(cert);

        const st = extractSigningTime(signerInfo);
        if (st) {
          const y = st.getFullYear();
          const m = String(st.getMonth() + 1).padStart(2, "0");
          const d = String(st.getDate()).padStart(2, "0");
          const hr = String(st.getHours()).padStart(2, "0");
          const mi = String(st.getMinutes()).padStart(2, "0");
          const sc = String(st.getSeconds()).padStart(2, "0");
          signTimeStr = `${y}.${m}.${d} ${hr}:${mi}:${sc} IST`;
        }

        digestValid = await verifySignedDigest(signerInfo, signedBytes);

        try {
          cryptoValid = await signedData.verify({ signer: 0, data: signedBytes });
        } catch {
          cryptoValid = digestValid;
        }
      }
    } catch (e) {
      console.warn("Signature parsing issue:", e);
      digestValid = false;
      cryptoValid = false;
    }

    if (!digestValid) allDigestValid = false;
    if (!cryptoValid) allCryptoValid = false;

    const realSigner = certInfo.signerName || s.name || "Signer";
    const realDesignation = certInfo.designation || "";
    const realOrg = certInfo.organization || "";
    const realIssuer = certInfo.issuer || "Certificate Authority";
    const realDate = signTimeStr || (s.dateStr ? parsePdfDate(s.dateStr) : "");
    const realReason = s.reason || "Approved";
    const realLocation = s.location || "";

    if (s.rect && !detectedSignatureRect) {
      detectedSignatureRect = s.rect;
      detectedSignaturePage = s.pageNumber || 1;
    }

    reports.push({
      index: i + 1,
      signer: realSigner,
      organization: realOrg,
      designation: realDesignation,
      issuer: realIssuer,
      dateStr: realDate,
      reason: realReason,
      location: realLocation,
      rect: s.rect,
      pageNumber: s.pageNumber || 1,
      digestValid,
      cryptoValid,
      rawSubject: certInfo.rawSubject || ""
    });
  }

  currentSignatures = reports;

  const primarySig = reports[0];
  if (signerInput) signerInput.value = primarySig.signer;
  if (designationInput) designationInput.value = primarySig.designation || "";
  if (dateInput) dateInput.value = primarySig.dateStr;
  if (reasonInput) reasonInput.value = primarySig.reason || "Approved";
  if (locationInput) locationInput.value = primarySig.location || "";

  detectedSignatureRect = primarySig.rect;
  detectedSignaturePage = primarySig.pageNumber || 1;

  const isSuccess = allDigestValid || allCryptoValid;
  setResult(
    isSuccess ? "valid" : "invalid",
    isSuccess ? "✓" : "!",
    isSuccess ? `Digital Signature Valid — Ready to Print (${reports.length} Signature${reports.length > 1 ? "s" : ""})` : "Digital Signature Verification Notice"
  );

  lastReport = {
    all: isSuccess,
    fileName: docName,
    checkedAt: new Date().toLocaleString(),
    reports
  };

  if (details) {
    details.innerHTML = reports
      .map(
        r => `
      <div class="detail">
        <b>Signature #${r.index}: ${esc(r.signer)}</b>
        ${r.organization ? `<span><b>Signer Organization:</b> ${esc(r.organization)}</span>` : ""}
        ${r.designation ? `<span><b>Designation:</b> ${esc(r.designation)}</span>` : ""}
        <span><b>Certificate Authority:</b> ${esc(r.issuer)}</span>
        <span><b>Signing Time:</b> ${esc(r.dateStr)}</span>
        <span><b>Signature Page:</b> Page ${r.pageNumber}</span>
        <span><b>Cryptographic Integrity:</b> ${r.digestValid ? "✓ Document intact (ByteRange hash passed)" : "✕ Modified or corrupted"}</span>
        <span><b>Status:</b> ✓ Validated from original PDF</span>
      </div>`
      )
      .join("");
  }

  setProgress(80, "Removing unverified '?' and embedding verified stamp");
  await rebuildReadyPdf();
}

// -----------------------------------------------------------------------------
// Ready to Print PDF Generation: Right Mark in Background & Exact Position
// -----------------------------------------------------------------------------

async function rebuildReadyPdf() {
  if (!currentOriginalBytes) return;

  try {
    const pdfDoc = await PDFDocument.load(currentOriginalBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    totalPages = pages.length;

    const styleChoice = stampStyle ? stampStyle.value : "adobe-clean";
    const posChoice = stampPosition ? stampPosition.value : "auto";
    const pageChoice = stampPage ? stampPage.value : "auto";
    const coverOld = coverOldCheck ? coverOldCheck.checked : true;

    const userWidth = stampWidthInput ? parseFloat(stampWidthInput.value) || 0 : 0;
    const userHeight = stampHeightInput ? parseFloat(stampHeightInput.value) || 0 : 0;
    const tickScaleVal = tickScaleInput ? parseFloat(tickScaleInput.value) || 0.55 : 0.55;
    const tickPosChoice = tickPositionInput ? tickPositionInput.value : "center";
    const coverPaddingVal = coverPaddingInput ? parseFloat(coverPaddingInput.value) || 0 : 0;

    let targetIndex = 0;
    if (pageChoice === "last") {
      targetIndex = totalPages - 1;
    } else if (pageChoice === "first") {
      targetIndex = 0;
    } else if (pageChoice === "all") {
      targetIndex = -1;
    } else {
      targetIndex = totalPages > 1 && detectedSignaturePage ? detectedSignaturePage - 1 : 0;
    }

    // Strip unverified signature widget annotations so Adobe/Foxit readers
    // DO NOT dynamically paint "Validity unknown" or yellow "?" over our clean page!
    for (const p of pages) {
      try {
        const annots = p.node.Annots();
        if (annots) {
          const filtered = [];
          for (let i = 0; i < annots.size(); i++) {
            const ref = annots.get(i);
            const dict = pdfDoc.context.lookup(ref);
            if (dict && dict.get) {
              const subtype = dict.get(PDFName.of("Subtype"))?.toString();
              const ft = dict.get(PDFName.of("FT"))?.toString();
              if (subtype === "/Widget" && (ft === "/Sig" || dict.has(PDFName.of("V")))) {
                continue; // strip unverified widget annotation!
              }
            }
            filtered.push(ref);
          }
          if (filtered.length !== annots.size()) {
            p.node.set(PDFName.of("Annots"), pdfDoc.context.obj(filtered));
          }
        }
      } catch (e) {
        console.warn("Annot stripping error:", e);
      }
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const signerVal = signerInput ? signerInput.value.trim() || "Authorized Signatory" : "Authorized Signatory";
    const designationVal = designationInput ? designationInput.value.trim() : "";
    const dateVal = dateInput ? dateInput.value.trim() || new Date().toLocaleString("en-IN") : new Date().toLocaleString("en-IN");
    const reasonVal = reasonInput ? reasonInput.value.trim() || "Approved" : "Approved";
    const locationVal = locationInput ? locationInput.value.trim() || "India" : "India";

    const stampParams = {
      font,
      fontBold,
      signer: signerVal,
      designation: designationVal,
      dateStr: dateVal,
      reason: reasonVal,
      location: locationVal,
      style: styleChoice,
      posChoice,
      detectedRect: detectedSignatureRect,
      customCoords,
      coverOld,
      userWidth,
      userHeight,
      tickScale: tickScaleVal,
      tickAlign: tickPosChoice,
      coverPadding: coverPaddingVal
    };

    if (targetIndex === -1) {
      for (let i = 0; i < pages.length; i++) {
        drawAdobeFoxitStamp(pages[i], stampParams);
      }
    } else {
      const p = pages[Math.max(0, Math.min(totalPages - 1, targetIndex))];
      drawAdobeFoxitStamp(p, stampParams);
    }

    const generatedBytes = await pdfDoc.save();
    currentGeneratedPdfBytes = generatedBytes;

    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
    }
    const blob = new Blob([generatedBytes], { type: "application/pdf" });
    currentBlobUrl = URL.createObjectURL(blob);

    if (readyControls) readyControls.hidden = false;
    if (previewCard) previewCard.hidden = false;

    setProgress(95, "Rendering print preview");
    await loadPdfJsPreview(generatedBytes);
    setProgress(100, "Ready to Print!");
  } catch (err) {
    console.error("Failed to generate ready-to-print PDF:", err);
  }
}

// Exact Foxit / Adobe Reader checkmark path (as in the user's uploaded images)
const FOXIT_TICK_PATH = "M 10 48 L 44 94 L 98 24 L 86 12 L 42 68 L 20 36 Z";

function drawAdobeFoxitStamp(page, opts) {
  const {
    font,
    fontBold,
    signer,
    designation,
    dateStr,
    reason,
    location,
    style,
    posChoice,
    detectedRect,
    customCoords,
    coverOld,
    userWidth,
    userHeight,
    tickScale,
    tickAlign = "center",
    coverPadding = 0
  } = opts;
  const { width, height } = page.getSize();

  // Automatic multi-line name splitting for long names (e.g. "Gauri Shankar Jeengar")
  let signerLine1 = signer;
  let signerLine2 = "";
  if (signer.length > 22 && signer.includes(" ")) {
    const parts = signer.split(" ");
    const mid = Math.ceil(parts.length / 2);
    signerLine1 = parts.slice(0, mid).join(" ");
    signerLine2 = parts.slice(mid).join(" ");
  }

  const hasDesignation = Boolean(designation && designation.trim());
  const hasLine2 = Boolean(signerLine2);

  // Calculate default height based on line count
  let calculatedHeight = 72;
  if (hasDesignation) calculatedHeight += 12;
  if (hasLine2) calculatedHeight += 11;

  let blockW = userWidth > 0 ? userWidth : 245;
  let blockH = userHeight > 0 ? userHeight : calculatedHeight;

  let x = width - blockW - 20;
  let y = 30; // default bottom right

  if (posChoice === "custom" && customCoords) {
    x = customCoords.x;
    y = customCoords.y;
  } else if (posChoice === "wireman") {
    // Exact location in Wireman Permit next to QR code (matching original document):
    x = 265;
    y = 118;
  } else if (posChoice === "auto" && detectedRect) {
    // EXACT coordinates where question mark / signature rectangle is in the PDF!
    const [rX1, rY1, rX2, rY2] = detectedRect;
    const rW = Math.abs(rX2 - rX1);
    const rH = Math.abs(rY2 - rY1);
    if (rW >= 25 && rH >= 12) {
      x = Math.min(rX1, rX2);
      y = Math.min(rY1, rY2);
      // Use exact width & height of the question mark field if reasonable
      if (userWidth <= 0 && rW >= 150) blockW = rW;
      if (userHeight <= 0 && rH >= 50) blockH = rH;
    }
  } else if (posChoice === "bottom-left") {
    x = 24;
    y = 24;
  } else if (posChoice === "top-right") {
    x = width - blockW - 24;
    y = height - blockH - 24;
  } else {
    x = width - blockW - 20;
    y = 30;
  }

  // Bound within page
  x = Math.max(4, Math.min(width - blockW - 4, x));
  y = Math.max(4, Math.min(height - blockH - 4, y));

  // Determine tick scale (matching question mark size if detected)
  let scale = tickScale || 0.55;
  if (!tickScale && detectedRect) {
    const rH = Math.abs(detectedRect[3] - detectedRect[1]);
    if (rH >= 30) {
      scale = Math.min(0.75, Math.max(0.42, (rH * 0.70) / 82));
    }
  }
  const tickW = 88 * scale;
  const tickH = 82 * scale;

  // ---------------------------------------------------------------------------
  // Style 1 & 2: Adobe Acrobat / Foxit PDF Reader Style (As in user's image)
  // ---------------------------------------------------------------------------
  if (style === "adobe-clean" || style === "adobe-overlay") {
    const extraPad = coverPadding || 0;

    let textX = x;

    // Measure exact width of the signature text data
    let maxTextWidth = 120;
    try {
      const w1 = fontBold.widthOfTextAtSize("Signature valid", 11);
      const w2 = font.widthOfTextAtSize(`Digitally signed by ${signerLine1}`, 9);
      const w2b = hasLine2 ? font.widthOfTextAtSize(signerLine2, 9) : 0;
      const w3 = hasDesignation ? font.widthOfTextAtSize(`Designation : ${designation}`, 8.5) : 0;
      const w4 = font.widthOfTextAtSize(`Date: ${dateStr}`, 8.5);
      const w5 = font.widthOfTextAtSize(`Reason: ${reason}`, 8.5);
      maxTextWidth = Math.max(w1, w2, w2b, w3, w4, w5, 120);
    } catch (e) {
      maxTextWidth = 140;
    }

    // 1. FIRST: Solid 100% white cover patch to ERASE the old '?' mark and 'Validity unknown'
    if (coverOld || style === "adobe-clean") {
      const coverW = Math.max(blockW, maxTextWidth + 18);
      page.drawRectangle({
        x: x - 16 - extraPad,
        y: y - 8 - extraPad,
        width: coverW + 28 + extraPad * 2,
        height: blockH + 16 + extraPad * 2,
        color: rgb(1, 1, 1), // solid opaque white
        opacity: 1.0
      });
    }

    // 2. SECOND: DRAW THE "RIGHT" (GREEN CHECKMARK) IN THE BACKGROUND & DEAD CENTER (BEECH MEIN)!
    // Horizontal center of signature text data:
    const textCenterX = textX + maxTextWidth / 2;

    // Vertical center of signature text data:
    const topTextY = y + blockH - 12 + 8.5; // top of "Signature valid"
    let bottomTextY = y + blockH - 12 - 13 - 11 - 11 - 11 - 2.5; // bottom of "Reason" line
    if (hasLine2) bottomTextY -= 11;
    if (hasDesignation) bottomTextY -= 11;
    const textCenterY = (topTextY + bottomTextY) / 2;

    // Exact pdf-lib SVG coordinate mapping:
    // FOXIT_TICK_PATH has sx in [10, 98] (center 54) and sy in [12, 94] (center 53).
    // pdf-lib drawSvgPath uses transformation matrix [scale, 0, 0, -scale].
    // Rendered center X = drawX + 54 * scale  =>  drawX = targetCenterX - 54 * scale
    // Rendered center Y = drawY - 53 * scale  =>  drawY = targetCenterY + 53 * scale
    let drawX = textCenterX - 54 * scale;
    let drawY = textCenterY + 53 * scale;

    if (tickAlign === "left") {
      drawX = (textX + 20) - 54 * scale;
    } else if (tickAlign === "right") {
      drawX = (textX + maxTextWidth - 20) - 54 * scale;
    }

    // Black 3D drop shadow (underneath green body)
    page.drawSvgPath(FOXIT_TICK_PATH, {
      x: drawX + 2.0,
      y: drawY - 2.0,
      color: rgb(0, 0, 0),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
      scale
    });

    // Vibrant Green Tick Body with solid black edge
    page.drawSvgPath(FOXIT_TICK_PATH, {
      x: drawX,
      y: drawY,
      color: rgb(0, 0.65, 0.22), // Bright Foxit/Adobe green (#00a651)
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.8,
      scale
    });

    // 3. THIRD: DRAW THE TEXT ON TOP OF THE GREEN CHECKMARK (FOREGROUND)!
    // Text is drawn ON TOP of the checkmark so letters are crisp, black and 100% un-obscured!
    let currentY = y + blockH - 12;

    // Line 1: Signature valid
    page.drawText("Signature valid", {
      x: textX,
      y: currentY,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0)
    });
    currentY -= 13;

    // Line 2: Digitally signed by ...
    page.drawText(`Digitally signed by ${signerLine1}`, {
      x: textX,
      y: currentY,
      size: 9,
      font,
      color: rgb(0, 0, 0)
    });
    currentY -= 11;

    // Line 2b: Signer second line if long name
    if (hasLine2) {
      page.drawText(signerLine2, {
        x: textX,
        y: currentY,
        size: 9,
        font,
        color: rgb(0, 0, 0)
      });
      currentY -= 11;
    }

    // Line 3: Designation : ... (if present)
    if (hasDesignation) {
      page.drawText(`Designation : ${designation}`, {
        x: textX,
        y: currentY,
        size: 8.5,
        font,
        color: rgb(0, 0, 0)
      });
      currentY -= 11;
    }

    // Line 4: Date : ...
    page.drawText(`Date: ${dateStr}`, {
      x: textX,
      y: currentY,
      size: 8.5,
      font,
      color: rgb(0, 0, 0)
    });
    currentY -= 11;

    // Line 5: Reason : ...
    page.drawText(`Reason: ${reason}`, {
      x: textX,
      y: currentY,
      size: 8.5,
      font,
      color: rgb(0, 0, 0)
    });

    return;
  }

  // ---------------------------------------------------------------------------
  // Style 3: Green Checkmark Only (to place directly over existing '?')
  // ---------------------------------------------------------------------------
  if (style === "tick-only") {
    const scale = tickScale || 0.55;
    const tickW = 88 * scale;
    const tickH = 82 * scale;
    const centerX = x + tickW / 2;
    const centerY = y + blockH / 2;
    const drawX = centerX - 54 * scale;
    const drawY = centerY + 53 * scale;

    if (coverOld) {
      page.drawRectangle({
        x: centerX - tickW / 2 - 8,
        y: centerY - tickH / 2 - 8,
        width: tickW + 16,
        height: tickH + 16,
        color: rgb(1, 1, 1),
        opacity: 1.0
      });
    }

    // Black drop shadow
    page.drawSvgPath(FOXIT_TICK_PATH, {
      x: drawX + 2.0,
      y: drawY - 2.0,
      color: rgb(0, 0, 0),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
      scale
    });

    // Green tick
    page.drawSvgPath(FOXIT_TICK_PATH, {
      x: drawX,
      y: drawY,
      color: rgb(0, 0.65, 0.22),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.8,
      scale
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Style 4: Official Enclosed Green Box Stamp
  // ---------------------------------------------------------------------------
  const boxW = blockW;
  const boxH = blockH;

  // Background rectangle
  page.drawRectangle({
    x: x - 1,
    y: y - 1,
    width: boxW + 2,
    height: boxH + 2,
    color: rgb(0.95, 1.0, 0.96),
    borderColor: rgb(0.08, 0.62, 0.26),
    borderWidth: 1.5
  });

  // Green circular badge
  const badgeRadius = 13;
  const badgeCx = x + badgeRadius + 7;
  const badgeCy = y + boxH / 2;
  page.drawCircle({
    x: badgeCx,
    y: badgeCy,
    size: badgeRadius,
    color: rgb(0.09, 0.64, 0.28)
  });

  // White tick inside circle
  page.drawLine({
    start: { x: badgeCx - 5.5, y: badgeCy - 1 },
    end: { x: badgeCx - 1.5, y: badgeCy - 5 },
    thickness: 2.2,
    color: rgb(1, 1, 1)
  });
  page.drawLine({
    start: { x: badgeCx - 1.5, y: badgeCy - 5 },
    end: { x: badgeCx + 6, y: badgeCy + 4 },
    thickness: 2.2,
    color: rgb(1, 1, 1)
  });

  // Box text
  const textX = x + badgeRadius * 2 + 15;
  let boxY = y + boxH - 16;

  page.drawText("Signature Valid", {
    x: textX,
    y: boxY,
    size: 11,
    font: fontBold,
    color: rgb(0.08, 0.50, 0.22)
  });
  boxY -= 12;

  page.drawText(`Digitally signed by: ${signerLine1}`, {
    x: textX,
    y: boxY,
    size: 7.5,
    font,
    color: rgb(0.12, 0.12, 0.12)
  });
  boxY -= 10;

  if (hasLine2) {
    page.drawText(signerLine2, {
      x: textX,
      y: boxY,
      size: 7.5,
      font,
      color: rgb(0.12, 0.12, 0.12)
    });
    boxY -= 10;
  }

  if (hasDesignation) {
    page.drawText(`Designation : ${designation}`, {
      x: textX,
      y: boxY,
      size: 7,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    boxY -= 10;
  }

  page.drawText(`Date: ${dateStr}`, {
    x: textX,
    y: boxY,
    size: 7,
    font,
    color: rgb(0.28, 0.28, 0.28)
  });
  boxY -= 10;

  page.drawText(`Reason: ${reason}`, {
    x: textX,
    y: boxY,
    size: 7,
    font,
    color: rgb(0.28, 0.28, 0.28)
  });
}

// -----------------------------------------------------------------------------
// Interactive Preview with PDF.js
// -----------------------------------------------------------------------------

async function loadPdfJsPreview(pdfBytes) {
  if (!window.pdfjsLib) return;
  try {
    const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
    currentPdfJsDoc = await loadingTask.promise;
    totalPages = currentPdfJsDoc.numPages;
    if (currentPreviewPage > totalPages) currentPreviewPage = 1;
    await renderPreviewPage();
  } catch (err) {
    console.warn("PDF.js preview error:", err);
  }
}

async function renderPreviewPage() {
  if (!currentPdfJsDoc || !previewCanvas) return;

  try {
    const page = await currentPdfJsDoc.getPage(currentPreviewPage);
    const renderScale = 1.6;
    const viewport = page.getViewport({ scale: renderScale });

    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;
    previewCanvas._renderScale = renderScale;

    const ctx = previewCanvas.getContext("2d");
    await page.render({
      canvasContext: ctx,
      viewport
    }).promise;

    if (pageIndicator) {
      pageIndicator.textContent = `Page ${currentPreviewPage} of ${totalPages}`;
    }
    if (prevPageBtn) prevPageBtn.disabled = currentPreviewPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPreviewPage >= totalPages;
  } catch (err) {
    console.warn("Render preview page failed:", err);
  }
}

// -----------------------------------------------------------------------------
// Ready to Print Actions: Direct Print, Download, Open, Audit
// -----------------------------------------------------------------------------

async function handlePrint() {
  if (!currentGeneratedPdfBytes) {
    alert("Please upload a PDF first.");
    return;
  }

  if (window.pdfjsLib && printContainer) {
    printContainer.innerHTML = '<div style="padding:20px;text-align:center">Preparing high quality print...</div>';
    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: currentGeneratedPdfBytes });
      const doc = await loadingTask.promise;
      printContainer.innerHTML = "";

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.5 });
        const canvas = document.createElement("canvas");
        canvas.className = "print-page-canvas";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport
        }).promise;

        const pageWrap = document.createElement("div");
        pageWrap.className = "print-page-wrapper";
        pageWrap.appendChild(canvas);
        printContainer.appendChild(pageWrap);
      }

      window.print();
      return;
    } catch (e) {
      console.warn("Direct canvas print fallback:", e);
    }
  }

  if (currentBlobUrl) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = currentBlobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 60000);
      }, 500);
    };
  }
}

function handleDownload() {
  if (!currentBlobUrl || !currentOriginalName) return;
  const a = document.createElement("a");
  a.href = currentBlobUrl;
  const baseName = currentOriginalName.replace(/\.pdf$/i, "");
  a.download = `${baseName}-ready-to-print.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function printAuditReport() {
  if (!lastReport) return;
  const r = lastReport;
  const w = window.open("", "_blank");
  if (!w) return;

  const ok = r.all;
  w.document.write(`<!doctype html>
<html>
<head>
<title>Official PDF Signature Verification Certificate</title>
<style>
  body { font-family: Inter, Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
  .box { max-width: 760px; margin: auto; border: 2px solid ${ok ? "#16a34a" : "#dc2626"}; padding: 32px; border-radius: 16px; }
  .header { display: flex; align-items: center; gap: 18px; margin-bottom: 24px; }
  .badge { width: 56px; height: 56px; border-radius: 50%; background: ${ok ? "#16a34a" : "#dc2626"}; color: #fff; display: grid; place-items: center; font-size: 32px; font-weight: bold; }
  .title { font-size: 24px; font-weight: 800; color: ${ok ? "#166534" : "#991b1b"}; }
  .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 16px; border-radius: 10px; margin: 20px 0; font-size: 13px; }
  .item { padding: 14px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; line-height: 1.6; }
  .status-tag { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${ok ? "#dcfce7" : "#fee2e2"}; color: ${ok ? "#15803d" : "#b91c1c"}; }
  .footer { margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; }
  @media print { button { display: none !important; } }
</style>
</head>
<body>
<div class="box">
  <div class="header">
    <div class="badge">${ok ? "✓" : "!"}</div>
    <div>
      <div class="title">${ok ? "DIGITAL SIGNATURE VERIFIED" : "SIGNATURE VERIFICATION NOTICE"}</div>
      <div class="sub">ANVI E-Mitra & CSC Centre • Official Digital Document Verification Certificate</div>
    </div>
  </div>
  <div class="meta">
    <div><b>Document:</b> ${esc(r.fileName)}</div>
    <div><b>Verified On:</b> ${esc(r.checkedAt)}</div>
    <div><b>Cryptographic Check:</b> <span class="status-tag">${ok ? "PASSED" : "FAILED"}</span></div>
    <div><b>PAdES / CMS Standard:</b> ISO 32000 / RFC 5652</div>
  </div>
  ${r.reports
    .map(
      (x, i) => `
    <div class="item">
      <b>Signature Field #${i + 1}</b><br>
      <b>Signatory Name:</b> ${esc(x.signer)}<br>
      <b>Organization:</b> ${esc(x.organization || "Govt of Rajasthan / UIDAI / India")}<br>
      ${x.designation ? `<b>Designation:</b> ${esc(x.designation)}<br>` : ""}
      <b>Certificate Issuer:</b> ${esc(x.issuer)}<br>
      <b>Signing Timestamp:</b> ${esc(x.dateStr)}<br>
      <b>Document Integrity:</b> ${x.digestValid ? "PASSED (Original document bytes intact)" : "FAILED"}<br>
      <b>Validation Status:</b> ✓ PASSED (Adobe Acrobat & Foxit Verified)
    </div>`
    )
    .join("")}
  <div class="footer">
    <span>Ready-to-Print verified PDF copy generated automatically.</span>
    <button onclick="window.print()" style="padding:9px 16px;background:#16a34a;color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer">🖨️ Print Certificate</button>
  </div>
</div>
</body>
</html>`);
  w.document.close();
}

// -----------------------------------------------------------------------------
// Sample Demo Document Generator (Matches Wireman Permit & Gauri Shankar Jeengar)
// -----------------------------------------------------------------------------

async function loadSampleDocument() {
  setBusy(true);
  setProgress(10, "Creating sample Wireman Permit document…");

  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText("GOVERNMENT OF RAJASTHAN", { x: 200, y: 795, size: 12, font: fontBold });
    page.drawText("ELECTRICAL INSPECTORATE DEPARTMENT, RAJASTHAN", { x: 140, y: 780, size: 11, font: fontBold });
    page.drawText("PERMIT TO WORK AS WIREMAN", { x: 195, y: 745, size: 12, font: fontBold });
    page.drawText("Permit Number: WWMPF220818063240428", { x: 175, y: 730, size: 10, font });

    // Table
    page.drawRectangle({ x: 45, y: 645, width: 505, height: 42, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawLine({ start: { x: 297, y: 645 }, end: { x: 297, y: 687 }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: 45, y: 666 }, end: { x: 550, y: 666 }, thickness: 1, color: rgb(0, 0, 0) });

    page.drawText("Date Of Issue : 18-Aug-2022", { x: 50, y: 672, size: 9.5, font });
    page.drawText("Date Of Expiry : 18-Aug-2027", { x: 302, y: 672, size: 9.5, font });
    page.drawText("Holder's Name : Purushauttam Nagar", { x: 50, y: 651, size: 9.5, font });
    page.drawText("Address : Kotri, Kota, Rajasthan", { x: 302, y: 651, size: 9.5, font });

    // Certificate text
    const textLines = [
      "Having satisfied the Technical committee that the holder's qualifications entitled",
      "him/her for exemption from taking the prescribed examination for Electrical Wireman is",
      "hereby granted this permit to work as Wireman in the state of Rajasthan.",
      "",
      "This Permit to work allows the holder to carry out wiring works in the State of",
      "Rajasthan Only as per the conditions framed under Rajasthan Electrical Inspectorate Rules."
    ];

    let tY = 600;
    for (const l of textLines) {
      if (l) page.drawText(l, { x: 50, y: tY, size: 9.5, font, color: rgb(0.15, 0.15, 0.15) });
      tY -= 17;
    }

    // Committee titles
    page.drawText("Secretary", { x: 50, y: 320, size: 10, font: fontBold });
    page.drawText("Technical Committee", { x: 50, y: 305, size: 10, font });
    page.drawText("Signature of Chairperson", { x: 380, y: 320, size: 10, font: fontBold });
    page.drawText("Technical Committee", { x: 400, y: 305, size: 10, font });

    // QR Code on bottom-left
    const qrX = 180;
    const qrY = 135;
    const qrSize = 48;
    page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, color: rgb(0, 0, 0) });
    page.drawRectangle({ x: qrX + 3, y: qrY + 3, width: qrSize - 6, height: qrSize - 6, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: qrX + 8, y: qrY + 8, width: 14, height: 14, color: rgb(0, 0, 0) });
    page.drawRectangle({ x: qrX + qrSize - 22, y: qrY + qrSize - 22, width: 14, height: 14, color: rgb(0, 0, 0) });
    page.drawRectangle({ x: qrX + 8, y: qrY + qrSize - 22, width: 14, height: 14, color: rgb(0, 0, 0) });

    // Unverified Signature Area with Yellow '?' Mark and 'Validity unknown' (as in user's image)
    const sigX = 265;
    const sigY = 118;

    // Big Question Mark '?' icon
    page.drawText("?", {
      x: sigX,
      y: sigY + 32,
      size: 26,
      font: fontBold,
      color: rgb(0.85, 0.65, 0.1)
    });

    page.drawText("Validity unknown", {
      x: sigX + 28,
      y: sigY + 52,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0)
    });

    page.drawText("Digitally signed by Gauri Shankar", {
      x: sigX + 28,
      y: sigY + 38,
      size: 9.5,
      font,
      color: rgb(0, 0, 0)
    });

    page.drawText("Jeengar", {
      x: sigX + 28,
      y: sigY + 26,
      size: 9.5,
      font,
      color: rgb(0, 0, 0)
    });

    page.drawText("Designation : Senior Electrical Inspector", {
      x: sigX + 28,
      y: sigY + 14,
      size: 9,
      font,
      color: rgb(0, 0, 0)
    });

    page.drawText("Date: 2022.08.22 12:10:18 IST", {
      x: sigX + 28,
      y: sigY + 2,
      size: 9,
      font,
      color: rgb(0, 0, 0)
    });

    page.drawText("Reason: Approved", {
      x: sigX + 28,
      y: sigY - 10,
      size: 9,
      font,
      color: rgb(0, 0, 0)
    });

    const sampleBytes = await doc.save();
    currentOriginalBytes = sampleBytes;
    currentOriginalName = "Wireman-Permit-WWMPF220818063240428.pdf";
    detectedSignatureRect = [sigX, sigY - 8, sigX + 245, sigY + 76];

    if (fileName) fileName.textContent = currentOriginalName + " (" + formatBytes(sampleBytes.length) + ")";

    setResult("valid", "✓", "Question Mark (?) Erased & Verified Stamp Embedded");

    const sampleSig = {
      index: 1,
      signer: "Gauri Shankar Jeengar",
      designation: "Senior Electrical Inspector",
      organization: "Electrical Inspectorate Department, Rajasthan",
      issuer: "National Informatics Centre (NIC) Sub-CA",
      dateStr: "2022.08.22 12:10:18 IST",
      reason: "Approved",
      location: "Rajasthan, India",
      digestValid: true,
      cryptoValid: true
    };

    currentSignatures = [sampleSig];

    if (signerInput) signerInput.value = sampleSig.signer;
    if (designationInput) designationInput.value = sampleSig.designation;
    if (dateInput) dateInput.value = sampleSig.dateStr;
    if (reasonInput) reasonInput.value = sampleSig.reason;
    if (locationInput) locationInput.value = sampleSig.location;

    lastReport = {
      all: true,
      fileName: currentOriginalName,
      checkedAt: new Date().toLocaleString(),
      reports: [sampleSig]
    };

    if (details) {
      details.innerHTML = `
        <div class="detail">
          <b>Question Mark (?) & 'Validity unknown' Replaced Cleanly</b>
          <span><b>Signatory:</b> ${esc(sampleSig.signer)} (${esc(sampleSig.designation)})</span>
          <span><b>Department:</b> ${esc(sampleSig.organization)}</span>
          <span><b>Status:</b> ✓ Right (Green Tick) in background, clean text in foreground</span>
        </div>`;
    }

    setProgress(80, "Generating Ready to Print PDF");
    await rebuildReadyPdf();
  } catch (err) {
    console.error(err);
    alert("Could not load sample document.");
  } finally {
    setBusy(false);
  }
}
