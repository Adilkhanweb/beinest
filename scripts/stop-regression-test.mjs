// Serial real-WASM regression. Instrumentation observes/delegates engine methods;
// it never supplies optimizer results, fabricated progress or validation reports.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath,'Set CHROME_PATH');
const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
const report={status:'running',errors:[],runs:[]};
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>report.errors.push(e.message));
const base=process.env.TEST_URL||`http://127.0.0.1:${process.env.TEST_PORT||4175}`;
const settled=()=>page.waitForFunction(()=>!document.body.classList.contains('is-running')&&!document.body.classList.contains('is-stopping'),null,{timeout:90000});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects')||'[]')[0]||null);
const ui=()=>page.evaluate(()=>({paths:[...document.querySelectorAll('.nest-shape')].map(e=>e.getAttribute('d')),time:document.querySelector('#stat-time').textContent,iterations:document.querySelector('#stat-iterations').textContent,end:document.querySelector('#chart-end').textContent,chart:document.querySelector('#progress-chart').innerHTML,placed:document.querySelector('#stat-placed').textContent}));
async function startImmediateStop(){
  // Two synchronous DOM activations: the actual search worker cannot deliver a
  // callback in between. This exercises cancellation, not a fake empty result.
  const sample=await page.evaluate(async()=>{const b=document.querySelector('#run-button');b.click();await Promise.resolve();await Promise.resolve();const run=window.stopProbe.runs.at(-1);b.click();return {callbacks:run.events.length,running:document.body.classList.contains('is-running')};});
  assert.equal(sample.callbacks,0);await settled();return sample;
}
async function liveStop(quantity){
  await page.locator('#parts-tab').click();await page.locator('[data-quantity]').fill(String(quantity));await page.locator('[data-quantity]').dispatchEvent('change');
  await page.locator('#settings-tab').click();await page.locator('#run-button').click();
  await page.waitForFunction(()=>window.stopProbe.runs.at(-1)?.events.some(e=>e.layout?.placements?.length),null,{timeout:90000});
  const captured=await page.evaluate(()=>{const p=window.stopProbe,r=p.runs.at(-1),e=r.events.at(-1);const snapshot={layout:structuredClone(e.layout),iteration:r.events.length,request:r.request,before:performance.now(),start:r.start};document.querySelector('#run-button').click();snapshot.after=performance.now();snapshot.stopping=document.body.classList.contains('is-stopping');snapshot.disabled=document.querySelector('#run-button').disabled;return snapshot;});
  assert.equal(captured.stopping,true,'Stop awaits the independently delegated validator');assert.equal(captured.disabled,true,'Run cannot restart while stop validation is pending');
  await settled();const project=await saved();assert.ok(project?.id,'Stopped result is auto-saved without manual save');
  assert.deepEqual(project.result.layout,captured.layout,'Commit exactly the latest actual worker-delivered layout');
  assert.deepEqual(project.request,captured.request,'Validation and commit use this run request');
  assert.equal(project.result.validation.valid,true);assert.equal(project.result.studio_stopped,true);
  assert.equal(project.result.studio_iterations,captured.iteration);assert.equal(project.result.layout.placements.length,quantity);
  assert.ok(project.result.studio_elapsed>0&&project.result.studio_elapsed<30,'Elapsed stops early, not at requested budget');
  const elapsed=project.result.studio_elapsed;assert.equal(project.result.seconds,elapsed);assert.equal(project.chartSeconds,elapsed);
  assert.ok(Math.abs(elapsed-(captured.before-captured.start)/1000)<0.5,'Elapsed is captured at stop, excluding the artificial validator delay');
  const validations=await page.evaluate(()=>window.stopProbe.validations);assert.ok(validations.some(v=>v.valid&&JSON.stringify(v.layout)===JSON.stringify(captured.layout)&&JSON.stringify(v.request)===JSON.stringify(captured.request)),'Application independently validates the actual candidate against the active request');
  assert.ok(project.history.at(-1).t===elapsed,'Chart history ends at stop time');
  const view=await ui();assert.equal(Number(view.iterations),captured.iteration);assert.equal(Number(view.placed),quantity);
  const {formatDuration}=await import('../i18n.js');assert.equal(view.end,formatDuration(elapsed),'Chart label uses actual elapsed stop seconds');assert.notEqual(view.end,'0:30');
  assert.equal(await page.locator('#export-button').isDisabled(),false);
  const independent=await page.evaluate(async p=>{const {NestEngine}=await import('./engine.js');const e=new NestEngine();try{return await e.validate(p.library,p.request,p.result.layout);}finally{e.dispose();}},project);
  assert.equal(independent.valid,true,'New utility worker independently validates persisted stop result');
  const event=page.waitForEvent('download');await page.locator('#export-button').click();const download=await event;assert.equal(await download.failure(),null);assert.match(download.suggestedFilename(),/\.svg$/);const target=new URL(`stop-quantity-${quantity}.svg`,out);await download.saveAs(fileURLToPath(target));const svg=await readFile(target,'utf8');assert.match(svg,/<svg[\s>]/);assert.match(svg,/<(path|polygon)/);
  // Replay ONLY an actual captured callback through the original application
  // callback, to deterministically prove run-token protection after termination.
  await page.evaluate(()=>{const r=window.stopProbe.runs.at(-1);r.callback(r.events.at(-1));});
  await page.waitForTimeout(700);assert.deepEqual(await ui(),view,'Late real progress cannot change committed geometry, metrics or chart');assert.deepEqual(await saved(),project,'Late events cannot overwrite the auto-save');
  report.runs.push({quantity,iterations:captured.iteration,elapsed,chartEnd:view.end,validated:true,exactLatestGeometry:true,export:download.suggestedFilename(),lateEventIgnored:true});
  return {project,view};
}
try{
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    const {NestEngine}=await import('./engine.js'),proto=NestEngine.prototype,run=proto.run,validate=proto.validate;
    window.stopProbe={runs:[],validations:[],delay:800};
    proto.run=function(library,request,options){const r={request:structuredClone(request),events:[],start:performance.now(),callback:options.onProgress};window.stopProbe.runs.push(r);return run.call(this,library,request,{...options,onProgress:e=>{if(e.layout?.placements?.length)r.events.push(structuredClone(e));options.onProgress?.(e);}});};
    proto.validate=async function(library,request,layout){const p=window.stopProbe,v={request:structuredClone(request),layout:structuredClone(layout)};p.validations.push(v);const result=await validate.call(this,library,request,layout);v.valid=result.valid;if(p.delay)await new Promise(resolve=>setTimeout(resolve,p.delay));return result;};
  });
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="40mm" viewBox="0 0 50 40"><path fill="#fff" d="M0 0H50V40H0Z"/></svg>';
  await page.locator('#parts-tab').click();await page.locator('#file-input').setInputFiles({name:'stop-white.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===1);
  await page.locator('#settings-tab').click();await page.locator('#advanced-parameters').evaluate(e=>e.open=true);await page.locator('#time-unlimited').uncheck();await page.locator('#time-output').fill('30');
  report.coldImmediate=await startImmediateStop();assert.equal(await page.locator('.sheet-card').count(),0);assert.equal(await page.locator('.import-preview-svg .nest-shape').count(),1,'No optimizer callback preserves genuine source preview');assert.equal(await page.locator('#export-button').isDisabled(),true);assert.equal((await saved())?.result??null,null);
  const first=await liveStop(2);report.firstEverLiveStop=true;
  report.warmImmediate=await startImmediateStop();assert.deepEqual(await ui(),first.view,'No callback keeps previous committed result');assert.deepEqual(await saved(),first.project,'No callback does not overwrite previous auto-save');
  const second=await liveStop(3);assert.notDeepEqual(second.project.request,first.project.request,'Recalculation uses changed quantity');report.changedQuantityRequest=true;
  await page.reload({waitUntil:'networkidle'});await page.locator('[data-nav="projects"]').click();await page.locator('[data-open-project]').first().click();assert.deepEqual(await ui(),second.view,'Stopped geometry, chart, elapsed and iterations survive reopening');assert.equal(await page.locator('#export-button').isDisabled(),false);report.persistence=true;
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await page.screenshot({path:fileURLToPath(new URL('stop-regression-failure.png',out)),fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await writeFile(new URL('stop-regression-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}