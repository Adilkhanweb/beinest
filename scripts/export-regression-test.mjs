// Real engine/export regression. No synthetic multi-sheet layouts are used here.
// --zip-only checks the production ZIP writer without launching a browser/server.
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspectCombinedDownload} from './combined-export-regression-test.mjs';

// Independent, bitwise CRC implementation (does not reuse the writer's table).
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function readZip(input){
  const b=Buffer.from(input);assert.ok(b.length>=22,'ZIP has an end record');
  const end=b.length-22;assert.equal(b.readUInt32LE(end),0x06054b50,'EOCD signature');
  assert.equal(b.readUInt16LE(end+4),0);assert.equal(b.readUInt16LE(end+6),0);
  const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),start=b.readUInt32LE(end+16);
  assert.equal(b.readUInt16LE(end+8),count);assert.equal(b.readUInt16LE(end+20),0);
  assert.ok(count>0);assert.equal(start+size,end,'Central directory exactly precedes EOCD');
  const files=new Map();let pos=start,localEnd=0;
  for(let i=0;i<count;i++){
    assert.equal(b.readUInt32LE(pos),0x02014b50,'Central signature');
    const flags=b.readUInt16LE(pos+8),method=b.readUInt16LE(pos+10),crc=b.readUInt32LE(pos+16),compressed=b.readUInt32LE(pos+20),length=b.readUInt32LE(pos+24),n=b.readUInt16LE(pos+28),extra=b.readUInt16LE(pos+30),comment=b.readUInt16LE(pos+32),offset=b.readUInt32LE(pos+42);
    assert.equal(flags,0x0800,'UTF-8 names; no encryption/data descriptors');assert.ok([0,8].includes(method));
    assert.equal(b.readUInt16LE(pos+34),0);assert.equal(offset,localEnd,'No hidden or overlapping local entries');
    const name=b.subarray(pos+46,pos+46+n).toString('utf8');assert.ok(!files.has(name),'Unique names');
    assert.equal(b.readUInt32LE(offset),0x04034b50,'Local signature');
    assert.equal(b.readUInt16LE(offset+6),flags);assert.equal(b.readUInt16LE(offset+8),method);
    assert.equal(b.readUInt32LE(offset+14),crc);assert.equal(b.readUInt32LE(offset+18),compressed);assert.equal(b.readUInt32LE(offset+22),length);
    const localName=b.readUInt16LE(offset+26),localExtra=b.readUInt16LE(offset+28);
    assert.equal(b.subarray(offset+30,offset+30+localName).toString('utf8'),name);
    const dataStart=offset+30+localName+localExtra;localEnd=dataStart+compressed;assert.ok(localEnd<=start);
    const packed=b.subarray(dataStart,localEnd),data=method===0?packed:inflateRawSync(packed);
    assert.equal(data.length,length,'Uncompressed length');assert.equal(crc32(data),crc,`CRC-32: ${name}`);
    files.set(name,data);pos+=46+n+extra+comment;
  }
  assert.equal(pos,end);assert.equal(localEnd,start);return files;
}
async function zipUnitTest(){
  const {createZip}=await import('../export-files.js');
  const expected=[{name:'лист-1.svg',content:'<svg>Қазақша ӘҒҚҢӨҰҮҺІ</svg>'},{name:'sheet-2.svg',content:'<svg>second</svg>'}];
  const bytes=Buffer.from(await createZip(expected).arrayBuffer()),files=readZip(bytes);
  assert.deepEqual([...files.keys()],expected.map(f=>f.name));for(const f of expected)assert.equal(files.get(f.name).toString('utf8'),f.content);
  const broken=Buffer.from(bytes);broken[30+Buffer.byteLength(expected[0].name)]^=1;
  assert.throws(()=>readZip(broken),/CRC-32/,'Parser rejects corrupted entry data');
  const badDirectory=Buffer.from(bytes);badDirectory.writeUInt32LE(0,bytes.length-6);
  assert.throws(()=>readZip(badDirectory),/Central directory/,'Parser rejects broken directory offset');
  assert.throws(()=>createZip([]));return {entries:files.size,crcCorruptionRejected:true,directoryCorruptionRejected:true};
}
const results={zipUnit:await zipUnitTest()};
if(process.argv.includes('--zip-only')){console.log(JSON.stringify(results,null,2));}
else{
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
  const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
  assert.ok(executablePath,'Set CHROME_PATH');
  const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_URL||`http://127.0.0.1:${process.env.TEST_PORT||4175}`;
  async function download(name){const event=page.waitForEvent('download');await page.locator('#export-button').click();const file=await event;assert.equal(await file.failure(),null);const path=new URL(name,out);await file.saveAs(fileURLToPath(path));return {filename:file.suggestedFilename(),bytes:await readFile(path)};}
  async function metric(){return {time:await page.locator('#stat-time').textContent(),iterations:await page.locator('#stat-iterations').textContent()};}
  async function openSaved(){await page.locator('[data-nav="projects"]').click();await page.locator('[data-open-project]').first().click();}
  async function inspectSvg(bytes){return page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))throw new Error('Invalid exported SVG');
    const svg=document.importNode(doc.documentElement,true);svg.style.position='fixed';svg.style.left='-10000px';document.body.append(svg);
    try{return {width:svg.getAttribute('width'),height:svg.getAttribute('height'),viewBox:svg.getAttribute('viewBox'),sheet:svg.querySelector('g[id$="-SHEET"] rect[id$="-sheet"]')?.outerHTML||null,shapes:[...svg.querySelectorAll('path,polygon,polyline,rect,circle,ellipse')].filter(e=>!e.closest('defs')).map(e=>{const box=e.getBBox();return {tag:e.tagName,geometry:e.outerHTML,box:{x:box.x,y:box.y,width:box.width,height:box.height}};})};}finally{svg.remove();}
  },bytes.toString('utf8'));}
  try{
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('#export-parameters').evaluate(el=>el.open=true);
    assert.equal(await page.locator('#export-scope').inputValue(),'all');assert.equal(await page.locator('#export-sheet-outline').isChecked(),false);
    assert.deepEqual(await metric(),{time:'0 мин 0 сек',iterations:'0'});
    assert.equal(await page.locator('#parameter-preset').evaluate(el=>!el.closest('#advanced-parameters')),true);
    assert.equal(await page.locator('#settings-content').evaluate(el=>el.firstElementChild.contains(document.querySelector('#parameter-preset'))),true,'Presets are the first settings section');
    const tag=page.locator('#toggle-labels');assert.equal((await tag.textContent()).trim(),'','Tag toggle is icon-only');assert.equal(await tag.locator('[data-icon="tag"]').count(),1);assert.ok(await tag.getAttribute('aria-label')||await tag.getAttribute('title'));
    await page.locator('#advanced-parameters > summary').click();
    assert.equal(await page.locator('#time-output').getAttribute('type'),'number');
    for(const value of ['1','300','67']){await page.locator('#time-output').fill(value);assert.equal(await page.locator('#time-budget').inputValue(),value);}
    for(const value of ['0','301','1.5','']){await page.locator('#time-output').fill(value);assert.equal(await page.locator('#time-output').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#time-budget').inputValue(),'67');}
    await page.locator('#time-budget').fill('3');assert.equal(await page.locator('#time-output').inputValue(),'3');
    for(const [locale,expected] of [['en','0 min 0 sec'],['kk','0 мин 0 сек'],['ru','0 мин 0 сек']]){await page.locator('#language-select').selectOption(locale);await page.waitForFunction(value=>document.querySelector('#stat-time').textContent===value,expected);}
    results.numericTimePresetAndLocale=true;
    // Each 100x80 concave bracket fits 120x100 stock, but two cannot share one sheet.
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80"><path d="M0 0H100V30H40V80H0Z"/></svg>';
    await page.locator('#parts-tab').click();await page.locator('#file-input').setInputFiles({name:'real-bracket.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===1);
    await page.locator('[data-quantity]').fill('2');await page.locator('[data-quantity]').dispatchEvent('change');
    await page.locator('#settings-tab').click();await page.locator('#sheet-width').fill('120');await page.locator('#sheet-height').fill('100');
    await page.evaluate(()=>{window.iterationSamples=[];window.iterationObserver=new MutationObserver(()=>{if(document.body.classList.contains('is-running'))window.iterationSamples.push(Number(document.querySelector('#stat-iterations').textContent));});window.iterationObserver.observe(document.querySelector('#stat-iterations'),{childList:true,characterData:true,subtree:true});});
    await page.locator('#run-button').click();await page.waitForFunction(()=>document.body.classList.contains('is-running'));
    await page.waitForFunction(()=>!document.body.classList.contains('is-running'),null,{timeout:90000});
    assert.match(await page.locator('#layout-status').textContent(),/проверен/,await page.locator('#toast-text').textContent());assert.equal(await page.locator('.sheet-card').count(),2);
    const committed=await metric(),saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]);
    assert.ok(Number(committed.iterations)>0);assert.equal(Number(committed.iterations),saved.result.studio_iterations);assert.ok(saved.result.studio_elapsed>0);
    const seconds=Math.floor(saved.result.studio_elapsed);assert.equal(committed.time,`${Math.floor(seconds/60)} мин ${seconds%60} сек`);
    const samples=await page.evaluate(()=>{window.iterationObserver.disconnect();return window.iterationSamples;});assert.ok(samples.some(n=>n>0));assert.ok(samples.every((n,i)=>!i||n>=samples[i-1]),'Live iterations are monotonic');
    const labels=await page.locator('.shape-label').evaluateAll(els=>els.map(el=>({font:parseFloat(getComputedStyle(el).fontSize),scale:Math.hypot(el.getScreenCTM().a,el.getScreenCTM().b)})));
    assert.equal(labels.length,2);assert.ok(labels.every(l=>l.font*l.scale>=13.9),'Part labels are at least 14 screen pixels');
    results.realTwoSheetRun={iterations:saved.result.studio_iterations,elapsed:saved.result.studio_elapsed};
    await page.locator('.sheet-card-heading').nth(1).click();assert.equal(await page.locator('#export-scope').inputValue(),'all','Selecting a card does not change all-sheet export scope');
    const native=async outline=>page.evaluate(async({saved,outline})=>{
      const {NestEngine}=await import('./engine.js'),engine=new NestEngine();
      try{return await Promise.all(saved.result.layout.sheets.map(sheet=>engine.exportSheet(saved.library,saved.request,saved.result.layout,sheet.id,'svg',{outline})));}finally{engine.dispose();}
    },{saved,outline});
    const natives=await native(false),all=await download('export-all.svg');assert.equal(all.filename,'real-bracket beinest 2 lists.svg');
    const allData=await inspectCombinedDownload(page,all.bytes,natives);assert.equal(allData.width,340);assert.equal(allData.sheets[1].x,220);assert.equal(allData.height,100);
    assert.equal(await page.locator('.export-format').textContent(),'SVG');
    await page.locator('.sheet-card-heading').nth(1).click();await page.locator('#export-scope').selectOption('selected');assert.equal(await page.locator('#export-button').isDisabled(),false,'Export preferences do not dirty geometry');
    const selected=await download('export-selected-2.svg');assert.equal(selected.filename,'real-bracket beinest 1 lists.svg');await inspectCombinedDownload(page,selected.bytes,[natives[1]]);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('beinest-export-settings')).scope),'selected','Selected scope is saved independently of the project');
    const plain=await inspectSvg(selected.bytes);await page.locator('#export-sheet-outline').check();const outlined=await download('export-selected-2-outline.svg'),withOutline=await inspectSvg(outlined.bytes),nativeOutlined=await native(true);
    await inspectCombinedDownload(page,outlined.bytes,[nativeOutlined[1]]);
    assert.equal(plain.sheet,null);assert.ok(withOutline.sheet,'Native prefixed SHEET contains prefixed sheet rect');assert.equal(withOutline.viewBox,plain.viewBox);assert.ok(withOutline.shapes.length>plain.shapes.length,'Native outline adds cut geometry, not just viewBox');
    const added=withOutline.shapes.filter(s=>!plain.shapes.some(p=>p.geometry===s.geometry));
    const [x,y,w,h]=plain.viewBox.trim().split(/[\s,]+/).map(Number);
    assert.ok(added.some(s=>Math.abs(s.box.x-x)<0.01&&Math.abs(s.box.y-y)<0.01&&Math.abs(s.box.width-w)<0.01&&Math.abs(s.box.height-h)<0.01),'Added contour follows full sheet boundary');
    await page.locator('#export-scope').selectOption('all');const outlinedAll=await download('export-all-outline.svg');assert.equal(outlinedAll.filename,'real-bracket beinest 2 lists.svg');
    const outlinedData=await inspectCombinedDownload(page,outlinedAll.bytes,nativeOutlined);assert.ok(outlinedData.sheets.every(sheet=>sheet.outline),'Every merged sheet retains its native cut border');
    results.combinedSvgAndSelectedAndNativeOutline=true;
    await page.reload({waitUntil:'networkidle'});await page.locator('#export-parameters').evaluate(el=>el.open=true);assert.equal(await page.locator('#export-scope').inputValue(),'all');assert.equal(await page.locator('#export-sheet-outline').isChecked(),true);await openSaved();assert.deepEqual(await metric(),committed,'Elapsed and iterations persist when reopening');
    await page.locator('#advanced-parameters').evaluate(el=>el.open=true);await page.locator('#time-output').fill('20');await page.locator('#run-button').click();await page.waitForFunction(()=>document.body.classList.contains('is-running'));await page.waitForFunction(()=>Number(document.querySelector('#stat-iterations').textContent)>0&&document.querySelector('.nest-shape'),null,{timeout:90000});
    const latest=await page.evaluate(()=>{const snapshot={iterations:Number(document.querySelector('#stat-iterations').textContent),paths:[...document.querySelectorAll('.nest-shape')].map(el=>el.getAttribute('d'))};document.querySelector('#run-button').click();return snapshot;});
    await page.waitForFunction(()=>!document.body.classList.contains('is-running')&&!document.body.classList.contains('is-stopping'),null,{timeout:90000});const stopped=await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]),stoppedMetric=await metric();assert.equal(stopped.result.studio_stopped,true);assert.equal(stopped.result.validation.valid,true);assert.equal(stopped.result.studio_iterations,latest.iterations);assert.equal(Number(stoppedMetric.iterations),latest.iterations);assert.ok(stopped.result.studio_elapsed>0&&stopped.result.studio_elapsed<20);assert.equal(stopped.chartSeconds,stopped.result.studio_elapsed);assert.deepEqual(await page.locator('.nest-shape').evaluateAll(els=>els.map(el=>el.getAttribute('d'))),latest.paths,'Stop preserves exact latest geometry');assert.equal(await page.locator('#export-button').isDisabled(),false);await page.waitForTimeout(700);assert.deepEqual(await metric(),stoppedMetric,'Late messages cannot replace stopped metrics');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]),stopped,'Late messages cannot overwrite stopped project');results.metricPersistenceAndLatestCandidateStop=true;
    // One-sheet results must remain SVG even with the default all scope.
    await page.locator('#parts-tab').click();await page.locator('[data-quantity]').fill('1');await page.locator('[data-quantity]').dispatchEvent('change');await page.locator('#settings-tab').click();await page.locator('#time-output').fill('1');await page.locator('#run-button').click();await page.waitForFunction(()=>!document.body.classList.contains('is-running'),null,{timeout:90000});assert.equal(await page.locator('.sheet-card').count(),1);assert.match((await download('export-single.svg')).filename,/\.svg$/);results.singleSheetAllIsSvg=true;
    assert.deepEqual(errors,[]);results.status='passed';
  }catch(error){results.status='failed';results.failure=error.stack;await page.screenshot({path:fileURLToPath(new URL('export-regression-failure.png',out)),fullPage:true}).catch(()=>{});throw error;}
  finally{results.errors=errors;await browser.close();await writeFile(new URL('export-regression-report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}
}