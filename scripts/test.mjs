const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'test-results');await mkdir(out,{recursive:true});
const executable=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
if(!executable)throw new Error('Set CHROME_PATH to an installed Chromium browser.');
const port=Number(process.env.TEST_PORT||4176),url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[resolve(root,'scripts/serve.mjs')],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Test server exited '+code)));});
let browser;const report=[];
try{
  browser=await chromium.launch({executablePath:executable,headless:true});
  for(const size of (process.env.ENGINE_ONLY?[]:[{width:1440,height:1080},{width:1920,height:1200},{width:1024,height:900},{width:768,height:1024},{width:390,height:844},{width:375,height:812},{width:812,height:375}].filter(s=>!process.env.VIEWPORT||s.width===Number(process.env.VIEWPORT)))){
    console.log('Testing viewport',size);const context=await browser.newContext({viewport:size,reducedMotion:'reduce',colorScheme:'light'});const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(30000);const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)requests.push(r.status()+' '+r.url());});
    await page.goto(url,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('.nest-shape').count(),0,'Initial sheet is empty');
    assert.equal(await page.locator('.sheet-card').count(),0);assert.equal(await page.locator('#canvas-dropzone').isVisible(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`Overflow at ${size.width}`);
    await page.screenshot({path:resolve(out,`light-${size.width}x${size.height}.png`),fullPage:true});
    await page.locator('#theme-button').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.screenshot({path:resolve(out,`dark-${size.width}x${size.height}.png`),fullPage:true});
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','Theme is persisted');
    await page.locator('#view-outline').click();assert.equal(await page.locator('#view-outline').getAttribute('aria-pressed'),'true');
    await page.locator('#zoom-in').click();assert.equal(await page.locator('#zoom-reset').textContent(),'110%');
    await page.locator('#zoom-reset').click();assert.equal(await page.locator('#selection-bar').isVisible(),false);
    await page.locator('#parts-tab').click();assert.equal(await page.locator('.part-row').count(),0);assert.equal(await page.locator('#stat-total').textContent(),'0');
    await page.locator('#settings-tab').click();
    const card = await page.locator('#parameter-preset').boundingBox();
    const width = await page.locator('#sheet-width').boundingBox();
    const height = await page.locator('#sheet-height').boundingBox();
    const tabs = await page.locator('.settings-tabs').boundingBox();
    assert.ok(Math.abs(card.x-width.x)<1 && Math.abs(card.x+card.width-height.x-height.width)<1 && card.y>tabs.y+tabs.height+5,'The saved-parameters card aligns with the sheet fields and clears the tabs');
    for (const [id,value] of Object.entries({'sheet-width':'1200','sheet-height':'2400',spacing:'10',margin:'0',rotation:'15'})) assert.equal(await page.locator(`#${id}`).inputValue(),value);
    assert.equal(await page.locator('#time-unlimited').isChecked(),true);
    await page.locator('#material-presets').click();assert.equal(await page.locator('#app-dialog').isVisible(),true);await page.locator('[data-preset]').filter({hasText:'600 × 400'}).first().click();assert.equal(await page.locator('#sheet-width').inputValue(),'600');
    if(size.width<=820){await page.locator('#menu-button').scrollIntoViewIfNeeded();await page.locator('#menu-button').click();assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'),'true');await page.locator('#help-button').click();assert.equal(await page.locator('#app-dialog').isVisible(),true);await page.keyboard.press('Escape');await page.keyboard.press('Escape');}
    assert.deepEqual(errors,[],`Browser errors at ${size.width}`);assert.deepEqual(requests,[],`Failed assets at ${size.width}`);
    report.push({viewport:size,overflow,errors,requests,status:'passed'});await context.close();
  }
  if (!process.env.LAYOUT_ONLY) {
  console.log('Testing actual engine');const context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true,colorScheme:'light'});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#parts-tab').click();await page.locator('#file-input').setInputFiles({name:'test-bracket.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80"><path d="M0 0H100V30H40V80H0Z"/></svg>')});await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===1,{},{timeout:15000});
  await page.locator('#settings-tab').click();await page.locator('#advanced-parameters > summary').click();await page.locator('#time-unlimited').uncheck();await page.locator('#time-budget').fill('5');assert.equal(await page.locator('#time-output').inputValue(),'5');await page.locator('#run-button').click();await page.waitForFunction(()=>document.body.classList.contains('is-running'));await page.waitForFunction(()=>!document.body.classList.contains('is-running'),{},{timeout:60000});
  console.log('Engine result status:',await page.locator('#layout-status').textContent(),'Toast:',await page.locator('#toast-text').textContent());assert.match(await page.locator('#layout-status').textContent(),/проверен/,'Actual Nestbolt result validated');assert.equal(await page.locator('#stat-placed').textContent(),'1');assert.ok(await page.locator('.nest-shape').count()>0);assert.ok(Number(await page.locator('#stat-efficiency').textContent())>0);
  await page.locator('.nest-shape').first().press('Enter');assert.equal(await page.locator('#selection-bar').isVisible(),true);await page.locator('#clear-selection').click();
  await page.screenshot({path:resolve(out,'actual-nestbolt-result.png'),fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise;await download.saveAs(resolve(out,'actual-layout.svg'));
  await page.locator('#run-button').click();await page.waitForTimeout(500);await page.locator('#run-button').click();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-running')),false);
  await page.locator('#settings-tab').click();await page.locator('#time-budget').fill('3');await page.locator('#run-button').click();await page.waitForFunction(()=>!document.body.classList.contains('is-running'),{},{timeout:60000});assert.match(await page.locator('#layout-status').textContent(),/проверен/);assert.equal(await page.locator('#stat-placed').textContent(),'1');
  await page.locator('[data-nav="projects"]').click();assert.ok(await page.locator('.project-card').count()>0);await page.keyboard.press('Escape');
  await page.locator('#sheet-width').fill('');await page.locator('#run-button').click();assert.equal(await page.locator('#sheet-error').isVisible(),true);await page.locator('#sheet-width').fill('600');
  await page.locator('#time-unlimited').check();
  await page.locator('#run-button').click();
  await page.waitForFunction(()=>document.body.classList.contains('is-running')&&!document.querySelector('#optimization-progress').hasAttribute('value'));
  await page.waitForFunction(()=>!document.body.classList.contains('is-running'),null,{timeout:90000});
  const autoResult=await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]);
  assert.equal(autoResult.result.studio_stop_reason,'stagnation');
  assert.ok(autoResult.result.studio_elapsed>=15,'Stagnation is not a fixed total search budget');
  assert.equal(autoResult.result.validation.valid,true);
  assert.equal(autoResult.result.layout.placements.length,1);
  assert.equal(autoResult.request.spacing_mm,10);
  assert.equal(autoResult.request.edge_spacing_mm,0);
  assert.equal(autoResult.request.parts[0].rotations.degrees,15);
  assert.equal(await page.locator('#export-button').isEnabled(),true);
  assert.deepEqual(errors,[]);report.push({actualEngine:true,importSVG:true,nest:true,validation:true,exportSVG:true,cancellation:true,projects:true,inputValidation:true,automaticStop:true,errors,status:'passed'});
  await context.close();
  }
}finally{await browser?.close();server.kill();await writeFile(resolve(out,`report-${process.env.VIEWPORT||process.env.ENGINE_ONLY&&'engine'||'all'}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}