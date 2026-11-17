// Bounded, all-sheet SVG viewer. Rendering is isolated from nesting state.
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Paint from persisted projects is untrusted too. Never allow URLs or CSS declarations.
const safePaint=(value,fallback)=>typeof value==='string'&&(value==='none'||CSS.supports('color',value))&&!/[;{}]|url\s*\(/i.test(value)?value:fallback;
export function createViewer({state,getLayout,getSize,shapeColor,pathPolygon,transformPoint,labelAnchor,onSelect}){
  const gallery=document.getElementById('sheets-gallery');
  let lastLayout,labelFrame=0;
  // One font calculation per sheet, not per part. SVG units are millimetres;
  // convert a comfortable screen size back through the actual viewBox scale.
  function sizeLabels(){
    labelFrame=0;
    if(!state.labels)return;
    gallery.querySelectorAll('.nesting-svg').forEach(svg=>{
      const matrix=svg.getScreenCTM(),scale=matrix?Math.hypot(matrix.a,matrix.b):0;
      if(!scale)return;
      const view=svg.viewBox.baseVal,shortSide=Math.min(view.width,view.height)*scale;
      const screenSize=Math.max(14.1,Math.min(22,shortSide/16));
      svg.style.setProperty('--label-size',`${screenSize}px`);
      svg.style.setProperty('--label-scale',1/scale);
    });
  }
  function scheduleLabels(){if(!labelFrame)labelFrame=requestAnimationFrame(sizeLabels);}
  const labelObserver=typeof ResizeObserver==='function'?new ResizeObserver(scheduleLabels):null;
  if(!labelObserver)window.addEventListener('resize',scheduleLabels,{passive:true});
  function summary(){const layout=getLayout(),n=layout.sheets.length,word=n%10===1&&n%100!==11?'лист':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'листа':'листов';document.getElementById('sheets-summary').textContent=layout.preview?(n?'Предпросмотр импортированного чертежа':'SVG или DXF · файлы остаются на устройстве'):!n?'Нет листов':`${n} ${word} · ${layout.placements.some(p=>p.sheet_id===layout.sheets[state.tab]?.id)?`выбран лист ${String(state.tab+1).padStart(2,'0')}`:'пустой лист'}`;}
  function zoom(){gallery.style.setProperty('--viewer-zoom',state.zoom);document.getElementById('zoom-reset').textContent=Math.round(state.zoom*100)+'%';scheduleLabels();}
  function render(){
    const layout=getLayout(),stockSize=getSize(),scroll={left:gallery.scrollLeft,top:gallery.scrollTop};
    // Progressive callbacks replace/reorder placements: a prior index is no longer a selection.
    if(lastLayout!==layout||!layout.placements[state.selected])state.selected=null;
    lastLayout=layout;
    const focused=gallery.contains(document.activeElement)?document.activeElement:null,focusPlacement=focused?.dataset.placement,focusSheet=focused?.dataset.sheetIndex;
    const parts=new Map(state.library.parts.map(p=>[p.id,p]));
    const partNumbers=new Map(state.library.parts.map((part,index)=>[part.id,String(index+1).padStart(2,'0')]));
    const colors=new Map(),anchors=new Map();
    const bySheet=new Map(layout.sheets.map(sheet=>[sheet.id,[]]));
    layout.placements.forEach((placement,index)=>bySheet.get(placement.sheet_id)?.push({placement,index}));
    state.tab=Math.min(state.tab,Math.max(0,layout.sheets.length-1));
    document.getElementById('sheet-badge').textContent=String(layout.preview?0:layout.sheets.length).padStart(2,'0');
    document.getElementById('viewer-mode-hint').textContent=state.viewMode==='original'?(state.paintWarnings?.length?'Для неподдерживаемых стилей и DXF — нейтральный контур':'Исходные цвета чертежа'):state.viewMode==='outline'?'Только линии реза':'Контрастные цвета типов деталей';
    gallery.className=`sheets-gallery layout-${state.sheetLayout}${layout.preview?' is-import-preview':''}`;
    labelObserver?.disconnect();
    if(layout.preview&&!layout.sheets.length){
      gallery.classList.add('is-empty');
      gallery.innerHTML=`<button type="button" class="canvas-dropzone" id="canvas-dropzone" ${state.importing?'disabled aria-busy="true"':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg><strong>${state.importing?'Читаем контуры чертежа…':'Перетащите SVG или DXF сюда'}</strong><span>или нажмите, чтобы выбрать файл</span><small>До 10 МБ · обработка на устройстве</small></button>`;
      document.getElementById('canvas-dropzone').onclick=()=>{if(!state.importing&&!state.running)document.getElementById('file-input').click();};
      document.getElementById('selection-bar').hidden=true;
      document.getElementById('selected-label').textContent='';
      summary();zoom();return;
    }
    gallery.innerHTML=layout.sheets.map((sheet,sheetIndex)=>{
      const [w,h]=layout.preview?[sheet.width_mm,sheet.height_mm]:stockSize;
      const labels=[];
      const shapes=bySheet.get(sheet.id).map(({placement,index})=>{
        const part=parts.get(placement.part_id);if(!part)return '';
        if(!colors.has(part.id))colors.set(part.id,shapeColor(part.id));
        const t=placement.transform,[color,colorStroke]=colors.get(part.id),paint=part.studio_paint||{fill:'#29364b',stroke:'#17233b',opacity:1};
        const fill=state.viewMode==='color'?color:state.viewMode==='outline'?'none':safePaint(paint.fill,'#29364b');
        const originalStroke=safePaint(paint.stroke,'#17233b');
        // A subpixel viewing guide keeps white/no-stroke parts legible on a white
        // sheet, without replacing their actual fill or changing exported cuts.
        const guide=state.viewMode==='original'&&originalStroke==='none'&&fill!=='none';
        const stroke=state.viewMode==='color'?colorStroke:state.viewMode==='outline'?'var(--accent)':guide?'var(--part-guide, #94a3b8)':originalStroke;
        const selected=state.selected===index||(!state.running&&state.chosenParts?.has(part.id));
        const polygons=part.components?.length?part.components:[part.polygon];
        const d=polygons.map(p=>pathPolygon({outer:p.outer.map(v=>transformPoint(v,t)),holes:(p.holes||[]).map(hole=>hole.map(v=>transformPoint(v,t)))})).join('');
        if(state.labels&&!anchors.has(part.id))anchors.set(part.id,labelAnchor(part));
        const center=state.labels?transformPoint(anchors.get(part.id),t):null,number=partNumbers.get(part.id);
        if(state.labels)labels.push(`<g transform="translate(${center[0]} ${center[1]})"><text class="shape-label" x="0" y="0">${number}</text></g>`);
        return `<path d="${esc(d)}" fill="${esc(fill)}" stroke="${esc(stroke)}" style="--part-stroke:${esc(stroke)}${guide?';stroke-width:.65;vector-effect:non-scaling-stroke':''}" fill-opacity="${state.viewMode==='original'?Math.min(1,Math.max(0,Number.isFinite(Number(paint.opacity))?Number(paint.opacity):1)):1}" fill-rule="evenodd" class="nest-shape${selected?' selected':''}" data-part-id="${esc(part.id)}" data-part-number="${number}" data-placement="${index}" data-sheet-index="${sheetIndex}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="Лист ${sheetIndex+1}, деталь ${number}: ${esc(part.source)}"><title>${esc(part.source)} · #${number}</title></path>`;
      }).join('');
      const grid=Math.max(w,h)/30;
      const heading=layout.preview?`<span data-i18n-ignore title="${esc(sheet.file)}">${esc(sheet.file)}</span><span>${Number(w.toFixed(2))} × ${Number(h.toFixed(2))} мм</span>`:`<span>Лист ${String(sheetIndex+1).padStart(2,'0')}</span><span>${w} × ${h} мм</span>`;
      const background=layout.preview?'':`<defs><pattern id="sheet-grid-${sheetIndex}" width="${grid}" height="${grid}" patternUnits="userSpaceOnUse"><path d="M${grid} 0H0V${grid}" fill="none" stroke="currentColor" stroke-width=".5"/></pattern></defs><rect class="sheet-base" width="${w}" height="${h}"/><rect class="sheet-grid" width="${w}" height="${h}" fill="url(#sheet-grid-${sheetIndex})"/>`;
      return `<article class="${layout.preview?'import-preview-card':'sheet-card'}${state.tab===sheetIndex?' selected':''}" data-sheet-index="${sheetIndex}" style="--sheet-ratio:${w/h}" tabindex="0" ${layout.preview?'aria-label="Предпросмотр импортированного чертежа"':`aria-label="Лист ${sheetIndex+1}. Выбрать лист"`}><div class="sheet-card-heading">${heading}</div><div class="sheet-drawing"><svg ${sheetIndex===0?'id="nesting-svg"':''} class="nesting-svg ${layout.preview?'import-preview-svg ':''}mode-${state.viewMode} ${state.viewMode==='outline'?'outline-mode':''}" viewBox="${layout.preview?sheet.viewBox.join(' '):`0 0 ${w} ${h}`}" role="group" ${layout.preview?'aria-label="Предпросмотр импортированного чертежа"':`aria-label="Лист ${sheetIndex+1}, ${w} на ${h} миллиметров"`}>${background}<g class="sheet-shapes">${shapes}</g><g class="shape-labels" aria-hidden="true">${labels.join('')}</g></svg></div></article>`;
    }).join('');
    gallery.scrollLeft=scroll.left;gallery.scrollTop=scroll.top;
    if(state.labels)gallery.querySelectorAll('.nesting-svg').forEach(svg=>labelObserver?.observe(svg));
    gallery.querySelectorAll('.sheet-card,.import-preview-card').forEach(card=>{
      const choose=()=>{state.tab=Number(card.dataset.sheetIndex);gallery.querySelectorAll('.sheet-card,.import-preview-card').forEach(c=>c.classList.toggle('selected',c===card));summary();};
      card.onclick=e=>{if(!e.target.closest('[data-placement]'))choose();};
      card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose();}};
    });
    gallery.querySelectorAll('[data-placement]').forEach(el=>{
      const choose=()=>{state.tab=Number(el.dataset.sheetIndex);onSelect(Number(el.dataset.placement));};
      el.onclick=e=>{e.stopPropagation();choose();};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();choose();}};
    });
    document.getElementById('selection-bar').hidden=state.selected===null;
    if(state.selected===null)document.getElementById('selected-label').textContent='';
    if(focused){const target=focusPlacement!==undefined&&state.selected!==null?gallery.querySelector(`[data-placement="${Number(focusPlacement)}"]`):gallery.querySelector(`[data-sheet-index="${Number(focusSheet)}"]`);target?.focus({preventScroll:true});}
    summary();zoom();
  }
  return {render,zoom};
}