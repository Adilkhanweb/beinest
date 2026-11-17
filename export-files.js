// Legacy dependency-free ZIP API retained for compatibility/unit tests only.
// The application exports one combined millimeter-scale SVG (see below).
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({length:256}, (_,value) => {
  for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
function crc32(bytes) {
  let crc=0xffffffff;
  for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
export function createZip(files) {
  if(!files.length||files.length>65535)throw new Error('Invalid ZIP file count');
  const chunks=[],central=[];let offset=0,centralSize=0;
  for(const file of files){
    const name=encoder.encode(file.name),data=typeof file.content==='string'?encoder.encode(file.content):file.content;
    if(!(data instanceof Uint8Array)||name.length>65535||offset+data.length+name.length+30>0xffffffff)throw new Error('ZIP size limit exceeded');
    const checksum=crc32(data),local=new Uint8Array(30+name.length),view=new DataView(local.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x0800,true);
    view.setUint16(12,0x21,true);view.setUint32(14,checksum,true);
    view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);view.setUint16(26,name.length,true);local.set(name,30);
    const record=new Uint8Array(46+name.length),entry=new DataView(record.buffer);
    entry.setUint32(0,0x02014b50,true);entry.setUint16(4,20,true);entry.setUint16(6,20,true);entry.setUint16(8,0x0800,true);
    entry.setUint16(14,0x21,true);entry.setUint32(16,checksum,true);entry.setUint32(20,data.length,true);
    entry.setUint32(24,data.length,true);entry.setUint16(28,name.length,true);entry.setUint32(42,offset,true);record.set(name,46);
    chunks.push(local,data);central.push(record);offset+=local.length+data.length;centralSize+=record.length;
  }
  if(offset+centralSize+22>0xffffffff)throw new Error('ZIP size limit exceeded');
  const end=new Uint8Array(22),view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);
  view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
}

const SVG_NS='http://www.w3.org/2000/svg';
const safeSvgTags=new Set(['svg','g','path','rect','circle','ellipse','line','polygon','polyline','defs','clipPath','mask','linearGradient','radialGradient','stop','pattern','marker','symbol','use','title','desc','style']);

/** Keep native engine geometry/attributes; strip active content and external resources. */
function prepareSheet(content,index) {
  const doc=new DOMParser().parseFromString(content,'image/svg+xml'),root=doc.documentElement;
  if(doc.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!==SVG_NS)throw new Error('Invalid sheet SVG');
  const mm=value=>{const match=/^\s*([+\-]?(?:\d+\.?\d*|\.\d+)(?:e[+\-]?\d+)?)\s*mm\s*$/i.exec(value||'');return match?Number(match[1]):NaN;};
  const width=mm(root.getAttribute('width')),height=mm(root.getAttribute('height'));
  const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0)throw new Error('Invalid millimeter sheet dimensions');
  for(const element of [...root.querySelectorAll('*')])if(element.namespaceURI!==SVG_NS||!safeSvgTags.has(element.localName))element.remove();
  const prefix=`sheet-${index+1}-`,ids=new Map(),elements=[root,...root.querySelectorAll('*')];
  for(const element of elements){const id=element.getAttribute('id');if(id){if(ids.has(id))throw new Error('Duplicate ID inside sheet SVG');ids.set(id,prefix+id);element.setAttribute('id',prefix+id);}}
  let rootId=root.getAttribute('id');
  if(!rootId){rootId=prefix+'viewport';while([...ids.values()].includes(rootId))rootId+='_';root.setAttribute('id',rootId);}
  const rewriteUrls=value=>value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,quote,target)=>target.startsWith('#')&&ids.has(target.slice(1))?`url(#${ids.get(target.slice(1))})`:'none');
  const rewriteIds=value=>{
    for(const [oldId,newId] of ids){
      const escaped=CSS.escape(oldId),pattern=escaped.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      value=value.replace(new RegExp('#'+pattern+'(?![\\w-])','g'),'#'+CSS.escape(newId));
    }
    return value;
  };
  for(const element of elements){
    for(const attribute of [...element.attributes]){
      const name=attribute.localName,value=attribute.value;
      if(/^on/i.test(name)||name==='base'||/expression\s*\(|javascript\s*:|@import/i.test(value)){element.removeAttributeNode(attribute);continue;}
      if(name==='href'){
        if(value.startsWith('#')&&ids.has(value.slice(1)))attribute.value='#'+ids.get(value.slice(1));else element.removeAttributeNode(attribute);
      }else if(name==='aria-labelledby'||name==='aria-describedby')attribute.value=value.split(/\s+/).map(id=>ids.get(id)||'').filter(Boolean).join(' ');
      else if(/url\s*\(/i.test(value))attribute.value=rewriteUrls(value);
    }
    if(element.localName==='style'){
      // CSSOM drops invalid declarations. Scope every selector so one sheet's
      // class/type rules cannot restyle another sheet after concatenation.
      const css=new CSSStyleSheet();css.replaceSync(element.textContent.replace(/@import[^;]*;/gi,''));
      const rules=items=>[...items].map(rule=>{
        if(rule.type===1){const selector=rewriteIds(rule.selectorText).split(',').map(s=>`#${CSS.escape(rootId)} ${s.trim()}`).join(',');return `${selector}{${rewriteUrls(rule.style.cssText)}}`;}
        if(rule.type===4)return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
        return '';
      }).join('');
      element.textContent=rules(css.cssRules);
    }
  }
  return {root,width,height};
}

/** A single SVG; stock extents (never shape bounds) determine the 100 mm gap. */
export function combineSheetSvgs(contents) {
  if(!Array.isArray(contents)||!contents.length)throw new Error('No sheet SVGs to combine');
  const sheets=contents.map(prepareSheet),width=sheets.reduce((sum,sheet)=>sum+sheet.width,0)+100*(sheets.length-1),height=Math.max(...sheets.map(sheet=>sheet.height));
  const doc=document.implementation.createDocument(SVG_NS,'svg'),root=doc.documentElement;
  root.setAttribute('width',`${width}mm`);root.setAttribute('height',`${height}mm`);root.setAttribute('viewBox',`0 0 ${width} ${height}`);
  let x=0;
  sheets.forEach((sheet,index)=>{
    const nested=doc.importNode(sheet.root,true);
    nested.setAttribute('x',String(x));nested.setAttribute('y','0');nested.setAttribute('width',String(sheet.width));nested.setAttribute('height',String(sheet.height));
    nested.setAttribute('overflow','visible');nested.style.overflow='visible';nested.setAttribute('data-sheet-index',String(index+1));
    root.append(nested);x+=sheet.width+100;
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
}

/** Source metadata is owned by the project/import lifecycle, not automatic saves. */
export function combinedExportFilename(state,count) {
  const sourceBase=value=>String(value||'').split(/[\\/]/).at(-1).replace(/\.[^.]+$/,'');
  const raw=state.projectExplicitName===true?state.projectName:(sourceBase(state.importNames?.[0])||sourceBase(String(state.library?.parts?.[0]?.source||'').replace(/#.*$/,''))||state.projectName);
  const base=String(raw||'beinest').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').trim().replace(/[. ]+$/g,'')||'beinest';
  return `${base} beinest ${count} lists.svg`;
}