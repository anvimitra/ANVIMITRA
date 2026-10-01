import * as pkijs from "pkijs";

const fileInput = document.getElementById("pdfFile");
const dropzone = document.getElementById("dropzone");
const chooseBtn = document.getElementById("chooseBtn");
const result = document.getElementById("result");
const details = document.getElementById("details");
const fileName = document.getElementById("fileName");
const printBtn = document.getElementById("printBtn");
const openBtn = document.getElementById("openBtn");
const busy = document.getElementById("busy");

let currentUrl = "";
let lastReport = null;

chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => fileInput.files[0] && validate(fileInput.files[0]));
["dragenter","dragover"].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.add("drag"); }));
["dragleave","drop"].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.remove("drag"); }));
dropzone.addEventListener("drop", ev => {
  const file = ev.dataTransfer.files?.[0];
  if (file) validate(file);
});
printBtn.addEventListener("click", printReport);
openBtn.addEventListener("click", () => currentUrl && window.open(currentUrl, "_blank", "noopener"));

function setBusy(on) {
  busy.hidden = !on;
  chooseBtn.disabled = on;
}

function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, "");
  if (!clean || clean.length % 2) throw new Error("Invalid signature data.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out.buffer;
}

function concatRanges(bytes, ranges) {
  const [a,b,c,d] = ranges;
  if (a !== 0 || b < 0 || c < 0 || d < 0 || a + b > bytes.length || c + d > bytes.length) {
    throw new Error("Invalid PDF ByteRange.");
  }
  const out = new Uint8Array(b + d);
  out.set(bytes.slice(a, a + b), 0);
  out.set(bytes.slice(c, c + d), b);
  return out.buffer;
}

function extractSignatures(bytes) {
  const text = new TextDecoder("latin1").decode(bytes);
  const signatures = [];
  const byteRangeRe = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let match;
  while ((match = byteRangeRe.exec(text))) {
    const ranges = match.slice(1).map(Number);
    const searchEnd = Math.min(text.length, match.index + 2_000_000);
    const tail = text.slice(match.index, searchEnd);
    const contentsMatch = /\/Contents\s*<([0-9A-Fa-f\s]+)>/.exec(tail);
    if (!contentsMatch) continue;
    signatures.push({ ranges, hex: contentsMatch[1] });
  }
  return signatures;
}

function signerName(cms) {
  try {
    const certs = cms.certificates || [];
    const cert = certs.find(c => c instanceof pkijs.Certificate) || certs[0];
    return cert?.subject?.typesAndValues?.map(x => x.value?.valueBlock?.value).filter(Boolean).join(", ") || "Signer certificate found";
  } catch { return "Signer certificate found"; }
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  return (n/1024/1024).toFixed(2) + " MB";
}

async function validate(file) {
  result.className = "result idle";
  result.querySelector(".status").textContent = "Checking…";
  details.innerHTML = "";
  printBtn.hidden = true;
  openBtn.hidden = true;
  setBusy(true);
  fileName.textContent = file.name;
  lastReport = null;

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder("ascii").decode(bytes.slice(0,5)) !== "%PDF-") throw new Error("This file is not a PDF.");

    const signatures = extractSignatures(bytes);
    if (!signatures.length) throw new Error("No PDF digital signature with ByteRange/Contents was found.");

    const reports = [];
    for (let i = 0; i < signatures.length; i++) {
      const s = signatures[i];
      const signedData = concatRanges(bytes, s.ranges);
      const cmsRaw = hexToBytes(s.hex.replace(/0+$/,""));
      const cmsContent = pkijs.ContentInfo.fromBER(cmsRaw);
      if (cmsContent.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error("Signature " + (i+1) + " is not CMS SignedData.");

      const cms = new pkijs.SignedData({ schema: cmsContent.content });
      const verifyResult = await cms.verify({ signer: 0, data: signedData });
      const digestOK = await verifySignedAttributesDigest(cms, signedData);
      reports.push({
        valid: Boolean(verifyResult) && digestOK,
        signer: signerName(cms),
        digestOK,
        cryptoOK: Boolean(verifyResult),
        size: formatBytes(bytes.length)
      });
    }

    const allValid = reports.every(x => x.valid);
    lastReport = { allValid, reports, fileName: file.name, fileSize: formatBytes(file.size), checkedAt: new Date().toLocaleString() };
    result.className = "result " + (allValid ? "valid" : "invalid");
    result.querySelector(".mark").textContent = allValid ? "✓" : "!";
    result.querySelector(".status").textContent = allValid ? "Digital Signature Valid" : "Signature Validation Failed";
    details.innerHTML = reports.map((r,i) =>
      '<div class="detail"><b>Signature '+(i+1)+'</b><span>'+escapeHtml(r.signer)+'</span><span>Cryptographic check: '+(r.cryptoOK ? '✓ Passed' : '✕ Failed')+'</span><span>Document hash/ByteRange: '+(r.digestOK ? '✓ Passed' : '✕ Failed')+'</span></div>'
    ).join("");
    printBtn.hidden = false;
    openBtn.hidden = false;
  } catch (err) {
    result.className = "result invalid";
    result.querySelector(".mark").textContent = "!";
    result.querySelector(".status").textContent = err?.message || "Could not validate this PDF.";
    details.innerHTML = '<div class="detail"><span>Try an Adobe/PAdES digitally signed PDF containing a standard PDF signature field.</span></div>';
  } finally {
    setBusy(false);
  }
}

async function verifySignedAttributesDigest(cms, data) {
  const info = cms.signerInfos?.[0];
  if (!info?.signedAttrs?.attributes?.length) return true;
  const attr = info.signedAttrs.attributes.find(a => a.type === "1.2.840.113549.1.9.4");
  if (!attr) return false;
  const alg = info.digestAlgorithm?.algorithmId;
  const names = {
    "1.3.14.3.2.26":"SHA-1",
    "2.16.840.1.101.3.4.2.1":"SHA-256",
    "2.16.840.1.101.3.4.2.2":"SHA-384",
    "2.16.840.1.101.3.4.2.3":"SHA-512"
  };
  if (!names[alg]) return false;
  const digest = new Uint8Array(await crypto.subtle.digest(names[alg], data));
  const expected = new Uint8Array(attr.values[0].valueBlock.valueHex);
  if (digest.length !== expected.length) return false;
  return digest.every((v,i) => v === expected[i]);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function printReport() {
  if (!lastReport) return;
  const w = window.open("", "_blank", "noopener");
  if (!w) return;
  const r = lastReport;
  w.document.write('<!doctype html><html><head><title>PDF Signature Validation</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#111}.box{border:2px solid #16a34a;padding:28px;border-radius:18px;max-width:720px;margin:auto}.mark{font-size:70px;color:#16a34a;font-weight:800}.title{font-size:28px;font-weight:800;color:#166534}.muted{color:#555}.item{padding:12px 0;border-bottom:1px solid #ddd}@media print{button{display:none}}</style></head><body><div class="box"><div class="mark">'+(r.allValid?'✓':'!')+'</div><div class="title">'+(r.allValid?'DIGITAL SIGNATURE VALID':'DIGITAL SIGNATURE VALIDATION FAILED')+'</div><p><b>File:</b> '+escapeHtml(r.fileName)+'</p><p><b>Size:</b> '+r.fileSize+'</p><p><b>Checked:</b> '+escapeHtml(r.checkedAt)+'</p>'+r.reports.map((x,i)=>'<div class="item"><b>Signature '+(i+1)+'</b><br>Signer: '+escapeHtml(x.signer)+'<br>Cryptographic verification: '+(x.cryptoOK?'PASSED':'FAILED')+'<br>Signed-data hash: '+(x.digestOK?'PASSED':'FAILED')+'</div>').join('')+'<p class="muted">This is a validation report. The original signed PDF is not modified.</p><button onclick="window.print()">Print / Save as PDF</button></div></body></html>');
  w.document.close();
}

