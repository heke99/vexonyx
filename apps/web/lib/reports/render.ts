import "server-only";

function flattenSnapshot(snapshot: unknown): string[] {
  const lines: string[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (lines.length > 5000) return;
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") { lines.push(`${"  ".repeat(Math.min(depth,4))}${String(value)}`); return; }
    if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
    if (typeof value === "object") for (const [key,val] of Object.entries(value as Record<string,unknown>)) { lines.push(`${"  ".repeat(Math.min(depth,4))}${key}`); walk(val, depth + 1); }
  };
  walk(snapshot); return lines.map(x=>x.replace(/[\u0000-\u001f\u007f]/g," ").slice(0,500));
}

function pdfEscape(value:string){return value.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/[^\x20-\x7E]/g,"?");}
export function renderPdf(snapshot: unknown): Uint8Array {
  const lines=flattenSnapshot(snapshot); const pages:string[][]=[]; for(let i=0;i<Math.max(lines.length,1);i+=48)pages.push(lines.slice(i,i+48));
  const objects:string[]=[]; const fontObj=3; objects[fontObj]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const pageIds:number[]=[]; let next=4;
  for(const pageLines of pages){const contentId=next++; const pageId=next++; pageIds.push(pageId); let y=790; const chunks=["BT /F1 10 Tf 50 810 Td"]; for(const line of pageLines.length?pageLines:["VEXONYX report"]){chunks.push(`0 ${y===790?0:-15} Td (${pdfEscape(line)}) Tj`); y-=15;} chunks.push("ET"); const stream=chunks.join("\n"); objects[contentId]=`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`; objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentId} 0 R >>`;}
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>"; objects[2]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] >>`;
  let pdf="%PDF-1.4\n"; const offsets:number[]=[0]; for(let i=1;i<objects.length;i++){if(!objects[i])continue; offsets[i]=Buffer.byteLength(pdf); pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf); pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`; for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]||0).padStart(10,"0")} 00000 n \n`; pdf+=`trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf,"binary"));
}

const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(buf:Buffer){let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipStore(entries:Array<{name:string,data:Buffer}>){const parts:Buffer[]=[];const central:Buffer[]=[];let offset=0;for(const e of entries){const name=Buffer.from(e.name);const crc=crc32(e.data);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(e.data.length,18);local.writeUInt32LE(e.data.length,22);local.writeUInt16LE(name.length,26);parts.push(local,name,e.data);const cen=Buffer.alloc(46);cen.writeUInt32LE(0x02014b50,0);cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);cen.writeUInt16LE(0,8);cen.writeUInt16LE(0,10);cen.writeUInt32LE(crc,16);cen.writeUInt32LE(e.data.length,20);cen.writeUInt32LE(e.data.length,24);cen.writeUInt16LE(name.length,28);cen.writeUInt32LE(offset,42);central.push(cen,name);offset+=local.length+name.length+e.data.length;}const centralSize=central.reduce((s,b)=>s+b.length,0);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,...central,end]);}
function xmlEscape(v:string){return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
export function renderDocx(snapshot: unknown): Uint8Array {
  const paras=flattenSnapshot(snapshot).slice(0,5000).map(line=>`<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join("");
  const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras||"<w:p><w:r><w:t>VEXONYX report</w:t></w:r></w:p>"}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const entries=[
    {name:"[Content_Types].xml",data:Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)},
    {name:"_rels/.rels",data:Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)},
    {name:"word/document.xml",data:Buffer.from(document)},
  ]; return new Uint8Array(zipStore(entries));
}
