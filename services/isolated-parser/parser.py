#!/usr/bin/env python3
"""VEXONYX isolated parser.

Reads one mounted file and emits bounded JSON. It never executes document content,
never follows links, never extracts archive members to disk, and performs no network I/O.
The container/orchestrator must additionally run with --network=none, read-only root,
no-new-privileges, a non-root UID, seccomp/AppArmor, CPU/memory/PID limits and a timeout.
"""
from __future__ import annotations
import argparse, io, json, os, re, sys, tarfile, zipfile, zlib
from pathlib import Path

MAX_INPUT = 100 * 1024 * 1024
MAX_TEXT = 8 * 1024 * 1024
MAX_MEMBERS = 5000
MAX_ARCHIVE_UNCOMPRESSED = 200 * 1024 * 1024
MAX_MEMBER = 25 * 1024 * 1024

class Blocked(Exception): pass

def clean_text(text: str) -> str:
    text = text.replace('\x00', '')
    text = ''.join(ch if ch in '\n\t' or ord(ch) >= 32 else ' ' for ch in text)
    return text[:MAX_TEXT]

def read_bounded(path: Path) -> bytes:
    size = path.stat().st_size
    if size < 0 or size > MAX_INPUT: raise Blocked('input_too_large')
    with path.open('rb') as f: return f.read(MAX_INPUT + 1)

def parse_plain(data: bytes) -> dict:
    try: text = data.decode('utf-8', errors='strict')
    except UnicodeDecodeError: text = data.decode('utf-8', errors='replace')
    return {'text': clean_text(text), 'metadata': {'parser': 'plain'}}

def parse_docx(data: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        if len(infos) > MAX_MEMBERS: raise Blocked('archive_member_limit')
        total = sum(i.file_size for i in infos)
        if total > MAX_ARCHIVE_UNCOMPRESSED: raise Blocked('archive_uncompressed_limit')
        if 'word/document.xml' not in z.namelist(): raise Blocked('invalid_docx')
        info = z.getinfo('word/document.xml')
        if info.file_size > MAX_MEMBER: raise Blocked('docx_xml_too_large')
        xml = z.read(info)
    text = re.sub(rb'<w:tab[^>]*/>', b'\t', xml)
    text = re.sub(rb'</w:p>', b'\n', text)
    text = re.sub(rb'<[^>]+>', b'', text)
    decoded = text.decode('utf-8', errors='replace')
    decoded = (decoded.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&apos;', "'"))
    return {'text': clean_text(decoded), 'metadata': {'parser': 'docx', 'members': len(infos), 'uncompressed_bytes': total}}

def _pdf_unescape(raw: bytes) -> str:
    out = bytearray(); i = 0
    while i < len(raw):
        b = raw[i]
        if b == 0x5c and i + 1 < len(raw):
            i += 1; n = raw[i]
            mapping = {ord('n'):10, ord('r'):13, ord('t'):9, ord('b'):8, ord('f'):12, ord('('):40, ord(')'):41, ord('\\'):92}
            if n in mapping: out.append(mapping[n])
            elif 48 <= n <= 55:
                octets = bytes([n]); j = i + 1
                while j < len(raw) and len(octets) < 3 and 48 <= raw[j] <= 55: octets += bytes([raw[j]]); j += 1
                out.append(int(octets, 8) & 255); i = j - 1
            elif n in (10,13): pass
            else: out.append(n)
        else: out.append(b)
        i += 1
    return out.decode('latin-1', errors='replace')

def _extract_pdf_text_ops(stream: bytes) -> list[str]:
    found = []
    for m in re.finditer(rb'\((?:\\.|[^\\)])*\)\s*Tj', stream, re.S):
        raw = m.group(0); content = raw[1:raw.rfind(b')')]; found.append(_pdf_unescape(content))
    for m in re.finditer(rb'\[(.*?)\]\s*TJ', stream, re.S):
        segment = m.group(1); chunks=[]
        for s in re.finditer(rb'\((?:\\.|[^\\)])*\)', segment, re.S): chunks.append(_pdf_unescape(s.group(0)[1:-1]))
        if chunks: found.append(''.join(chunks))
    return found

def parse_pdf(data: bytes) -> dict:
    if not data.startswith(b'%PDF-'): raise Blocked('invalid_pdf')
    chunks = []
    # Parse only bounded content streams with no external references or execution.
    for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', data, re.S):
        raw = m.group(1)
        if len(raw) > MAX_MEMBER: continue
        prefix = data[max(0, m.start()-512):m.start()]
        stream = raw
        if b'/FlateDecode' in prefix:
            try: stream = zlib.decompress(raw, max_length=MAX_MEMBER)
            except Exception: continue
        elif b'/Filter' in prefix and b'/FlateDecode' not in prefix:
            continue
        chunks.extend(_extract_pdf_text_ops(stream))
        if sum(len(x) for x in chunks) >= MAX_TEXT: break
    if not chunks:
        # Last-resort extraction of literal text operators in uncompressed PDFs.
        chunks.extend(_extract_pdf_text_ops(data[:MAX_INPUT]))
    return {'text': clean_text('\n'.join(chunks)), 'metadata': {'parser': 'pdf_safe_subset', 'streams_examined': len(list(re.finditer(rb'stream\r?\n', data)))}}

def inspect_zip(data: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        if len(infos) > MAX_MEMBERS: raise Blocked('archive_member_limit')
        total = sum(i.file_size for i in infos)
        if total > MAX_ARCHIVE_UNCOMPRESSED: raise Blocked('archive_uncompressed_limit')
        members=[]
        for i in infos[:MAX_MEMBERS]:
            if i.file_size > MAX_MEMBER: raise Blocked('archive_member_too_large')
            name=i.filename.replace('\\','/')
            if name.startswith('/') or '/../' in f'/{name}' or name.startswith('../'): raise Blocked('archive_path_traversal')
            members.append({'name':name[:500],'size':i.file_size,'compressed':i.compress_size})
        return {'text':'', 'metadata':{'parser':'zip_inventory','members':members,'uncompressed_bytes':total}}

def inspect_tar(data: bytes) -> dict:
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:*') as t:
        infos=t.getmembers()
        if len(infos)>MAX_MEMBERS: raise Blocked('archive_member_limit')
        total=sum(max(0,i.size) for i in infos)
        if total>MAX_ARCHIVE_UNCOMPRESSED: raise Blocked('archive_uncompressed_limit')
        members=[]
        for i in infos:
            if i.size>MAX_MEMBER: raise Blocked('archive_member_too_large')
            if i.issym() or i.islnk(): raise Blocked('archive_links_not_allowed')
            name=i.name.replace('\\','/')
            if name.startswith('/') or '/../' in f'/{name}' or name.startswith('../'): raise Blocked('archive_path_traversal')
            members.append({'name':name[:500],'size':i.size,'type':i.type.decode('latin-1') if isinstance(i.type,bytes) else str(i.type)})
        return {'text':'','metadata':{'parser':'tar_inventory','members':members,'uncompressed_bytes':total}}

def parse(path: Path, mime: str, name: str) -> dict:
    data=read_bounded(path); lname=name.lower(); mime=(mime or '').lower()
    if mime in ('text/plain','text/markdown','application/json','text/csv') or lname.endswith(('.txt','.md','.json','.csv')): result=parse_plain(data)
    elif mime=='application/pdf' or lname.endswith('.pdf'): result=parse_pdf(data)
    elif mime=='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or lname.endswith('.docx'): result=parse_docx(data)
    elif mime in ('application/zip','application/x-zip-compressed') or lname.endswith('.zip'): result=inspect_zip(data)
    elif mime in ('application/x-tar','application/gzip','application/x-gzip') or lname.endswith(('.tar','.tar.gz','.tgz')): result=inspect_tar(data)
    else: raise Blocked('unsupported_format')
    result['metadata'].update({'input_bytes':len(data),'network':'deny_all','original_name':name[:500],'declared_mime_type':mime[:200]})
    return result

def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True); ap.add_argument('--mime',default=''); ap.add_argument('--name',default=''); args=ap.parse_args()
    path=Path(args.input).resolve()
    try:
        result=parse(path,args.mime,args.name or path.name)
        print(json.dumps({'status':'ready',**result},ensure_ascii=False,separators=(',',':')))
        return 0
    except Blocked as e:
        print(json.dumps({'status':'blocked','error_code':str(e)},separators=(',',':'))); return 2
    except Exception as e:
        print(json.dumps({'status':'failed','error_code':'parser_error','detail':type(e).__name__},separators=(',',':'))); return 1
if __name__=='__main__': raise SystemExit(main())
