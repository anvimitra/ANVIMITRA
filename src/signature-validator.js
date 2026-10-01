import * as pkijs from "https://cdn.jsdelivr.net/npm/pkijs@3.2.4/+esm";
import * as asn1js from "https://cdn.jsdelivr.net/npm/asn1js@3.0.5/+esm";

const $ = id => document.getElementById(id);
const fileInput=$("pdfFile"), dropzone=$("dropzone"), chooseBtn=$("chooseBtn"), result=$("result");
const details=$("details"), fileName=$("fileName"), printBtn=$("printBtn"), openBtn=$("openBtn"), busy=$("busy");
let currentUrl="", lastReport=null;

chooseBtn.onclick=()=>fileInput.click();
fileInput.onchange=()=>fileInput.files[0]&&validate(fileInput.files[0]);
["dragenter","dragover"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",e=>{const f=e.dataTransfer.files?.[0];if(f)validate(f)});
printBtn.onclick=printReport;
openBtn.onclick=()=>currentUrl&&window.open(currentUrl,"_blank","noopener");

function busyState(v){busy.hidden=!v;chooseBtn.disabled=v}
function setResult(type,mark,status){result.className="result "+type;result.querySelector(".mark").textContent=mark;result.querySelector(".status").textContent=status}
function bytesFromHex(s){const h=s.replace(/\s/g,"");if(h.length%2)throw Error("Invalid PDF signature contents.");const a=new Uint8Array(h.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(h.slice(i*2,i*2+2),16);return a}
function signedBytes(b,r){const[a,l,c,n]=r;if(a!==0||a+l> b.length||c+n>b.length)throw Error("Invalid PDF ByteRange.");const o=new Uint8Array(l+n);o.set(b.slice(a,a+l));o.set(b.slice(c,c+n),l);return o}
function extract(bytes){
  const s=new TextDecoder("latin1").decode(bytes), out=[];
  const re=/\\/ByteRange\\s*\\[\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*\\]/g; let m;
  while((m=re.exec(s))){
    const ranges=m.slice(1).map(Number), pos=m.index, end=Math.min(s.length,pos+300000);
    const tail=s.slice(pos,end);
    const cm=tail.match(/\\/Contents\\s*<([0-9A-Fa-f\\s]+)>/);
    if(cm)out.push({ranges,hex:cm[1]});
  }
  return out;
}
function certName(sd){
  try{
    const cert=(sd.certificates||[]).find(x=>x instanceof pkijs.Certificate)||(sd.certificates||[])[0];
    if(!cert)return "Certificate found";
    return cert.subject.typesAndValues.map(x=>x.value.valueBlock.value).filter(Boolean).join(", ")||"Certificate found";
  }catch{return "Certificate found"}
}
async function validate(file){
  setResult("idle","…","Checking digital signature…");details.innerHTML="";printBtn.hidden=openBtn.hidden=true;busyState(true);fileName.textContent=file.name;lastReport=null;
  if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(file);
  try{
    const b=new Uint8Array(await file.arrayBuffer());
    if(new TextDecoder().decode(b.slice(0,5))!=="%PDF-")throw Error("Please upload a PDF file.");
    const sigs=extract(b);if(!sigs.length)throw Error("No standard PDF digital signature was found.");
    const reports=[];
    for(const s of sigs){
      const signed=signedBytes(b,s.ranges);
      const cms=bytesFromHex(s.hex);
      const asn=asn1js.fromBER(cms.buffer);if(asn.offset===-1)throw Error("Digital signature data could not be read.");
      const ci=new pkijs.ContentInfo({schema:asn.result});
      if(ci.contentType!==pkijs.ContentInfo.SIGNED_DATA)throw Error("Unsupported PDF signature format.");
      const sd=new pkijs.SignedData({schema:ci.content});
      const si=sd.signerInfos?.[0];if(!si)throw Error("Signer information is missing.");
      let cryptoOK=false;
      try{cryptoOK=await sd.verify({signer:0,data:signed});}catch(e){cryptoOK=false}
      reports.push({valid:Boolean(cryptoOK),cryptoOK,signer:certName(sd)});
    }
    const all=reports.length>0&&reports.every(x=>x.valid);
    lastReport={all,reports,fileName:file.name,fileSize:file.size,checkedAt:new Date().toLocaleString()};
    setResult(all?"valid":"invalid",all?"✓":"!",all?"Digital Signature Valid":"Signature Validation Failed");
    details.innerHTML=reports.map((r,i)=>'<div class="detail"><b>Signature '+(i+1)+'</b><span>Signer: '+esc(r.signer)+'</span><span>Cryptographic verification: '+(r.cryptoOK?"✓ Passed":"✕ Failed")+'</span><span>PDF signed bytes: '+(r.valid?"✓ Integrity verified":"✕ Integrity could not be verified")+'</span></div>').join("");
    printBtn.hidden=openBtn.hidden=false;
  }catch(e){
    setResult("invalid","!","Validation could not be completed");
    details.innerHTML='<div class="detail"><span>'+esc(e.message||"Unsupported or damaged signed PDF.")+'</span><span>This tool supports standard PDF CMS/PKCS#7 signatures.</span></div>';
  }finally{busyState(false)}
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function printReport(){
  if(!lastReport)return;const r=lastReport,w=window.open("","_blank");
  if(!w)return;
  const ok=r.all;
  w.document.write('<!doctype html><html><head><title>PDF Signature Validation</title><style>body{font-family:Arial;padding:35px}.box{max-width:700px;margin:auto;border:2px solid '+(ok?"#16a34a":"#dc2626")+';padding:28px;border-radius:16px}.mark{font-size:72px;color:'+(ok?"#16a34a":"#dc2626")+'}.title{font-size:26px;font-weight:800}.item{padding:12px 0;border-bottom:1px solid #ddd}.muted{color:#666;font-size:12px}@media print{button{display:none}}</style></head><body><div class="box"><div class="mark">'+(ok?"✓":"!")+'</div><div class="title">'+(ok?"DIGITAL SIGNATURE VALID":"DIGITAL SIGNATURE VALIDATION FAILED")+'</div><p><b>File:</b> '+esc(r.fileName)+'</p><p><b>Checked:</b> '+esc(r.checkedAt)+'</p>'+r.reports.map((x,i)=>'<div class="item"><b>Signature '+(i+1)+'</b><br>Signer: '+esc(x.signer)+'<br>Cryptographic verification: '+(x.valid?"PASSED":"FAILED")+'</div>').join("")+'<p class="muted">Validation report only. Original signed PDF was not modified.</p><button onclick="window.print()">Print / Save as PDF</button></div></body></html>');
  w.document.close();
}
