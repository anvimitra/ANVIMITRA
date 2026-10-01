const DSS_BASE = "https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/services/rest";

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
function b64(bytes){let s="";const a=new Uint8Array(bytes);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s)}
function fromB64(s){const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
function doc(bytes,name){return {bytes:b64(bytes),name};}

async function dss(path,payload){
  const r=await fetch(DSS_BASE+path,{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(payload)});
  const text=await r.text();
  if(!r.ok) throw Error("Digital Signature Service returned HTTP "+r.status+(text?": "+text.slice(0,300):""));
  try{return JSON.parse(text)}catch{throw Error("Invalid response from Digital Signature Service.")}
}

function extractSimple(report){
  const simple=report?.SimpleReport||report?.simpleReport||report?.simpleValidationReport||report?.simpleReportDTO||{};
  const signatures=simple?.Signature||simple?.signatures||simple?.signatureReports||[];
  const list=Array.isArray(signatures)?signatures:[signatures];
  const statuses=list.map(x=>String(x?.Indication||x?.indication||x?.ValidationStatus||x?.validationStatus||x?.status||"").toUpperCase());
  const valid=statuses.length>0 && statuses.every(x=>x==="TOTAL-PASSED"||x==="PASSED"||x==="VALID"||x.includes("TOTAL-PASSED"));
  return {status:statuses.join(", "),valid,signatures:list};
}

async function handle(request){
  if(request.method!=="POST") return json({error:"POST required"},405);
  const ct=request.headers.get("content-type")||"";
  if(!ct.includes("application/pdf")) return json({error:"Send the signed PDF as application/pdf."},415);
  const input=new Uint8Array(await request.arrayBuffer());
  if(input.length>25*1024*1024) return json({error:"PDF is too large. Maximum 25 MB."},413);
  const name=(request.headers.get("x-file-name")||"signed.pdf").replace(/[\\/:"*?<>|]+/g,"_");
  const validation=await dss("/validation/validateSignature",{
    signedDocument:doc(input,name)
  });
  const parsed=extractSimple(validation);
  if(!parsed.valid){
    return json({valid:false,validation, message:"The signature did not receive a PASSED/VALID result from the DSS validation policy."},422);
  }
  const extended=await dss("/signature/one-document/extendDocument",{
    toExtendDocument:doc(input,name),
    parameters:{signatureLevel:"PAdES_BASELINE_LT"}
  });
  const out=fromB64(extended.bytes);
  return new Response(out,{headers:{
    "content-type":"application/pdf",
    "content-disposition":`attachment; filename="${name.replace(/\.pdf$/i,"")}-verified.pdf"`,
    "cache-control":"no-store",
    "x-signature-validation":"PASSED"
  }});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/api/signature/verify") {
      try{return await handle(request)}catch(e){return json({valid:false,error:e.message||"Signature validation failed."},502)}
    }
    return env.ASSETS.fetch(request);
  }
};
