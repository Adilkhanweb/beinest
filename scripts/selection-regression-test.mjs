// Browser regression using actual SVG imports and Nestbolt WASM, never synthetic layouts.
// Run against an existing server (4175 by default), sequentially with other engine suites.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
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
const report={status:'running',fixtures:[],matrix:[],errors:[],failedAssets:[]};
const browser=await chromium.launch({headless:true,executablePath});
let page;

function fixture(withDoctype){
  const header=withDoctype?'<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n':'';
  const styles=withDoctype?'<style>.paper{fill:#ffffff;stroke:#222222} #blue{fill:#1234ef;stroke:#091a77}</style>':'';
  return header+`<svg xmlns="http://www.w3.org/2000/svg" width="130mm" height="50mm" viewBox="0 0 130 50">${styles}<path id="white" ${withDoctype?'class="paper"':'fill="#ffffff" stroke="#222222"'} d="M0 0H50V40H0Z"/><path id="blue" ${withDoctype?'':'fill="#1234ef" stroke="#091a77"'} d="M80 0H120V30H80Z"/></svg>`;
}
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true});}
async function selected(row,value){
  assert.equal(await row.locator('.part-select').isChecked(),value,'Checkbox agrees with selection');
  assert.equal(await row.evaluate(el=>el.classList.contains('is-selected')),value,'Card background class agrees');
  assert.equal(await row.locator('.part-main').getAttribute('aria-pressed'),String(value));
}
async function settings(){
  await page.locator('#settings-tab').click();
  if(!await page.locator('#advanced-parameters').evaluate(el=>el.open))await page.locator('#advanced-parameters > summary').click();
}
async function canvasSelected(id,value,count){
  const shapes=page.locator(`.nest-shape[data-part-id="${id}"]`);
  assert.equal(await shapes.count(),count);
  assert.deepEqual(await shapes.evaluateAll(els=>els.map(el=>({selected:el.classList.contains('selected'),pressed:el.getAttribute('aria-pressed')}))),Array.from({length:count},()=>({selected:value,pressed:String(value)})),'All copies highlight together');
}
async function quantityDoesNotSelect(row){
  const original=await row.locator('[data-quantity]').inputValue();
  for(const value of [false,true]){
    await row.locator('.part-select').setChecked(value);
    await row.locator('[data-part-plus]').click();await selected(row,value);
    await row.locator('[data-part-minus]').click();await selected(row,value);
    await row.locator('[data-quantity]').click();await selected(row,value);
    await row.locator('[data-quantity]').fill('3');await row.locator('[data-quantity]').dispatchEvent('change');await selected(row,value);
    await row.locator('[data-quantity]').fill(original);await row.locator('[data-quantity]').dispatchEvent('change');await selected(row,value);
    await row.locator('[data-quantity]').focus();await page.keyboard.press('ArrowUp');await selected(row,value);
    await row.locator('[data-quantity]').fill(original);await row.locator('[data-quantity]').dispatchEvent('change');
  }
  await row.locator('.part-select').uncheck();
}
async function rowInteractions(row){
  await row.locator('.part-select').uncheck();
  const normalBackground=await row.evaluate(el=>getComputedStyle(el).backgroundColor);
  for(const target of ['.part-preview','.part-info','.part-info small','.part-number']){
    await row.locator(target).click();await selected(row,true);
    assert.notEqual(await row.evaluate(el=>getComputedStyle(el).backgroundColor),normalBackground,'Selected background is visibly different');
    await row.locator(target).click();await selected(row,false);
  }
  // Padding belongs to the row, not the checkbox or quantity controls.
  await row.click({position:{x:3,y:3}});await selected(row,true);
  await row.click({position:{x:3,y:3}});await selected(row,false);
  await row.locator('.part-select-button').click();await selected(row,true);
  await row.locator('.part-select').click();await selected(row,false);
  for(const key of ['Enter','Space']){
    await row.locator('.part-main').focus();await page.keyboard.press(key);await selected(row,true);
    await page.keyboard.press(key);await selected(row,false);
  }
  await row.locator('.part-select').focus();await page.keyboard.press('Space');await selected(row,true);
  await page.keyboard.press('Space');await selected(row,false);
}
async function sidebarAndExport(width){
  const menu=page.locator('#menu-button'),sidebar=page.locator('#sidebar');
  assert.equal(await menu.isVisible(),true,'Menu remains available at every width');
  if(width>820){
    if(await sidebar.evaluate(el=>el.inert))await menu.click();
    assert.equal(await page.locator('#sidebar-close').isVisible(),true);
    await page.locator('#sidebar-close').click();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-collapsed')),true);
    assert.equal(await sidebar.evaluate(el=>el.inert),true);
    assert.equal(await menu.getAttribute('aria-expanded'),'false');
    assert.equal(await page.evaluate(()=>localStorage.getItem('beinest-sidebar-collapsed')),'true');
    await menu.click();assert.equal(await sidebar.evaluate(el=>el.inert),false);
    assert.equal(await menu.getAttribute('aria-expanded'),'true');
  }else{
    const preference=await page.evaluate(()=>localStorage.getItem('beinest-sidebar-collapsed'));
    assert.equal(await sidebar.evaluate(el=>el.inert),true);
    await menu.click();assert.equal(await sidebar.evaluate(el=>el.classList.contains('open')),true);
    assert.equal(await sidebar.evaluate(el=>el.inert),false);
    await page.locator('#sidebar-close').click();assert.equal(await sidebar.evaluate(el=>el.inert),true);
    await menu.click();await page.keyboard.press('Escape');assert.equal(await sidebar.evaluate(el=>el.inert),true);
    await menu.click();await page.locator('#sidebar-backdrop').click({position:{x:350,y:180}});
    assert.equal(await sidebar.evaluate(el=>el.inert),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('beinest-sidebar-collapsed')),preference,'Mobile drawer does not overwrite desktop preference');
  }
  const details=page.locator('#export-parameters'),summary=details.locator('summary'),panel=details.locator('.export-parameters-content');
  if(await details.evaluate(el=>el.open))await summary.click();
  assert.equal(await panel.isVisible(),false);
  await summary.click();assert.equal(await panel.isVisible(),true);
  const [button,trigger,content,controls]=await Promise.all([page.locator('#export-button').boundingBox(),summary.boundingBox(),panel.boundingBox(),page.locator('.export-controls').boundingBox()]);
  assert.ok(Math.abs(trigger.width-trigger.height)<1,'Export settings trigger is square');
  assert.ok(Math.abs(button.y-trigger.y)<1&&Math.abs(button.height-trigger.height)<1,'Export and settings share one row');
  assert.ok(trigger.x>=button.x+button.width,'Settings are to the right of export');
  assert.ok(content.y>=button.y+button.height,'Disclosure panel is below controls');
  assert.ok(Math.abs(content.x-controls.x)<1&&Math.abs(content.width-controls.width)<1,'Disclosure spans full controls width');
  assert.ok((await summary.getAttribute('aria-label'))?.trim(),'Icon-only summary has accessible name');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow');
  await summary.focus();await page.keyboard.press('Space');assert.equal(await panel.isVisible(),false);
  await page.keyboard.press('Enter');assert.equal(await panel.isVisible(),true);
  return {button,trigger,content};
}

try{
  // Persistence is checked on a clean context before importing; reload must not require fixtures.
  const persistence=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page=await persistence.newPage();await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#sidebar-close').click();await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.inert),true);
  assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'),'false');
  await page.locator('#menu-button').click();await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.inert),false);
  report.desktopSidebarPersistence=true;await persistence.close();

  for(const withDoctype of [false,true]){
    const name=withDoctype?'doctype-css':'plain-attributes';
    console.log('Actual import and WASM:',name);
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',colorScheme:'light',acceptDownloads:true});
    page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>report.errors.push(`${name}: ${error.message}`));
    page.on('response',response=>{if(response.status()>=400)report.failedAssets.push(`${response.status()} ${response.url()}`);});
    await page.goto(base,{waitUntil:'networkidle'});await page.locator('#parts-tab').click();
    await page.locator('#file-input').setInputFiles({name:name+'.svg',mimeType:'image/svg+xml',buffer:Buffer.from(fixture(withDoctype))});
    await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===2,null,{timeout:90000});
    const rows=page.locator('.part-row'),white=rows.filter({has:page.locator('.part-preview path[fill="#ffffff"]')}),blue=rows.filter({has:page.locator('.part-preview path[fill="#1234ef"]')});
    assert.equal(await white.count(),1,'Imported white remains an opaque white fill, not none');
    assert.equal(await blue.count(),1,'Imported CSS/attribute blue maps to correct part');
    const whiteId=await white.getAttribute('data-part-id'),blueId=await blue.getAttribute('data-part-id');
    const numbers=await rows.evaluateAll(els=>Object.fromEntries(els.map(el=>[el.dataset.partId,el.querySelector('.part-number').textContent])));
    assert.deepEqual(Object.values(numbers),['01','02'],'Library numbers are explicit type indices');
    await rowInteractions(white);await quantityDoesNotSelect(white);
    await white.locator('[data-quantity]').fill('2');await white.locator('[data-quantity]').dispatchEvent('change');
    await blue.locator('[data-quantity]').fill('1');await blue.locator('[data-quantity]').dispatchEvent('change');
    await white.locator('.part-main').click();
    await settings();await page.locator('#sheet-width').fill('200');await page.locator('#sheet-height').fill('150');await page.locator('#time-unlimited').uncheck();await page.locator('#time-output').fill('3');
    await page.locator('#run-button').click();await page.waitForFunction(()=>document.body.classList.contains('is-running'));
    assert.equal(await white.locator('.part-select').isDisabled(),true);
    assert.equal(await white.locator('.part-main').isDisabled(),true);
    assert.equal(await white.locator('[data-quantity]').isDisabled(),true);
    await page.locator('#parts-tab').click();await white.click({position:{x:3,y:3}});await selected(white,true);
    await page.waitForFunction(()=>!document.body.classList.contains('is-running'),null,{timeout:90000});
    assert.match(await page.locator('#layout-status').textContent(),/проверен/,await page.locator('#toast-text').textContent());
    assert.equal(await page.locator('#stat-placed').textContent(),'3');
    assert.equal(await white.locator('.part-select').isDisabled(),false,'Checkbox enabled again after run');
    await canvasSelected(whiteId,true,2);await canvasSelected(blueId,false,1);
    const shapes=await page.locator('.nest-shape').evaluateAll(els=>els.map(el=>({id:el.dataset.partId,number:el.dataset.partNumber,fill:el.getAttribute('fill'),opacity:getComputedStyle(el).fillOpacity,computedFill:getComputedStyle(el).fill})));
    for(const shape of shapes){assert.equal(shape.number,numbers[shape.id],'Copies use stable library type numbers');assert.equal(shape.fill,shape.id===whiteId?'#ffffff':'#1234ef');assert.equal(shape.opacity,'1');}
    assert.deepEqual(await page.locator('.shape-label').allTextContents(),shapes.map(shape=>shape.number),'Rendered labels match type numbers, not copy indices');
    await white.locator('.part-select').uncheck();await canvasSelected(whiteId,false,2);
    const whiteShapes=page.locator(`.nest-shape[data-part-id="${whiteId}"]`);
    // Use actual pointer clicks on the SVG path, avoiding its centered label overlay.
    async function clickShape(locator){const point=await locator.evaluate(el=>{const b=el.getBBox(),m=el.getScreenCTM(),p=new DOMPoint(b.x+b.width*.2,b.y+b.height*.2).matrixTransform(m);return {x:p.x,y:p.y};});await page.mouse.click(point.x,point.y);}
    await page.locator('#settings-tab').click();await whiteShapes.first().scrollIntoViewIfNeeded();await clickShape(whiteShapes.first());
    assert.equal(await page.locator('#settings-tab').getAttribute('aria-selected'),'true','Canvas selection does not force the Parts tab');
    await selected(white,true);await canvasSelected(whiteId,true,2);
    await clickShape(whiteShapes.nth(1));await selected(white,true);await canvasSelected(whiteId,true,2);
    await clickShape(whiteShapes.nth(1));await selected(white,false);await canvasSelected(whiteId,false,2);
    await whiteShapes.first().focus();await page.keyboard.press('Enter');await selected(white,true);await canvasSelected(whiteId,true,2);
    await page.keyboard.press('Space');await selected(white,false);await canvasSelected(whiteId,false,2);
    await page.locator('#parts-tab').click();await white.locator('.part-main').click();await canvasSelected(whiteId,true,2);
    await white.locator('.part-select').uncheck();await canvasSelected(whiteId,false,2);
    await page.locator('#select-all-parts').check();await selected(white,true);await selected(blue,true);await canvasSelected(whiteId,true,2);await canvasSelected(blueId,true,1);
    await blue.locator('.part-select').uncheck();assert.equal(await page.locator('#select-all-parts').evaluate(el=>el.indeterminate),true);
    await page.locator('#select-all-parts').check();await page.locator('#select-all-parts').uncheck();

    if(!withDoctype){
      for(const width of [1440,375])for(const language of ['ru','en','kk'])for(const theme of ['light','dark']){
        await page.setViewportSize({width,height:width===375?812:1000});
        await page.locator('#language-select').selectOption(language);
        if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme-button').click();
        const geometry=await sidebarAndExport(width);
        await page.locator('#parts-tab').click();await rowInteractions(white);
        await white.locator('.part-select').check();await canvasSelected(whiteId,true,2);
        assert.equal(await white.locator('.part-preview path').getAttribute('fill'),'#ffffff');
        assert.equal(await white.locator('.part-preview path').evaluate(el=>getComputedStyle(el).fillOpacity),'1');
        assert.deepEqual(await rows.locator('.part-number').allTextContents(),['01','02']);
        await screenshot(`selection-${width}-${language}-${theme}`);
        await white.locator('.part-select').uncheck();
        report.matrix.push({width,language,theme,geometry,status:'passed'});
      }
    }
    await page.setViewportSize({width:1440,height:1000});await page.locator('#parts-tab').click();
    await white.locator('.part-select').check();await page.locator('#delete-selected-parts').click();
    assert.equal(await rows.count(),1);assert.equal(await rows.first().getAttribute('data-part-id'),blueId);
    assert.equal(await page.locator('.sheet-card').count(),0,'Deletion invalidates prior optimized layout');assert.equal(await page.locator('.import-preview-svg .nest-shape').count(),1,'Surviving source part remains available in preview');assert.equal(await page.locator('#export-button').isDisabled(),true);
    await page.locator('#select-all-parts').check();await page.locator('#delete-selected-parts').click();
    assert.equal(await rows.count(),0);assert.equal(await page.locator('#canvas-dropzone').isVisible(),true);assert.equal(await page.locator('#select-all-parts').isDisabled(),true);assert.equal(await page.locator('#delete-selected-parts').isDisabled(),true);
    report.fixtures.push({name,actualImport:true,actualWasm:true,placed:3,stableTypeNumbers:numbers,shapes,selectionAndQuantity:true,canvasSync:true,delete:true,status:'passed'});
    await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedAssets,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await screenshot('selection-regression-failure').catch(()=>{});throw error;}
finally{await browser.close();await writeFile(new URL('selection-regression-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}