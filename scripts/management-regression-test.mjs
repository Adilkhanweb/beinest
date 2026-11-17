// Native manager CRUD: genuine SVG import only, no nesting search or synthetic saved fixtures.
// Serve with node scripts/serve.mjs; uses TEST_URL/TEST_PORT, CHROME_PATH, PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const executablePath=process.env.CHROME_PATH||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
].find(existsSync);
assert.ok(executablePath,'Set CHROME_PATH to an installed Chromium browser');
const base=process.env.TEST_URL||`http://127.0.0.1:${process.env.TEST_PORT||4175}`;
const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],report={status:'running',checks:[],matrix:[],errors};
page.on('pageerror',e=>errors.push(e.message));
const presetKey='nestbolt-saved-parameters-v2',projectKey='nestbolt-projects';
const presets=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),presetKey);
const projects=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key))||[],projectKey);
const close=()=>page.locator('#dialog-close').click();
const sheets=()=>page.locator('#material-presets').click();
const openProjects=()=>page.locator('[data-nav="projects"]').click();
const check=label=>{report.checks.push(label);console.log('PASS',label);};
async function createProject(name){
  await page.locator('#new-project').click();await page.locator('#project-name').fill(name);await page.locator('#create-project').click();
  assert.equal(await page.locator('#app-dialog').evaluate(el=>el.open),false);
}
async function importPart(name){
  await page.locator('#parts-tab').click();
  await page.locator('#file-input').setInputFiles({name:name+'.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40"><path id="blue" fill="#1234ef" d="M0 0H50V30H0Z"/></svg>')});
  await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===1,null,{timeout:90000});
}
async function saveCurrent(){
  await page.locator('#new-project').click();await page.locator('#save-current-project').click();await close();
}
async function renameProject(id,name){
  await page.locator(`[data-rename-project="${id}"]`).click();await page.locator('#rename-project-name').fill(name);await page.locator('#save-project-name').click();
}
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true});}
async function mobileNav(){
  if(await page.locator('#sidebar').getAttribute('aria-hidden')==='true')await page.locator('#menu-button').click();
}
async function defaultNameReloadRegression(){
  const isolated=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  try{
    const fresh=await isolated.newPage();fresh.setDefaultTimeout(15000);
    fresh.on('pageerror',error=>errors.push(`Default-name reload: ${error.message}`));
    const read=()=>fresh.evaluate(key=>JSON.parse(localStorage.getItem(key))||[],projectKey);
    const importAndSave=async(name,width)=>{
      await fresh.locator('#parts-tab').click();
      await fresh.locator('#file-input').setInputFiles({name:name+'.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="50mm" viewBox="0 0 80 50"><path id="fixture" fill="#1234ef" d="M0 0H${width}V30H0Z"/></svg>`)});
      await fresh.waitForFunction(()=>document.querySelectorAll('.part-row').length===1,null,{timeout:90000});
      await fresh.locator('#new-project').click();await fresh.locator('#save-current-project').click();await fresh.locator('#dialog-close').click();
    };
    await fresh.goto(base,{waitUntil:'networkidle'});
    await importAndSave('default-original',40);
    const original=(await read())[0];
    assert.ok(original,'First genuine import saves through the native Save current button');
    assert.equal(original.name,'Новый раскрой');assert.equal(original.library.parts.length,1);assert.equal(original.result,null);assert.deepEqual(original.importNames,['default-original.svg']);assert.equal(original.projectExplicitName,true);
    await fresh.reload({waitUntil:'networkidle'});
    assert.equal(await fresh.locator('.part-row').count(),0,'Reload starts a fresh unsaved workspace');
    await importAndSave('default-after-reload',60);
    const records=await read();assert.equal(records.length,2,'Default-name reload creates a second saved project');
    const next=records.find(record=>record.name==='Новый раскрой (2)');assert.ok(next,'Fresh workspace receives a collision-free default name');
    assert.notEqual(next.id,original.id);assert.equal(next.library.parts.length,1);assert.equal(next.result,null);
    assert.notDeepEqual(next.library,original.library,'Each saved project contains its own genuinely imported geometry');
    assert.deepEqual(records.find(record=>record.id===original.id),original,'Saving after reload leaves the original saved record entirely unchanged');
    await fresh.locator('#new-project').click();await fresh.locator('#save-current-project').click();await fresh.locator('#dialog-close').click();
    assert.equal((await read()).length,2,'Repeated Save current still updates the new stable ID');
    assert.equal((await read()).find(record=>record.name==='Новый раскрой (2)').id,next.id);
    check('Fresh reload saves a distinct default project without overwriting the original, retaining source metadata');
  }finally{await isolated.close();}
}
try{
  await page.goto(base,{waitUntil:'networkidle'});await sheets();
  assert.equal(await page.locator('[data-preset]').count(),4);
  assert.match(await page.locator('[data-preset="1"]').textContent(),/600 × 400/);
  assert.equal((await presets()).version,2);check('Four seeded complete presets retain data-preset=1');
  await page.locator('#add-parameter-preset').click();
  await page.locator('#parameter-preset-name').fill('   ');await page.locator('#save-preset').click();assert.equal(await page.locator('#management-error').isVisible(),true);
  await page.locator('#parameter-preset-name').fill('Custom <& " board');
  for(const invalid of ['49','10001','50.5','']){
    await page.locator('#preset-sheet-width').fill(invalid);await page.locator('#save-preset').click();
    assert.equal(await page.locator('#parameter-preset-form').count(),1);assert.equal((await presets()).items.length,4);
  }
  await page.locator('#preset-sheet-width').fill('777');await page.locator('#preset-sheet-height').fill('555');await page.locator('#save-preset').click();
  let custom=(await presets()).items.find(p=>p.name==='Custom <& " board');assert.ok(custom);
  assert.equal(await page.locator(`[data-preset="${custom.id}"] span`).textContent(),custom.name);
  await page.locator(`[data-preset="${custom.id}"]`).click();assert.equal(await page.locator('#sheet-width').inputValue(),'777');assert.equal(await page.locator('#sheet-height').inputValue(),'555');
  await sheets();await page.locator(`[data-edit-preset="${custom.id}"]`).click();
  await page.locator('#parameter-preset-name').fill('Стандартный');await page.locator('#save-preset').click();assert.equal(await page.locator('#management-error').isVisible(),true);
  await page.locator('#parameter-preset-name').fill('Updated <& " board');await page.locator('#preset-sheet-width').fill('888');await page.locator('#save-preset').click();
  await page.reload({waitUntil:'networkidle'});await sheets();assert.match(await page.locator(`[data-preset="${custom.id}"]`).textContent(),/888 × 555/);
  await page.locator(`[data-edit-preset="1"]`).click();await page.locator('#preset-sheet-width').fill('650');await page.locator('#save-preset').click();
  assert.equal((await presets()).items.find(p=>p.id==='1').settings['sheet-width'],'650');check('Full preset validation, escaped names, apply, edits, built-in edits and reload');
  await page.locator(`[data-delete-preset="${custom.id}"]`).click();await page.locator('#cancel-management').click();assert.equal(await page.locator(`[data-preset="${custom.id}"]`).count(),1);
  await page.locator(`[data-delete-preset="${custom.id}"]`).click();await page.locator('#confirm-delete').click();assert.equal(await page.locator(`[data-preset="${custom.id}"]`).count(),0);
  for(const item of (await presets()).items){await page.locator(`[data-delete-preset="${item.id}"]`).click();await page.locator('#confirm-delete').click();}
  assert.deepEqual((await presets()).items,[]);await page.reload({waitUntil:'networkidle'});await sheets();assert.equal(await page.locator('[data-preset]').count(),0);check('Confirmed deletes, cancel, and empty list survive reload without re-seeding');await close();

  const firstName='Project <& " A',secondName='Project B';
  await createProject(firstName);await importPart('first-real-drawing');await saveCurrent();
  let saved=await projects();assert.equal(saved.length,1);const firstId=saved[0].id;assert.notEqual(firstId,firstName);assert.equal(saved[0].library.parts.length,1);assert.equal(saved[0].result,null);
  await saveCurrent();assert.equal((await projects()).length,1);assert.equal((await projects())[0].id,firstId);check('Genuine imported SVG saves before nesting; repeated save updates stable identity');
  await createProject(secondName);assert.equal(await page.locator('.part-row').count(),0);await importPart('second-real-drawing');await saveCurrent();
  saved=await projects();assert.equal(saved.length,2);const secondId=saved.find(p=>p.name===secondName).id;assert.notEqual(firstId,secondId);
  await openProjects();assert.equal(await page.locator('.project-card').count(),2);
  assert.equal(await page.locator(`[data-project-id="${firstId}"] strong`).textContent(),firstName);
  await renameProject(firstId,secondName);assert.equal(await page.locator('#management-error').isVisible(),true);assert.equal((await projects()).length,2);await page.locator('#cancel-management').click();
  await renameProject(secondId,'Renamed <& " B');assert.equal((await projects()).find(p=>p.id===secondId).name,'Renamed <& " B');await close();await saveCurrent();
  saved=await projects();assert.equal(saved.length,2);assert.equal(saved.find(p=>p.id===secondId).name,'Renamed <& " B');check('Second real project, collision rejection, rename current then save without duplicate');
  await page.reload({waitUntil:'networkidle'});await openProjects();
  await page.locator(`[data-project-id="${firstId}"] [data-open-project]`).click();assert.equal(await page.locator('.part-row').count(),1);
  assert.match(await page.locator('#layout-status').textContent(),/Предпросмотр/,'Reopening manually saved imported parts restores source preview');assert.equal(await page.locator('.import-preview-card').count(),1);
  assert.equal(await page.locator('#export-button').isDisabled(),true);await saveCurrent();assert.equal((await projects()).length,2);assert.equal((await projects()).find(p=>p.id===firstId).dirty,true);
  check('Manual save and reload preserve dirty state and keep unsafe export disabled');
  await openProjects();await page.locator(`[data-delete-project="${firstId}"]`).click();await page.locator('#cancel-management').click();assert.equal((await projects()).length,2);
  await page.locator(`[data-delete-project="${firstId}"]`).click();await page.locator('#confirm-delete').click();assert.equal((await projects()).length,1);assert.equal(await page.locator('.part-row').count(),1);
  await close();await saveCurrent();saved=await projects();assert.equal(saved.length,2);const recreated=saved.find(p=>p.name===firstName);assert.notEqual(recreated.id,firstId);check('Open reloads real geometry, cancel delete, delete loaded keeps canvas, re-save creates fresh ID');
  // Migrate the very same genuine saved records to the legacy name-as-id shape.
  const expected=saved.map(p=>JSON.stringify(p.library));
  await page.evaluate(key=>{const records=JSON.parse(localStorage.getItem(key));for(const p of records){delete p.projectVersion;p.id=p.name;}localStorage.setItem(key,JSON.stringify(records));},projectKey);
  await page.reload({waitUntil:'networkidle'});saved=await projects();assert.deepEqual(saved.map(p=>JSON.stringify(p.library)),expected);assert.ok(saved.every(p=>p.projectVersion===1&&p.id!==p.name));check('Legacy migration preserves genuine library bytes and produces stable IDs');

  // Durable CRUD in all supported languages; user names must not be translated.
  for(const [language,addLabel] of [['ru','Сохранить текущие параметры'],['en','Save current parameters'],['kk','Ағымдағы параметрлерді сақтау']]){
    await page.locator('#language-select').selectOption(language);await sheets();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#add-parameter-preset').textContent(),addLabel);
    await page.locator('#add-parameter-preset').click();await page.locator('#parameter-preset-name').fill('Стандартный');await page.locator('#preset-sheet-width').fill('400');await page.locator('#preset-sheet-height').fill('300');await page.locator('#save-preset').click();
    const p=(await presets()).items[0];assert.equal(await page.locator(`[data-preset="${p.id}"] span`).textContent(),'Стандартный');
    await page.locator(`[data-delete-preset="${p.id}"]`).click();await page.locator('#confirm-delete').click();await close();
    report.matrix.push({language,crud:true});
  }
  check('RU / EN / KK managers translate while user names stay verbatim');
  await page.locator('#language-select').selectOption('en');
  await sheets();await page.locator('#add-parameter-preset').click();await page.locator('#parameter-preset-name').fill('Responsive parameters');await page.locator('#save-preset').click();await close();
  for(const width of [320,375,1440]){
    await page.setViewportSize({width,height:1000});await mobileNav();await openProjects();
    assert.equal(await page.locator('#app-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`Project dialog fits ${width}`);
    await screenshot(`management-projects-${width}`);await close();await page.locator('#settings-tab').click();await sheets();
    assert.equal(await page.locator('#app-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`Preset dialog fits ${width}`);
    await screenshot(`management-presets-${width}`);await close();
    report.matrix.push({width,dialogOverflow:false});
  }
  check('320 / 375 / 1440 dialogs fit viewport');
  await page.setViewportSize({width:1440,height:1000});
  // Exceptions and corrupt storage must not overwrite the user's stored data.
  await page.evaluate(key=>localStorage.setItem(key,'{broken'),presetKey);await page.reload({waitUntil:'networkidle'});await sheets();assert.equal(await page.locator('#add-parameter-preset').isDisabled(),true);assert.equal(await page.evaluate(key=>localStorage.getItem(key),presetKey),'{broken');await close();
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:2,items:[],selectedId:null})),presetKey);await page.reload({waitUntil:'networkidle'});await sheets();await page.locator('#add-parameter-preset').click();await page.locator('#parameter-preset-name').fill('Cannot persist');
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});await page.locator('#save-preset').click();assert.equal(await page.locator('#parameter-preset-form').count(),1);assert.deepEqual((await presets()).items,[]);
  await page.reload({waitUntil:'networkidle'});await page.evaluate(key=>localStorage.setItem(key,'{}'),projectKey);await openProjects();assert.equal(await page.locator('#app-dialog').evaluate(el=>el.open),false);assert.equal(await page.evaluate(key=>localStorage.getItem(key),projectKey),'{}');check('Corrupt storage and failed writes remain intact without crashes');
  await defaultNameReloadRegression();
  assert.deepEqual(errors,[]);report.status='passed';console.log('Management regression passed');
}catch(error){report.status='failed';report.failure=error.stack;try{await screenshot('management-failure');}catch{}throw error;}
finally{await writeFile(new URL('management-report.json',out),JSON.stringify(report,null,2));await context.close();await browser.close();}