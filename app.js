import { NestEngine } from './engine.js';
import { createViewer } from './viewer.js';
import { createImportLayout } from './import-preview.js';
import { setupSettings } from './settings.js';
import { readOriginalPaints, attachOriginalPaints } from './original-colors.js';
import { setupI18n, formatDuration, formatElapsed } from './i18n.js';
import { combineSheetSvgs, combinedExportFilename } from './export-files.js';

const $ = (id) => document.getElementById(id);
const icons = {
  layout:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  folder:'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z',
  layers:'m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 17l9 5 9-5',
  chart:'M4 3v17h17M9 15v-4m5 4V7m5 8V4',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z',
  'shield-check':'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  help:'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5',
  moon:'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  chevrons:'m8 8 4-4 4 4m-8 8 4 4 4-4',
  chevron:'m7 10 5 5 5-5',
  home:'m3 10 9-7 9 7v10h-6v-7H9v7H3V10Z',
  github:'M9 19c-4.3 1.3-4.3-2-6-2m12 5v-3.9a3.4 3.4 0 0 0-1-2.7c3.3-.4 6.7-1.6 6.7-7.3a5.7 5.7 0 0 0-1.6-4 5.3 5.3 0 0 0-.1-4s-1.3-.4-4.1 1.5a14 14 0 0 0-7.5 0C5.6-.3 4.3.1 4.3.1a5.3 5.3 0 0 0-.1 4 5.7 5.7 0 0 0-1.6 4c0 5.7 3.4 6.9 6.7 7.3a3.4 3.4 0 0 0-1 2.6V22',
  external:'M14 3h7v7m0-7L10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6',
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',
  pie:'M12 3v9h9M9 3.5A9 9 0 1 0 20.5 15M15 3.5a9 9 0 0 1 5.5 5.5H15V3.5Z',
  shapes:'m3 10 4-7 4 7H3Zm13-6h5v6h-5zM11 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-3h6v7h-6z',
  timer:'M9 2h6M12 6v6l3 2m2-9 2-2M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  check:'m5 12 4 4L19 6',
  scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7h10v10H7Z',
  expand:'M8 3H3v5m0-5 7 7M16 3h5v5m0-5-7 7M3 16v5h5m-5 0 7-7m11 2v5h-5m5 0-7-7',
  square:'M4 4h16v16H4z',
  tag:'M3 3h8l10 10-8 8L3 11V3Zm4 4h.01',
  fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z',
  lock:'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2',
  trending:'m3 17 6-6 4 4 8-10m-6 0h6v6',
  info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  sliders:'M4 3v5m0 5v8M12 3v10m0 5v3M20 3v2m0 5v11M1 8h6v5H1V8Zm8 5h6v5H9v-5Zm8-8h6v5h-6V5Z',
  bolt:'m13 2-9 12h7l-1 8 10-13h-8l1-7Z',
  sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4',
  'arrow-right':'M4 12h16m-6-6 6 6-6 6',
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  close:'m6 6 12 12M6 18 18 6',menu:'M4 6h16M4 12h16M4 18h16',
  'check-circle':'m8 12 3 3 5-6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.square}"/></svg>`; }
function mountIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon)); }
mountIcons();

const colors=[['#5296ff','#2058b8'],['#ff9863','#b44b19'],['#af86ff','#7043b9'],['#39c5b3','#147e75'],['#f0c452','#9a730e'],['#f077a3','#a73964']];
const pathPolygon = poly => [poly.outer,...(poly.holes||[])].map(pts=>'M'+pts.map(p=>p.join(',')).join('L')+'Z').join('');
function pointInside(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function labelAnchor(part){const b=part.bounds_mm;for(const y of [.5,.3,.7,.15,.85])for(const x of [.5,.3,.7,.15,.85]){const p=[b[0]+(b[2]-b[0])*x,b[1]+(b[3]-b[1])*y];if(pointInside(p,part.polygon.outer)&&!(part.polygon.holes||[]).some(h=>pointInside(p,h)))return p;}return part.polygon.outer[0];}
const emptyLibrary=()=>({version:1,tolerance:.1,parts:[],warnings:[]});
const state={library:emptyLibrary(),importNames:[],quantities:{},result:null,request:null,liveLayout:null,liveRequest:null,iteration:0,tab:0,zoom:1,labels:true,outline:false,viewMode:'original',sheetLayout:'row',running:false,importing:false,exporting:false,engine:null,engineReady:null,history:[],chartSeconds:10,selected:null,chosenParts:new Set(),projectName:'Новый раскрой',projectExplicitName:false,dirty:false,runToken:0};
let settings;
let toastTimer,progressTimer;
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (n,d=1) => Number(n).toFixed(d);
const totalParts = () => state.library.parts.reduce((n,p)=>n+(state.quantities[p.id]||0),0);

function toast(message) { $('toast-text').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200); }
function storageGet(key,fallback) { try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;} }
function storageSet(key,value) { try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Недостаточно места для сохранения в браузере.');return false;} }
function showDialog(title,content) { $('dialog-title').textContent=title;$('dialog-content').innerHTML=content;mountIcons($('app-dialog'));if(!$('app-dialog').open)$('app-dialog').showModal(); }
$('dialog-close').onclick=()=>$('app-dialog').close();
$('app-dialog').addEventListener('click',e=>{if(e.target===$('app-dialog')){const r=$('app-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('app-dialog').close();}});

function themeToggle() { const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('nestbolt-theme',theme);}catch{}updateThemeIcon(); }
function updateThemeIcon() { const dark=document.documentElement.dataset.theme==='dark';$('theme-button').innerHTML=icon(dark?'sun':'moon');$('theme-button').setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему');$('sidebar-theme').innerHTML=icon(dark?'sun':'moon'); }
$('theme-button').onclick=themeToggle;$('sidebar-theme').onclick=themeToggle;updateThemeIcon();
const mobileSidebar=matchMedia('(max-width: 820px)');
let sidebarCollapsed=storageGet('beinest-sidebar-collapsed',false)===true;
function syncSidebar(){
  const open=mobileSidebar.matches?$('sidebar').classList.contains('open'):!sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed',sidebarCollapsed);
  $('sidebar').inert=!open;$('sidebar').setAttribute('aria-hidden',String(!open));
  $('menu-button').setAttribute('aria-controls','sidebar');$('menu-button').setAttribute('aria-expanded',String(open));
  $('menu-button').setAttribute('aria-label',open?'Скрыть боковую панель':'Открыть меню');
  $('sidebar-backdrop').classList.toggle('open',mobileSidebar.matches&&open);
}
function closeMenu() {if(!mobileSidebar.matches)return;const focused=$('sidebar').contains(document.activeElement);$('sidebar').classList.remove('open');syncSidebar();if(focused)$('menu-button').focus();}
$('menu-button').onclick=()=>{if(mobileSidebar.matches)$('sidebar').classList.toggle('open');else{sidebarCollapsed=!sidebarCollapsed;storageSet('beinest-sidebar-collapsed',sidebarCollapsed);}syncSidebar();};
if($('sidebar-close'))$('sidebar-close').onclick=()=>{if(mobileSidebar.matches)closeMenu();else{sidebarCollapsed=true;storageSet('beinest-sidebar-collapsed',true);syncSidebar();$('menu-button').focus();}};
mobileSidebar.addEventListener('change',()=>{$('sidebar').classList.remove('open');syncSidebar();});syncSidebar();
$('sidebar-backdrop').onclick=closeMenu;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();if(e.key==='?'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))openHelp();});

function emptyLayout(){return {version:1,units:'mm',sheets:[{id:'empty-1',stock_id:'stock-1'}],placements:[]};}
let previewLayout=emptyLayout();
let previewParts=null;
function currentLayout(){if(!state.liveLayout&&!state.result){if(previewParts!==state.library.parts||!previewLayout.preview){previewLayout=createImportLayout(state.library,state.importNames);previewParts=state.library.parts;}return previewLayout;}return state.liveLayout||state.result.layout;}
function shapeColor(id) { const i=state.library.parts.findIndex(p=>p.id===id);return colors[Math.max(0,i)%colors.length]; }
function getSheetSize() { const request=state.liveRequest||(state.result&&state.request);if(request)return [request.sheets[0].width_mm,request.sheets[0].height_mm];return [Number($('sheet-width').value)||600,Number($('sheet-height').value)||400]; }
function transformPoint(point,t) { const x=point[0]*(t.mirrored?-1:1),y=point[1],c=Math.cos(t.rotation_radians),s=Math.sin(t.rotation_radians);return [x*c-y*s+t.translation[0],x*s+y*c+t.translation[1]]; }
const viewer=createViewer({state,getLayout:currentLayout,getSize:getSheetSize,shapeColor,pathPolygon,transformPoint,labelAnchor,onSelect:selectShape});
function renderCanvas(){viewer.render();updatePartSelection();}
function updateSelectedLabel(){const placement=currentLayout().placements[state.selected],part=state.library.parts.find(part=>part.id===placement?.part_id);$('selected-label').textContent=part?`${part.source.replace(/\.svg$/,'')} · ${format(part.area_mm2/100,1)} см²`:'';}
function selectShape(index) {
  if(state.running)return;
  const placement=currentLayout().placements[index];if(!placement)return;
  const deselect=state.selected===index&&state.chosenParts.has(placement.part_id);
  if(deselect){state.chosenParts.delete(placement.part_id);state.selected=null;}
  else{state.chosenParts.add(placement.part_id);state.selected=index;}
  updateSelectedLabel();updatePartSelection();renderCanvas();
  if(!deselect&&!$('parts-content').hidden){const row=[...$('parts-list').children].find(row=>row.dataset.partId===placement.part_id);if(row){const list=$('parts-content'),r=row.getBoundingClientRect(),bounds=list.getBoundingClientRect();if(r.top<bounds.top||r.bottom>bounds.bottom)list.scrollTop+=r.top-bounds.top-12;}}
}
$('clear-selection').onclick=()=>{state.selected=null;state.chosenParts.clear();updatePartSelection();renderCanvas();};
function applyZoom() {viewer.zoom();}
$('zoom-in').onclick=()=>{state.zoom=Math.min(2,state.zoom+.1);applyZoom();};$('zoom-out').onclick=()=>{state.zoom=Math.max(.5,state.zoom-.1);applyZoom();};$('zoom-reset').onclick=$('fit-button').onclick=()=>{state.zoom=1;applyZoom();};
$('toggle-labels').onclick=()=>{state.labels=!state.labels;$('toggle-labels').setAttribute('aria-pressed',String(state.labels));renderCanvas();};
function setView(mode) {state.viewMode=mode;state.outline=mode==='outline';for(const [id,value] of [['view-layout','original'],['view-outline','outline'],['view-color','color']]){$(id).classList.toggle('selected',mode===value);$(id).setAttribute('aria-pressed',String(mode===value));}renderParts();renderCanvas();}
$('view-layout').onclick=()=>setView('original');$('view-outline').onclick=()=>setView('outline');$('view-color').onclick=()=>setView('color');
function setSheetLayout(mode){state.sheetLayout=mode;for(const value of ['row','grid']){$('layout-'+value).classList.toggle('selected',mode===value);$('layout-'+value).setAttribute('aria-pressed',String(mode===value));}renderCanvas();}
$('layout-row').onclick=()=>setSheetLayout('row');$('layout-grid').onclick=()=>setSheetLayout('grid');
$('fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.nesting-panel').requestFullscreen();}catch{toast('Полноэкранный режим недоступен в этом браузере.');}};

function updateMetrics() {
  $('export-button').disabled=state.running||state.exporting||state.importing||state.dirty||!state.result;
  $('export-button').querySelector('.export-format').textContent='SVG';
  const layout=currentLayout();let placedArea=0;
  if(!layout.preview)layout.placements.forEach(p=>placedArea+=state.library.parts.find(part=>part.id===p.part_id)?.area_mm2||0);
  const [w,h]=getSheetSize();const metrics=!state.liveLayout&&state.result?.validation?.metrics;const sheetCount=layout.preview?0:layout.sheets.length,area=metrics?.full_stock_area??w*h*sheetCount;placedArea=metrics?.placed_area??placedArea;const efficiency=area?Math.min(100,100*placedArea/area):0;const placed=metrics?.placed_parts??(layout.preview?0:layout.placements.length);
  $('stat-efficiency').textContent=format(efficiency);$('stat-placed').textContent=placed;$('stat-total').textContent=totalParts();$('stat-sheets').textContent=sheetCount;if(!state.running)$('stat-time').textContent=formatElapsed(state.result?.studio_elapsed??state.result?.seconds??0);
  if($('stat-iterations'))$('stat-iterations').textContent=state.running?state.iteration:(state.result?.studio_iterations??0);
  $('stat-size').textContent=`${w} × ${h} мм`;
  $('parts-status').textContent=!totalParts()?'Загрузите SVG или DXF':state.running?'Расчёт идёт':state.dirty?'Параметры изменены — запустите расчёт':placed===totalParts()?'Все детали на своих местах':`Размещено ${placed} из ${totalParts()} деталей`;
  $('efficiency-badge').textContent=state.running?'Расчёт идёт':state.result?(state.result.validation?.valid?'Проверено':'Расчёт завершён'):state.library.parts.length?'Чертёж импортирован':'Нет деталей';
  $('efficiency-segments').innerHTML=Array.from({length:28},(_,i)=>`<i class="${i<Math.round(efficiency/100*28)?'filled':''}"></i>`).join('');
  $('donut-fill').style.strokeDasharray=`${efficiency/100*289} 289`;$('donut-value').textContent=format(efficiency)+'%';
  $('used-area').textContent=format(placedArea/1e6,3)+' м²';$('waste-area').textContent=format((area-placedArea)/1e6,3)+' м²';$('total-area').textContent=format(area/1e6,3)+' м²';
  $('layout-status').innerHTML=`<i></i> ${state.running?`Ищем раскрой · итерация ${state.iteration}`:!state.result?(state.library.parts.length?'Предпросмотр чертежа':'Добавьте чертёж'):state.dirty?'Нужен перерасчёт':state.result.validation?.valid?'Раскрой проверен':'Расчёт завершён'}`;
}
function drawChart() {const seconds=state.chartSeconds||10;$('chart-middle').textContent=formatDuration(seconds/2);$('chart-end').textContent=formatDuration(seconds);const pts=state.history.map(p=>[Math.min(320,p.t/seconds*320),90-Math.max(0,Math.min(100,p.utilization))/100*86]);if(!pts.length){$('chart-line').setAttribute('d','');$('chart-area').setAttribute('d','');$('chart-point').setAttribute('visibility','hidden');return;}const d='M'+pts.map(p=>p.join(',')).join('L');$('chart-line').setAttribute('d',d);$('chart-area').setAttribute('d',d+`L${pts.at(-1)[0]},94L${pts[0][0]},94Z`);$('chart-point').setAttribute('cx',pts.at(-1)[0]);$('chart-point').setAttribute('cy',pts.at(-1)[1]);$('chart-point').removeAttribute('visibility');}

function renderParts() { const focused=document.activeElement,focusKey=focused?.closest('#parts-list')?['quantity','partMinus','partPlus'].find(key=>focused.dataset[key]!==undefined):null,focusId=focusKey?focused.dataset[focusKey]:null;$('parts-count').textContent=state.library.parts.length;$('parts-list').innerHTML=state.library.parts.map((p,index)=>{
    const safePaint=(value,fallback)=>typeof value==='string'&&(value==='none'||CSS.supports('color',value))&&!/[;{}]|url\s*\(/i.test(value)?value:fallback;
    const paint=p.studio_paint||{fill:'none',stroke:'#64748b',opacity:1},[color,colorStroke]=shapeColor(p.id),fill=state.viewMode==='outline'?'none':state.viewMode==='color'?color:safePaint(paint.fill,'none'),stroke=state.viewMode==='outline'?'var(--accent)':state.viewMode==='color'?colorStroke:safePaint(paint.stroke,'#64748b');
    const b=p.bounds_mm,padding=Math.max(b[2]-b[0],b[3]-b[1],1)*.08,polygons=p.components?.length?p.components:[p.polygon],number=String(index+1).padStart(2,'0');
    const selected=state.chosenParts.has(p.id);
    return `<div class="part-row${selected?' is-selected':''}" data-part-id="${escapeHTML(p.id)}"><button type="button" class="part-main" title="${escapeHTML(p.source)}" aria-pressed="${selected}" aria-label="Выбрать деталь ${escapeHTML(p.source)}"><span class="part-number" aria-hidden="true">${number}</span><span class="part-preview"><svg viewBox="${b[0]-padding} ${b[1]-padding} ${b[2]-b[0]+padding*2} ${b[3]-b[1]+padding*2}" aria-hidden="true"><path d="${escapeHTML(polygons.map(pathPolygon).join(''))}" fill="${escapeHTML(fill)}" stroke="${escapeHTML(stroke)}" stroke-width=".7" vector-effect="non-scaling-stroke" fill-opacity="${state.viewMode==='original'?Math.min(1,Math.max(0,Number.isFinite(Number(paint.opacity))?Number(paint.opacity):1)):1}" fill-rule="evenodd"/></svg></span><span class="part-info"><small>${format(b[2]-b[0],0)} × ${format(b[3]-b[1],0)} мм</small></span></button><div class="part-controls"><label class="part-select-button"><input type="checkbox" class="part-select" aria-label="Выбрать деталь ${escapeHTML(p.source)}" ${selected?'checked':''}></label><span class="quantity-control"><button data-part-minus="${escapeHTML(p.id)}" aria-label="Уменьшить количество ${escapeHTML(p.source)}">−</button><input type="number" min="0" max="100" value="${state.quantities[p.id]||0}" data-quantity="${escapeHTML(p.id)}" aria-label="Количество ${escapeHTML(p.source)}"><button data-part-plus="${escapeHTML(p.id)}" aria-label="Увеличить количество ${escapeHTML(p.source)}">+</button></span></div></div>`;
  }).join('');
  $('parts-list').querySelectorAll('[data-part-minus],[data-part-plus]').forEach(b=>b.onclick=()=>{if(state.running)return;const id=b.dataset.partMinus||b.dataset.partPlus;state.quantities[id]=Math.max(0,Math.min(100,(state.quantities[id]||0)+(b.dataset.partPlus?1:-1)));renderParts();markDirty();});
  $('parts-list').querySelectorAll('[data-quantity]').forEach(input=>input.onchange=()=>{state.quantities[input.dataset.quantity]=Math.max(0,Math.min(100,Math.round(Number(input.value)||0)));input.value=state.quantities[input.dataset.quantity];markDirty();});
  $('parts-list').querySelectorAll('.part-row').forEach(row=>{
    const input=row.querySelector('.part-select');
    input.onchange=()=>togglePartSelection(row.dataset.partId,input.checked);
    row.onclick=event=>{if(event.target.closest('.part-select-button,.quantity-control'))return;togglePartSelection(row.dataset.partId,!state.chosenParts.has(row.dataset.partId));};
  });
  $('parts-list').querySelectorAll('input,button').forEach(el=>el.disabled=state.running||state.exporting||state.importing);
  updatePartSelection();
  if(focusKey)[...$('parts-list').querySelectorAll('input,button')].find(el=>el.dataset[focusKey]===focusId)?.focus({preventScroll:true});
}
function togglePartSelection(id,selected){
  if(state.running)return;
  if(selected)state.chosenParts.add(id);else state.chosenParts.delete(id);
  if(!selected&&currentLayout().placements[state.selected]?.part_id===id)state.selected=null;
  updateSelectedLabel();updatePartSelection();renderCanvas();
}
function updatePartSelection(){const count=state.library.parts.filter(p=>state.chosenParts.has(p.id)).length,all=$('select-all-parts');all.checked=count>0&&count===state.library.parts.length;all.indeterminate=count>0&&count<state.library.parts.length;all.disabled=state.running||state.exporting||state.importing||!state.library.parts.length;$('delete-selected-parts').disabled=state.running||state.exporting||state.importing||!count;
  $('parts-list').querySelectorAll('.part-row').forEach(row=>{const selected=state.chosenParts.has(row.dataset.partId);row.classList.toggle('is-selected',selected);row.querySelector('.part-select').checked=selected;row.querySelector('.part-main').setAttribute('aria-pressed',String(selected));});
}
$('select-all-parts').onchange=()=>{if(state.running)return;state.chosenParts=new Set($('select-all-parts').checked?state.library.parts.map(p=>p.id):[]);if(!state.chosenParts.size)state.selected=null;updateSelectedLabel();updatePartSelection();renderCanvas();};
$('delete-selected-parts').onclick=()=>{if(state.running||state.exporting||state.importing||!state.chosenParts.size)return;state.library.parts=state.library.parts.filter(p=>!state.chosenParts.has(p.id));for(const id of state.chosenParts)delete state.quantities[id];state.chosenParts.clear();state.result=null;state.request=null;state.liveLayout=null;state.liveRequest=null;state.selected=null;state.tab=0;state.history=[];previewLayout=emptyLayout();markDirty();renderParts();renderCanvas();drawChart();};
function switchTab(parts) { $('settings-content').hidden=parts;$('parts-content').hidden=!parts;$('settings-tab').classList.toggle('active',!parts);$('parts-tab').classList.toggle('active',parts);$('settings-tab').setAttribute('aria-selected',String(!parts));$('parts-tab').setAttribute('aria-selected',String(parts)); }
$('settings-tab').onclick=()=>switchTab(false);$('parts-tab').onclick=()=>switchTab(true);
for(const tab of [$('settings-tab'),$('parts-tab')])tab.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();switchTab(tab===$('settings-tab'));(tab===$('settings-tab')?$('parts-tab'):$('settings-tab')).focus();}};
function markDirty() {if(state.running||state.restoring)return;state.dirty=totalParts()>0;const stock=state.request?.sheets?.[0];if(stock&&(stock.width_mm!==Number($('sheet-width').value)||stock.height_mm!==Number($('sheet-height').value))){state.result=null;state.request=null;state.history=[];state.selected=null;state.tab=0;previewLayout=emptyLayout();drawChart();}renderCanvas();updateMetrics();}
['sheet-width','sheet-height','spacing','margin','rotation'].forEach(id=>$(id).addEventListener('change',markDirty));
['sheet-width','sheet-height'].forEach(id=>$(id).addEventListener('input',()=>{if($(id).checkValidity())markDirty();}));
// The settings time control configures the next run; never rescale recorded chart data here.

function validateSettings() {const fields=['sheet-width','sheet-height','spacing','margin'];let valid=true;fields.forEach(id=>{const input=$(id),ok=input.checkValidity();input.classList.toggle('field-invalid',!ok);if(!ok)valid=false;});const w=Number($('sheet-width').value),h=Number($('sheet-height').value),margin=Number($('margin').value);if(margin*2>=Math.min(w,h))valid=false;if(!totalParts())valid=false;$('sheet-error').hidden=valid;$('sheet-error').textContent=!totalParts()?'Добавьте хотя бы одну деталь.':'Проверьте размеры листа и отступы. Поля не должны быть пустыми, отступ — меньше половины листа.';if(!valid){switchTab(false);$('sheet-error').scrollIntoView({block:'nearest'});}return valid;}
function buildRequest() {const margin=Number($('margin').value),rotation=$('rotation').value,degrees=Number(rotation);return {name:state.projectName,parts:state.library.parts.filter(p=>state.quantities[p.id]>0).map(p=>({id:p.id,quantity:state.quantities[p.id],rotations:rotation==='free'?{kind:'free'}:degrees?{kind:'step',degrees}:{kind:'list',degrees:[0]},allow_mirror:settings.mirror(),priority:1})),sheets:[{id:'stock-1',width_mm:Number($('sheet-width').value),height_mm:Number($('sheet-height').value),count:settings.sheetCount(),margins_mm:{left:margin,right:margin,bottom:margin,top:margin},defects_mm:[]}],...settings.requestExtras()};}
function setRunning(running) {
  state.running=running;document.body.classList.toggle('is-running',running);
  $('run-button-label').textContent=running?'Остановить расчёт':'Начать раскрой';
  $('run-button').querySelector('[data-icon="bolt"]').innerHTML=icon(running?'square':'bolt');
  $('run-progress').hidden=!running;$('export-button').disabled=running||state.dirty||!state.result;$('new-project').disabled=running;
  document.querySelectorAll('#settings-content input,#settings-content select,#parts-content button,#parts-content input').forEach(el=>el.disabled=running);
  $('allow-holes').disabled=true;settings?.setDisabled(running);updatePartSelection();
  $('chart-mode-label').textContent=running?'В процессе':state.result?'Завершено':'Предпросмотр';
}
let activeRun=null;
// Validate live snapshots outside the search worker. Coalesce waiting snapshots:
// only one validation is in flight and the newest pending one replaces older work.
function validateLiveCandidate(context,candidate){
  context.pending=candidate;
  if(context.validationTask)return;
  context.validationTask=(async()=>{
    while(context.pending&&!context.closed){
      const item=context.pending;context.pending=null;
      try{item.validation=await state.engine.validate(state.library,context.request,item.layout);if(item.validation?.valid)context.validated=item;}
      catch{item.validation=null;}
    }
  })().finally(()=>{context.validationTask=null;if(context.pending&&!context.closed)validateLiveCandidate(context,context.pending);});
}
async function stopNesting(){
  const context=activeRun,token=++state.runToken;
  const elapsed=context?(performance.now()-context.start)/1000:0;
  if(context){context.closed=true;context.pending=null;}
  state.stopping=true;document.body.classList.add('is-stopping');
  state.engine?.stop();clearInterval(progressTimer);$('run-button').disabled=true;
  $('run-button-label').textContent='Проверяем последнюю раскладку…';
  let kept=false;
  try{
    if(context?.latest){
      await context.validationTask;
      const latest=context.latest;
      if(latest.validation===undefined){try{latest.validation=await state.engine.validate(state.library,context.request,latest.layout);}catch{latest.validation=null;}}
      const candidate=latest.validation?.valid?latest:context.validated;
      if(token!==state.runToken)return;
      if(candidate?.validation?.valid){
        state.result={layout:candidate.layout,validation:candidate.validation,...context.options,seconds:elapsed,studio_iterations:candidate.iteration,studio_elapsed:elapsed,studio_stopped:true};
        state.request=context.request;state.chartSeconds=Math.max(.001,elapsed);
        state.history=state.history.filter(point=>point.iteration===undefined||point.iteration<=candidate.iteration);
        const metrics=candidate.validation.metrics,sheetArea=context.request.sheets[0].width_mm*context.request.sheets[0].height_mm;
        const utilization=metrics?100*metrics.placed_area/(metrics.full_stock_area??sheetArea*candidate.layout.sheets.length):state.history.at(-1)?.utilization||0;
        state.history.push({t:elapsed,utilization});state.dirty=false;state.tab=0;state.selected=null;kept=true;
      }
    }
    if(!kept&&context){state.history=context.previous.history;state.chartSeconds=context.previous.chartSeconds;}
    if(kept) $('chart-caption').textContent='Последняя успешная итерация сохранена';
    else $('chart-caption').textContent=state.result?'Новая успешная итерация не получена. Предыдущий результат сохранён.':'Успешная итерация ещё не получена';
  }finally{
    if(token===state.runToken){state.liveLayout=null;state.liveRequest=null;activeRun=null;state.stopping=false;document.body.classList.remove('is-stopping');setRunning(false);$('run-button').disabled=false;renderCanvas();updateMetrics();drawChart();const saved=!kept||saveProject();toast(kept?(saved?'Расчёт остановлен. Последняя успешная итерация сохранена.':'Итерация сохранена в рабочей области, но не в списке проектов.'):state.result?'Расчёт остановлен. Предыдущий результат сохранён.':'Расчёт остановлен. Успешная итерация ещё не получена.');}
  }
}
async function runNesting() {
  if(state.exporting||state.stopping||state.importing)return;
  if(state.running){await stopNesting();return;}
  if(!validateSettings())return;
  const settingsError=settings.validate();if(settingsError){switchTab(false);toast(settingsError);return;}
  const token=++state.runToken,seconds=settings.getSeconds();setRunning(true);$('run-progress-label').textContent='Загрузка движка…';$('run-percentage').textContent='0%';$('optimization-progress').value=0;
  try{
    await state.engineReady;if(token!==state.runToken)return;
    if(state.library===null)throw new Error('Добавьте детали для раскроя.');
    const request=buildRequest(),options=settings.runOptions(),start=performance.now();
    const context={token,request,options,start,previous:{history:state.history,chartSeconds:state.chartSeconds},latest:null,validated:null,pending:null,closed:false,validationTask:null};activeRun=context;
    state.liveRequest=request;state.liveLayout=emptyLayout();state.iteration=0;state.selected=null;state.history=[];state.chartSeconds=seconds;renderCanvas();updateMetrics();drawChart();$('run-progress-label').textContent='Ищем лучший раскрой…';
    progressTimer=setInterval(()=>{const elapsed=(performance.now()-start)/1000,p=Math.min(97,elapsed/seconds*100);$('run-percentage').textContent=Math.round(p)+'%';$('optimization-progress').value=p;$('stat-time').textContent=formatElapsed(elapsed);},160);
    const result=await state.engine.run(state.library,request,{seconds,...options,live:0.1,onProgress:p=>{if(token!==state.runToken||!p.layout?.sheets?.length||!p.layout.placements?.length)return;const placed=p.layout.placements.reduce((sum,placement)=>sum+(state.library.parts.find(part=>part.id===placement.part_id)?.area_mm2||0),0),sheetArea=request.sheets[0].width_mm*request.sheets[0].height_mm;const utilization=Math.min(100,100*placed/(p.layout.sheets.length*sheetArea));state.iteration++;state.history.push({t:p.t||0,utilization,iteration:state.iteration});context.latest={layout:p.layout,iteration:state.iteration};validateLiveCandidate(context,context.latest);state.liveLayout=p.layout;state.selected=null;renderCanvas();updateMetrics();drawChart();}});
    if(token!==state.runToken)return;clearInterval(progressTimer);context.closed=true;context.pending=null;activeRun=null;
    if(!result.layout?.placements?.length)throw new Error('Не удалось разместить детали. Увеличьте лист или уменьшите отступы.');
    result.studio_iterations=state.iteration;result.studio_elapsed=(performance.now()-start)/1000;
    state.result=result;state.request=request;state.liveLayout=null;state.liveRequest=null;state.tab=0;state.selected=null;state.dirty=false;state.zoom=1;
    const metrics=result.validation?.metrics,efficiency=metrics?100*metrics.placed_area/(metrics.full_stock_area??request.sheets[0].width_mm*request.sheets[0].height_mm*result.layout.sheets.length):0;state.history.push({t:seconds,utilization:efficiency});drawChart();renderCanvas();updateMetrics();
    $('chart-caption').textContent=result.validation?.valid?'Геометрия проверена: пересечений нет':'Расчёт завершён — проверьте результат';
    setRunning(false);renderCanvas();updateMetrics();if(saveProject())toast(result.validation?.valid?'Готово! Раскрой рассчитан и проверен Nestbolt.':'Раскрой готов. Проверьте геометрию перед резкой.');
  }catch(error){if(token!==state.runToken)return;clearInterval(progressTimer);if(activeRun){activeRun.closed=true;activeRun.pending=null;state.history=activeRun.previous.history;state.chartSeconds=activeRun.previous.chartSeconds;activeRun=null;}state.liveLayout=null;state.liveRequest=null;setRunning(false);renderCanvas();updateMetrics();drawChart();console.error(error);toast('Ошибка раскроя: '+error.message);$('chart-caption').textContent='Расчёт не завершён. Измените параметры и повторите.';}
}
$('run-button').onclick=runNesting;

async function exportLayout() {
  if(state.running||state.exporting||state.importing)return;
  if(!state.result){toast('Сначала импортируйте детали и запустите раскрой.');return;}
  if(state.dirty){toast('Сначала пересчитайте раскрой с новыми параметрами.');return;}
  const result=state.result,library=state.library,request=state.request,selected=state.tab;
  const scope=$('export-scope')?.value||'all',outline=$('export-sheet-outline')?.checked||false;
  const sheets=scope==='selected'?[result.layout.sheets[selected]]:result.layout.sheets;
  if(!result.validation?.valid||!sheets.length||sheets.some(sheet=>!sheet)){toast('Сначала импортируйте детали и запустите раскрой.');return;}
  state.exporting=true;settings.setDisabled(true);renderParts();updateMetrics();$('run-button').disabled=true;$('new-project').disabled=true;
  $('export-button').setAttribute('aria-busy','true');
  try {
    const files=[];
    for(const sheet of sheets){
      const content=await state.engine.exportSheet(library,request,result.layout,sheet.id,'svg',{outline});
      files.push(content);
    }
    const blob=new Blob([combineSheetSvgs(files)],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=combinedExportFilename(state,files.length);document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);toast('SVG-файл раскроя сохранён.');
  }catch(error){toast('Не удалось экспортировать: '+error.message);}
  finally{state.exporting=false;settings.setDisabled(false);renderParts();$('export-button').removeAttribute('aria-busy');$('run-button').disabled=false;$('new-project').disabled=false;updateMetrics();}
}
$('export-button').onclick=exportLayout;
const exportPreferences=storageGet('beinest-export-settings',{});
if($('export-scope')){
  $('export-scope').value=exportPreferences.scope==='selected'?'selected':'all';
  $('export-sheet-outline').checked=exportPreferences.outline===true;
  const saveExportPreferences=()=>{storageSet('beinest-export-settings',{scope:$('export-scope').value,outline:$('export-sheet-outline').checked});updateMetrics();};
  $('export-scope').addEventListener('change',saveExportPreferences);$('export-sheet-outline').addEventListener('change',saveExportPreferences);
}

async function importFiles(files) {if(state.running||state.exporting||state.importing){toast('Сначала остановите текущий расчёт.');return;}const selected=Array.from(files);if(!selected.length)return;if(selected.some(f=>!(/\.(svg|dxf)$/i.test(f.name)))){toast('Поддерживаются только SVG и DXF.');return;}if(selected.some(f=>f.size>10*1024*1024)){toast('Максимальный размер одного файла — 10 МБ.');return;}try{state.importing=true;settings.setDisabled(true);renderParts();updateMetrics();$('upload-button').disabled=true;$('run-button').disabled=true;$('new-project').disabled=true;renderCanvas();toast('Читаем контуры чертежа…');await state.engineReady;const files=await Promise.all(selected.map(file=>state.engine.readFile(file)));const imported=await state.engine.importFiles(files,settings.importOptions());const paintRegistry=readOriginalPaints(files);attachOriginalPaints(imported,paintRegistry);state.paintWarnings=paintRegistry.warnings||[];if(!imported.parts?.length)throw new Error('Не найдены замкнутые контуры.');state.library=imported;state.importNames=selected.map(file=>file.name);state.library.studio_import_names=state.importNames;state.chosenParts.clear();state.quantities=Object.fromEntries(imported.parts.map(p=>[p.id,1]));state.result=null;state.request=null;state.selected=null;previewLayout=emptyLayout();state.liveLayout=null;state.liveRequest=null;state.tab=0;state.dirty=true;state.history=[];renderParts();renderCanvas();updateMetrics();drawChart();switchTab(true);toast(`Импортировано деталей: ${imported.parts.length}. Настройте количество и запустите раскрой.`);if(imported.warnings?.length)showDialog('Замечания к импорту',`<p>Чертёж импортирован с замечаниями:</p><ul>${imported.warnings.map(w=>`<li>${escapeHTML(w)}</li>`).join('')}</ul>`);}catch(error){toast('Ошибка импорта: '+error.message);}finally{state.importing=false;settings.setDisabled(false);renderParts();updateMetrics();$('upload-button').disabled=false;$('run-button').disabled=false;$('new-project').disabled=false;$('file-input').value='';renderCanvas();}}
$('upload-button').onclick=()=>$('file-input').click();$('file-input').onchange=e=>importFiles(e.target.files);
let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;document.body.classList.add('drop-active');}});document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',()=>{dragDepth--;if(dragDepth<=0){document.body.classList.remove('drop-active');dragDepth=0;}});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('drop-active');if(e.dataTransfer.files.length)importFiles(e.dataTransfer.files);});

const managementId=()=>globalThis.crypto?.randomUUID?.()||`project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const validManagementName=name=>typeof name==='string'&&name.trim().length>0&&name.length<=60&&!/[\u0000-\u001f\u007f]/.test(name);
const managementNameKey=name=>name.trim().normalize('NFKC').toLocaleLowerCase();
function managementLocked(){if(state.running||state.exporting||state.importing){toast('Сначала остановите расчёт.');return true;}return false;}
function managementError(message){const error=$('management-error');if(error){error.textContent=message;error.hidden=false;}else toast(message);}
function readManagementStorage(key,fallback){try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{toast('Не удалось прочитать сохранённые данные.');return null;}}
function confirmManagementDelete(title,name,message,onConfirm,onCancel){
  showDialog(title,`<p class="management-item-name" data-i18n-ignore>${escapeHTML(name)}</p><p>${message}</p><div class="dialog-actions"><button type="button" class="button secondary" id="cancel-management">Отмена</button><button type="button" class="button danger-button" id="confirm-delete">Удалить</button></div>`);
  $('cancel-management').onclick=onCancel;$('confirm-delete').onclick=()=>{if(!managementLocked())onConfirm();};$('cancel-management').focus();
}
function openPresets(){if(!managementLocked())settings.openPresets();}
$('material-presets').onclick=openPresets;
function readSavedProjects(){
  const stored=readManagementStorage('nestbolt-projects',[]);
  if(!Array.isArray(stored)||!stored.every(p=>p&&typeof p==='object'&&validManagementName(p.name))){if(stored!==null)toast('Не удалось прочитать сохранённые данные.');return null;}
  // Original releases used the name as the ID. Migrate without dropping geometry,
  // unknown legacy fields, or projects sharing an old name-based ID.
  const seen=new Set();let changed=false;
  const projects=stored.map(p=>{
    if(typeof p.id==='string'&&p.id&&(p.projectVersion===1||p.id!==p.name)&&!seen.has(p.id)){seen.add(p.id);if(p.projectVersion===1)return p;changed=true;return {...p,projectVersion:1};}
    const id=managementId();seen.add(id);changed=true;return {...p,id,projectVersion:1};
  });
  if(changed&&!storageSet('nestbolt-projects',projects))return null;
  return projects;
}
function validSavedProject(p){
  const finitePair=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite);
  const ring=points=>Array.isArray(points)&&points.length>=3&&points.every(finitePair);
  const polygon=poly=>poly&&ring(poly.outer)&&(!poly.holes||(Array.isArray(poly.holes)&&poly.holes.every(ring)));
  if(!p.library||!Array.isArray(p.library.parts)||!p.quantities||typeof p.quantities!=='object')return false;
  const ids=new Set();
  if(!p.library.parts.every(part=>{
    if(!part||typeof part.id!=='string'||ids.has(part.id)||typeof part.source!=='string'||!Array.isArray(part.bounds_mm)||part.bounds_mm.length!==4||!part.bounds_mm.every(Number.isFinite)||part.bounds_mm[2]<part.bounds_mm[0]||part.bounds_mm[3]<part.bounds_mm[1]||!Number.isFinite(part.area_mm2)||!polygon(part.polygon)||(part.components&&(!Array.isArray(part.components)||!part.components.every(polygon))))return false;
    ids.add(part.id);return Number.isInteger(p.quantities[part.id])&&p.quantities[part.id]>=0&&p.quantities[part.id]<=100;
  }))return false;
  if(!p.result)return true;
  const layout=p.result.layout,stock=p.request?.sheets?.[0];
  if(!layout||!Array.isArray(layout.sheets)||!layout.sheets.length||!Array.isArray(layout.placements)||!stock||!Number.isFinite(stock.width_mm)||!Number.isFinite(stock.height_mm)||stock.width_mm<=0||stock.height_mm<=0)return false;
  const sheets=new Set();
  if(!layout.sheets.every(sheet=>{if(!sheet||typeof sheet.id!=='string'||sheets.has(sheet.id))return false;sheets.add(sheet.id);return true;}))return false;
  return layout.placements.every(placement=>placement&&ids.has(placement.part_id)&&sheets.has(placement.sheet_id)&&finitePair(placement.transform?.translation)&&Number.isFinite(placement.transform.rotation_radians));
}
function saveProject(){
  if(managementLocked())return false;
  if(!state.library.parts.length){toast('Сначала добавьте детали в проект.');return false;}
  const projects=readSavedProjects();if(!projects)return false;
  const name=state.projectName.trim();
  if(!validManagementName(name)){toast('Название должно содержать от 1 до 60 символов.');return false;}
  if(projects.some(p=>p.id!==state.projectId&&managementNameKey(p.name)===managementNameKey(name))){toast('Проект с таким названием уже существует.');return false;}
  const index=projects.findIndex(p=>p.id===state.projectId);
  if(index<0&&projects.length>=12){toast('Достигнут предел: 12 сохранённых проектов. Удалите один из них.');return false;}
  const id=index>=0?projects[index].id:managementId();
  const project={id,projectVersion:1,name,projectExplicitName:state.projectExplicitName===true,importNames:state.importNames||state.library.studio_import_names||[],library:state.library,quantities:state.quantities,result:state.result,request:state.request,dirty:state.dirty,history:state.history,chartSeconds:state.chartSeconds,presetSelection:settings.captureSelection(),date:new Date().toISOString(),settings:settings.capture()};
  if(index>=0)projects[index]=project;else projects.unshift(project);
  if(!storageSet('nestbolt-projects',projects))return false;
  state.projectId=id;updateProjectCount();return true;
}
function updateProjectCount(){const projects=readSavedProjects();$('project-count').textContent=projects?.length||0;}
function renameSavedProject(id){
  if(managementLocked())return;const projects=readSavedProjects(),project=projects?.find(p=>p.id===id);if(!project)return;
  showDialog('Переименовать проект',`<form id="rename-project-form" novalidate><label class="dialog-label" for="rename-project-name">Название проекта</label><input class="dialog-input" id="rename-project-name" maxlength="60" required value="${escapeHTML(project.name)}"><p id="management-error" class="management-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" id="cancel-management">Отмена</button><button type="submit" class="button primary" id="save-project-name">Сохранить</button></div></form>`);
  $('cancel-management').onclick=openProjects;
  $('rename-project-form').onsubmit=event=>{
    event.preventDefault();if(managementLocked())return;
    const name=$('rename-project-name').value.trim();
    if(!validManagementName(name)){managementError('Название должно содержать от 1 до 60 символов.');$('rename-project-name').focus();return;}
    const latest=readSavedProjects();if(!latest)return;
    if(latest.some(p=>p.id!==id&&managementNameKey(p.name)===managementNameKey(name))){managementError('Проект с таким названием уже существует.');return;}
    const current=latest.find(p=>p.id===id);if(!current){openProjects();return;}
    current.name=name;current.projectExplicitName=true;
    if(storageSet('nestbolt-projects',latest)){if(state.projectId===id){state.projectName=name;state.projectExplicitName=true;}openProjects();toast('Название проекта изменено.');}
  };
  $('rename-project-name').focus();$('rename-project-name').select();
}
function openProjects(){
  if(managementLocked())return;const projects=readSavedProjects();if(!projects)return;
  showDialog('Мои проекты',`<p>Проекты сохраняются только в этом браузере. Можно сохранить текущий проект в диалоге «Новый проект».</p>${projects.length?projects.map((p,i)=>`<div class="project-card" data-project-id="${escapeHTML(p.id)}"><div class="management-project-info"><strong data-i18n-ignore>${escapeHTML(p.name)}</strong><small>${Number.isFinite(Date.parse(p.date))?new Date(p.date).toLocaleDateString(document.documentElement.lang||'ru'):''}</small></div><div class="management-row-actions"><button type="button" class="button secondary" data-open-project="${i}">Открыть</button><button type="button" class="button secondary" data-rename-project="${escapeHTML(p.id)}">Переименовать</button><button type="button" class="button secondary danger-button" data-delete-project="${escapeHTML(p.id)}">Удалить</button></div></div>`).join(''):'<p>Сохранённых проектов пока нет.</p>'}`);
  $('dialog-content').querySelectorAll('[data-open-project]').forEach(button=>button.onclick=()=>{
    if(managementLocked())return;const id=projects[Number(button.dataset.openProject)]?.id,latest=readSavedProjects(),p=latest?.find(project=>project.id===id);if(!p)return;
    if(!validSavedProject(p)){toast('Не удалось открыть проект: сохранённые данные повреждены.');return;}
    state.library=p.library;state.quantities=p.quantities;state.result=p.result||null;state.request=p.request||null;state.projectName=p.name;state.projectId=p.id;state.projectExplicitName=p.projectExplicitName??true;state.importNames=Array.isArray(p.importNames)?p.importNames:Array.isArray(p.library.studio_import_names)?p.library.studio_import_names:(p.library.imports||[]).map(item=>item.file);state.dirty=p.dirty===true;state.tab=0;state.selected=null;state.history=[];state.zoom=1;state.paintWarnings=[];previewLayout=emptyLayout();state.liveLayout=null;state.liveRequest=null;
    state.restoring=true;try{settings.apply(p.settings||{});settings.restoreSelection(p.presetSelection??null);}finally{state.restoring=false;}
    state.history=Array.isArray(p.history)?p.history.filter(point=>point&&Number.isFinite(point.t)&&Number.isFinite(point.utilization)):[];
    state.chartSeconds=Number.isFinite(p.chartSeconds)&&p.chartSeconds>0?p.chartSeconds:p.result?.seconds||10;
    state.chosenParts.clear();renderParts();renderCanvas();updateMetrics();drawChart();$('app-dialog').close();toast('Проект открыт.');
  });
  $('dialog-content').querySelectorAll('[data-rename-project]').forEach(button=>button.onclick=()=>renameSavedProject(button.dataset.renameProject));
  $('dialog-content').querySelectorAll('[data-delete-project]').forEach(button=>button.onclick=()=>{
    if(managementLocked())return;const p=projects.find(p=>p.id===button.dataset.deleteProject);if(!p)return;
    confirmManagementDelete('Удалить проект?',p.name,'Удалится только сохранённая копия. Открытый проект останется в рабочей области.',()=>{
      const latest=readSavedProjects();if(!latest)return;
      if(storageSet('nestbolt-projects',latest.filter(project=>project.id!==p.id))){if(state.projectId===p.id)state.projectId=null;updateProjectCount();openProjects();toast('Проект удалён.');}
    },openProjects);
  });
}
function newProjectDialog(){
  if(managementLocked())return;
  showDialog('Новый проект',`<p>Создайте пространство для следующего раскроя. Текущий результат можно сохранить.</p><label class="dialog-label" for="project-name">Название проекта</label><input class="dialog-input" id="project-name" maxlength="60" value="Новый раскрой"><p id="management-error" class="management-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" id="save-current-project">Сохранить текущий</button><button type="button" class="button primary" id="create-project">Создать проект</button></div>`);
  $('save-current-project').onclick=()=>{const explicit=state.projectExplicitName;state.projectExplicitName=true;if(saveProject())toast('Текущий проект сохранён.');else state.projectExplicitName=explicit;};
  $('create-project').onclick=()=>{
    if(managementLocked())return;const name=$('project-name').value.trim();
    if(!validManagementName(name)){managementError('Название должно содержать от 1 до 60 символов.');$('project-name').focus();return;}
    const projects=readSavedProjects();if(!projects)return;
    if(projects.some(p=>managementNameKey(p.name)===managementNameKey(name))){managementError('Проект с таким названием уже существует.');return;}
    state.projectName=name;state.projectId=null;state.projectExplicitName=true;state.importNames=[];state.library=emptyLibrary();state.chosenParts.clear();state.quantities={};state.result=null;state.request=null;state.selected=null;state.tab=0;state.dirty=false;state.history=[];state.zoom=1;state.paintWarnings=[];previewLayout=emptyLayout();state.liveLayout=null;state.liveRequest=null;
    $('sheet-width').value=600;$('sheet-height').value=400;$('spacing').value=3;$('margin').value=5;settings.syncTime();settings.restoreSelection(null);renderParts();renderCanvas();updateMetrics();drawChart();$('app-dialog').close();toast(`Проект «${name}» создан. Загрузите SVG или DXF.`);
  };
}
$('new-project').onclick=newProjectDialog;
function openHelp(){showDialog('От чертежа до готового раскроя',`<h3>01 / Добавьте детали</h3><p>Перетащите SVG или DXF с замкнутыми контурами в область карты или нажмите на неё. До запуска раскроя отображается импортированный чертёж.</p><h3>02 / Настройте лист</h3><p>Укажите размеры листа, зазор, поля и поворот. В окне «Сохранённые параметры» можно выбрать или сохранить полный набор настроек. Дополнительные настройки находятся в разделе «Расширенные параметры».</p><h3>03 / Запустите раскрой</h3><p>WebAssembly рассчитывает размещение в отдельном потоке. Все промежуточные раскладки, которые выдаёт движок, отображаются на карте. Итоговая геометрия проверяется перед экспортом.</p><h3>04 / Экспортируйте SVG</h3><p>Все листы сохраняются в одном SVG: по горизонтали с промежутком 100 мм. Имя файла берётся из исходного чертежа или названия сохранённого проекта. В параметрах экспорта можно выбрать текущий лист и добавить контур листа. Перед резкой проверьте файл в программе станка.</p><p class="about-engine">beinest — самостоятельный интерфейс на базе MIT-лицензированного движка <a href="https://github.com/skulitom/Nestbolt" target="_blank" rel="noopener noreferrer"><strong>Nestbolt ↗</strong></a>. Расчёт и файлы остаются на вашем устройстве.</p>`);}
$('help-button').onclick=openHelp;
document.querySelectorAll('[data-nav]').forEach(a=>a.onclick=e=>{const type=a.dataset.nav;if(type==='projects'){e.preventDefault();openProjects();}else if(type==='materials'){e.preventDefault();openPresets();}else if(type==='analytics'){e.preventDefault();$('analytics').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}else{document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n===a));}closeMenu();});

// Nestbolt handles hole geometry intrinsically; this is explanatory, not a fake engine option.
const holeToggle=$('allow-holes');holeToggle.disabled=true;holeToggle.closest('.toggle-row').querySelector('label').innerHTML='Учитывать отверстия<span>Автоматически в движке Nestbolt</span>';holeToggle.setAttribute('aria-label','Отверстия учитываются автоматически');
state.engine=new NestEngine();state.engineReady=Promise.resolve();
settings=setupSettings({onDirty:markDirty,isRunning:()=>state.running||state.exporting||state.importing});
// Reload starts a fresh workspace, not the last opened saved record. Give this
// workspace a free name so automatic saves cannot overwrite or collide with it.
const startupProjects=readSavedProjects();
if(startupProjects){const names=new Set(startupProjects.map(project=>managementNameKey(project.name))),base=state.projectName;let suffix=2;while(names.has(managementNameKey(state.projectName)))state.projectName=`${base} (${suffix++})`;}
state.library.parts.forEach((p,i)=>p.studio_paint={fill:colors[i%colors.length][0],stroke:colors[i%colors.length][1],opacity:1});
renderParts();renderCanvas();updateMetrics();drawChart();updateProjectCount();setupI18n();
window.addEventListener('beforeunload',()=>{state.engine?.dispose();clearInterval(progressTimer);});