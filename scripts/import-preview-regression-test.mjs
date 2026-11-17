// Real engine imports only. Preview geometry is not an optimizer result.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath,'Set CHROME_PATH');
const base=process.env.TEST_URL||`http://127.0.0.1:${process.env.TEST_PORT||4175}`;
const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
const report={status:'running',errors:[],failedAssets:[],checks:[]};
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failedAssets.push(`${r.status()} ${r.url()}`);});
const svg='<svg xmlns="http://www.w3.org/2000/svg" id="uploaded-root-never-mount" width="200mm" height="130mm" viewBox="0 0 200 130"><style id="uploaded-style-never-mount">.source-red{fill:#ef2030}</style><rect id="uploaded-shape-never-mount" class="source-red" x="10" y="20" width="30" height="40"/><rect fill="#1234ef" x="110" y="70" width="20" height="25"/></svg>';
const svgFile={name:'offset-source.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)};
const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES','0','LWPOLYLINE','100','AcDbEntity','8','0','100','AcDbPolyline','90','4','70','1','10','15','20','25','10','45','20','25','10','45','20','65','10','15','20','65','0','ENDSEC','0','EOF',''].join('\n');
async function shapes(){return page.locator('.import-preview-svg .nest-shape').evaluateAll(els=>els.map(el=>{const b=el.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};}).sort((a,b)=>a.x-b.x));}
function near(actual,expected){for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<.05,`${key}: ${actual[key]} != ${expected[key]}`);}
async function empty(){assert.equal(await page.locator('#canvas-dropzone').isVisible(),true);assert.equal(await page.locator('.sheet-card,.import-preview-card,.nest-shape').count(),0);assert.equal(await page.locator('#export-button').isDisabled(),true);}
async function removeAll(){await page.locator('#parts-tab').click();await page.locator('#select-all-parts').check();await page.locator('#delete-selected-parts').click();await empty();}
async function imported(count){await page.waitForFunction(n=>document.querySelectorAll('.part-row').length===n,count,{timeout:90000});assert.equal(await page.locator('.import-preview-card').count(),1);assert.equal(await page.locator('.sheet-card').count(),0);assert.equal(await page.locator('.import-preview-svg .nest-shape').count(),count);assert.equal(await page.locator('#stat-placed').textContent(),'0');assert.equal(await page.locator('#stat-sheets').textContent(),'0');assert.equal(await page.locator('#export-button').isDisabled(),true);}
try{
  await page.goto(base,{waitUntil:'networkidle'});await empty();
  await page.evaluate(()=>{window.uploadedMarkupViolations=[];window.uploadedMarkupObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;const selector='[id^="uploaded-"],#sheets-gallery script,#sheets-gallery style,#sheets-gallery image,#sheets-gallery foreignObject';if(node.matches(selector)||node.querySelector(selector))window.uploadedMarkupViolations.push(node.outerHTML);}});window.uploadedMarkupObserver.observe(document.body,{subtree:true,childList:true});});
  for(const activation of ['click','Enter','Space']){
    const event=page.waitForEvent('filechooser');
    if(activation==='click')await page.locator('#canvas-dropzone').click();else await page.locator('#canvas-dropzone').press(activation);
    await (await event).setFiles(svgFile);await imported(2);await removeAll();
  }
  report.checks.push('Empty canvas click, Enter and Space open native file chooser; delete all restores dropzone');
  // Dispatch an actual DataTransfer with File objects over the main empty canvas,
  // rather than setting the hidden chooser or calling application import methods.
  await page.locator('#canvas-stage').evaluate((el,{svg})=>{const dataTransfer=new DataTransfer();dataTransfer.items.add(new File([svg],'offset-source.svg',{type:'image/svg+xml'}));el.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));},{svg});
  await imported(2);const bounds=await shapes();near(bounds[0],{x:10,y:20,width:30,height:40});near(bounds[1],{x:110,y:70,width:20,height:25});report.svgBounds=bounds;
  assert.equal(await page.locator('#uploaded-root-never-mount,#uploaded-style-never-mount,#uploaded-shape-never-mount').count(),0,'Uploaded SVG markup is never mounted');
  assert.equal(await page.locator('#sheets-gallery script,#sheets-gallery style,#sheets-gallery image,#sheets-gallery foreignObject').count(),0);assert.deepEqual(await page.evaluate(()=>window.uploadedMarkupViolations),[],'Mutation observer confirms uploaded markup was never transiently mounted');
  await page.locator('#parts-tab').click();const row=page.locator('.part-row').first(),id=await row.getAttribute('data-part-id');
  await row.locator('[data-quantity]').fill('3');await row.locator('[data-quantity]').dispatchEvent('change');assert.equal(await page.locator('.nest-shape').count(),2,'Source preview has one geometry per part, not quantity copies');
  await row.locator('.part-select').check();assert.equal(await page.locator(`.nest-shape[data-part-id="${id}"]`).getAttribute('aria-pressed'),'true');
  await page.locator(`.nest-shape[data-part-id="${id}"]`).press('Enter');assert.equal(await row.locator('.part-select').isChecked(),true);await page.locator(`.nest-shape[data-part-id="${id}"]`).press('Space');assert.equal(await row.locator('.part-select').isChecked(),false);
  for(const theme of ['light','dark']){
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme-button').click();
    for(const mode of ['view-layout','view-outline','view-color']){
      await page.locator('#'+mode).click();assert.deepEqual(await shapes(),bounds,'Theme/mode never repositions source drawing');
      const fill=await page.locator('.nest-shape').first().getAttribute('fill');assert.equal(fill==='none',mode==='view-outline');
      assert.equal(await page.locator('.import-preview-card').evaluate(el=>getComputedStyle(el).display!=='none'),true);
    }
    await page.screenshot({path:fileURLToPath(new URL(`import-preview-${theme}.png`,out)),fullPage:true});
  }
  await page.locator('#new-project').click();await page.locator('#save-current-project').click();await page.locator('#dialog-close').click();
  const project=await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]);assert.equal(project.result,null);assert.deepEqual(project.importNames,['offset-source.svg']);assert.deepEqual(project.library.studio_import_names,['offset-source.svg']);assert.equal(project.projectExplicitName,true);assert.ok(project.name.trim());
  await page.reload({waitUntil:'networkidle'});await empty();await page.locator('[data-nav="projects"]').click();await page.locator(`[data-project-id="${project.id}"] [data-open-project]`).click();await imported(2);assert.deepEqual(await shapes(),bounds,'Saved source geometry reloads as preview without fabricated layout');
  report.checks.push('DataTransfer drop, relative SVG coordinates, safe DOM, quantity-independent preview, selection, both themes/all modes, filename metadata and saved-preview reload');
  await removeAll();await page.locator('#file-input').setInputFiles({name:'offset-source.dxf',mimeType:'application/dxf',buffer:Buffer.from(dxf)});await imported(1);
  const dxfBounds=(await shapes())[0];assert.ok(dxfBounds.width>0&&dxfBounds.height>0);near(dxfBounds,{x:15,y:-65,width:30,height:40});report.dxfBounds=dxfBounds;report.checks.push('Actual DXF engine import renders native Cartesian source geometry');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedAssets,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await page.screenshot({path:fileURLToPath(new URL('import-preview-failure.png',out)),fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await writeFile(new URL('import-preview-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}