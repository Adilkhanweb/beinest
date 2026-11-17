// Integration regression: UI fixtures are explicitly separated from real WASM work.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath,'Set CHROME_PATH to an installed Chromium browser');
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce',colorScheme:'light'});
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],failedAssets=[],results={};
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)failedAssets.push(`${response.status()} ${response.url()}`);});
const base=process.env.TEST_URL||`http://127.0.0.1:${process.env.TEST_PORT||4175}`;
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160mm" height="100mm" viewBox="0 0 160 100"><style>.blue{fill:#1234ef;stroke:#091a77}</style><path id="bracket" fill="#ef2030" d="M0 0H100V30H40V80H0Z"/><path id="square" class="blue" d="M110 0H150V40H110Z"/></svg>';
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true});}
async function settings(){await page.locator('#settings-tab').click();if(!await page.locator('#advanced-parameters').evaluate(el=>el.open))await page.locator('#advanced-parameters > summary').click();}
async function importFixture(){await page.locator('#parts-tab').click();await page.locator('#file-input').setInputFiles({name:'colors.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===2);}
async function chart(){return page.evaluate(()=>({svg:document.querySelector('#progress-chart').innerHTML,middle:document.querySelector('#chart-middle').textContent,end:document.querySelector('#chart-end').textContent}));}
async function layout(){return page.evaluate(()=>({viewBox:document.querySelector('#nesting-svg').getAttribute('viewBox'),paths:[...document.querySelectorAll('.nest-shape')].map(el=>el.getAttribute('d')),size:document.querySelector('#stat-size').textContent}));}
async function completed(){await page.waitForFunction(()=>!document.body.classList.contains('is-running')&&!document.body.classList.contains('is-stopping'),null,{timeout:90000});assert.match(await page.locator('#layout-status').textContent(),/проверен/,await page.locator('#toast-text').textContent());}
try{
  await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.title(),'beinest — раскрой в браузере');
  assert.equal(await page.locator('.nest-shape').count(),0);assert.equal(await page.locator('.part-row').count(),0);assert.equal(await page.locator('.sheet-card').count(),0);assert.equal(await page.locator('#canvas-dropzone').isVisible(),true);
  assert.equal(await page.locator('#stat-placed').textContent(),'0');assert.equal(await page.locator('#stat-total').textContent(),'0');assert.equal(await page.locator('#export-button').isDisabled(),true);
  assert.equal(await page.locator('.page-heading,.hero,.local-card,.sidebar-user,#material').count(),0,'No removed hero, profile or material selector');
  await page.locator('#sheet-width').fill('180');await page.locator('#sheet-height').fill('600');await page.locator('#sheet-height').dispatchEvent('change');
  assert.equal(await page.locator('#nesting-svg').count(),0);assert.equal(await page.locator('#canvas-dropzone').isVisible(),true);assert.match(await page.locator('#stat-size').textContent(),/180 × 600/);
  results.emptySheetAndResize=true;

  const extras=['time-budget','time-output','sheet-count','nest-mode','edge-unlinked','edge-spacing','allow-mirror','common-line-enabled','common-line-kerf','common-line-search-bonus','lead-in-enabled','lead-in-kerf','lead-in-length','lead-in-style','lead-in-outer-angle','lead-in-hole-angle','run-seed','run-repeatable','quick-start','import-tolerance','import-close-gaps','import-gap-limit','import-dxf-unit'];
  assert.equal(await page.locator('#advanced-parameters').evaluate(el=>el.open),false);
  for(const id of extras){assert.equal(await page.locator('#'+id).evaluate(el=>!!el.closest('#advanced-parameters')),true,id+' belongs in advanced');assert.equal(await page.locator('#'+id).isVisible(),false,id+' initially collapsed');}
  for(const id of ['sheet-width','sheet-height','spacing','margin','rotation','allow-holes'])assert.equal(await page.locator('#'+id).evaluate(el=>!!el.closest('#advanced-parameters')),false,id+' is an everyday control');
  for(const id of ['parameter-preset','material-presets','save-parameter-preset'])assert.equal(await page.locator('#'+id).evaluate(el=>!!el.closest('#settings-content')&&!el.closest('#advanced-parameters')),true,id+' is at the top level, outside advanced');
  assert.equal(await page.locator('#parameter-preset').evaluate(el=>el.tagName),'SECTION');assert.equal(await page.locator('#apply-parameter-preset,#delete-parameter-preset').count(),0,'Single manager replaces the legacy select/action cluster');
  await settings();const emptyChart=await chart();
  await page.locator('#time-output').fill('300');assert.equal(await page.locator('#time-budget').inputValue(),'300');
  await page.locator('#time-budget').fill('1');assert.equal(await page.locator('#time-output').inputValue(),'1');
  await page.locator('#time-budget').fill('67');assert.equal(await page.locator('#time-output').inputValue(),'67');
  await page.locator('#time-output').fill('301');assert.equal(await page.locator('#time-output').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#time-budget').inputValue(),'67');
  await page.locator('#time-output').fill('6');assert.equal(await page.locator('#time-budget').inputValue(),'6');assert.deepEqual(await chart(),emptyChart);
  results.advancedAndTimeSync=true;

  // Audit all UI text, including normally collapsed extras, but not language names.
  await page.locator('#advanced-parameters details').evaluateAll(els=>els.forEach(el=>el.open=true));
  for(const locale of ['en','kk','ru']){
    await page.locator('#language-select').selectOption(locale);await page.waitForFunction(lang=>document.documentElement.lang===lang,locale);
    assert.equal(await page.locator('#language-select').inputValue(),locale);
    if(locale==='en'){
      const untranslated=await page.evaluate(()=>{const found=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode,p=n.parentElement;if(p.closest('script,style,noscript,#language-select,[data-i18n-ignore],[translate="no"]'))continue;if(/[\u0400-\u04ff]/.test(n.textContent))found.push(n.textContent.trim());}return found.filter(Boolean);});
      assert.deepEqual(untranslated,[],'English UI has no Cyrillic beyond user filenames/language names');
    }
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('lang'),locale,'Locale persists');
    await settings();await page.locator('#advanced-parameters details').evaluateAll(els=>els.forEach(el=>el.open=true));
  }
  results.ruEnKkAndPersistence=true;

  await importFixture();assert.equal(await page.locator('#select-all-parts').isDisabled(),false);await page.locator('#select-all-parts').check();assert.equal(await page.locator('.part-select:checked').count(),2);
  await page.locator('.part-select').first().uncheck();assert.equal(await page.locator('#select-all-parts').evaluate(el=>el.indeterminate),true);
  await page.locator('#select-all-parts').check();await page.locator('#delete-selected-parts').click();assert.equal(await page.locator('.part-row').count(),0);assert.equal(await page.locator('.nest-shape').count(),0);assert.equal(await page.locator('.sheet-card').count(),0);assert.equal(await page.locator('#canvas-dropzone').isVisible(),true);assert.equal(await page.locator('#stat-total').textContent(),'0');assert.equal(await page.locator('#select-all-parts').isDisabled(),true);results.importSelectAllDelete=true;

  await importFixture();await page.locator('[data-quantity]').evaluateAll(els=>els.forEach(el=>{el.value='6';el.dispatchEvent(new Event('change',{bubbles:true}));}));
  await settings();await page.locator('#sheet-width').fill('600');await page.locator('#sheet-height').fill('400');await page.locator('#time-budget').fill('6');
  // Observe actual gallery DOM replacements during running, not a mocked callback
  // or the pre-existing committed layout. Worker snapshots can arrive slowly.
  await page.evaluate(()=>{window.liveSnapshots=[];window.liveObserver=new MutationObserver(()=>{if(document.body.classList.contains('is-running')&&document.querySelector('.nest-shape'))window.liveSnapshots.push({at:performance.now(),count:document.querySelectorAll('.nest-shape').length,status:document.querySelector('#layout-status').textContent});});window.liveObserver.observe(document.querySelector('#sheets-gallery'),{childList:true});});
  await page.locator('#run-button').click();await page.waitForFunction(()=>document.body.classList.contains('is-running'));
  await page.waitForFunction(()=>window.liveSnapshots.length>0,null,{timeout:90000});
  assert.equal(await page.locator('#selection-bar').isVisible(),false,'Live layout has no stale selection');await screenshot('beinest-real-progress');await completed();
  const liveSnapshots=await page.evaluate(()=>{window.liveObserver.disconnect();return window.liveSnapshots;});assert.ok(liveSnapshots.length>0);assert.match(liveSnapshots[0].status,/итерация [1-9]/);
  assert.equal(await page.locator('#stat-placed').textContent(),'12');assert.equal(await page.locator('.nest-shape').count(),12);assert.ok(Number(await page.locator('#stat-efficiency').textContent())>0);results.realWasmProgress={snapshots:liveSnapshots};

  const original=await page.locator('.nest-shape').evaluateAll(els=>els.map(el=>el.getAttribute('fill')));assert.ok(original.includes('#ef2030'));assert.ok(original.includes('#1234ef'));
  for(const theme of ['light','dark']){
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme-button').click();
    for(const mode of ['view-layout','view-outline','view-color']){
      await page.locator('#'+mode).click();
      const paints=await page.locator('.sheet-base').evaluateAll(els=>els.map(el=>({fill:getComputedStyle(el).fill,opacity:getComputedStyle(el).fillOpacity})));
      assert.ok(paints.every(p=>p.fill==='none'||p.fill==='transparent'||/rgba\([^)]*,\s*0\)/.test(p.fill)||p.opacity==='0'),JSON.stringify(paints));
      assert.equal(await page.locator('.nesting-svg').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
      if(mode==='view-layout')assert.deepEqual(await page.locator('.nest-shape').evaluateAll(els=>els.map(el=>el.getAttribute('fill'))),original);
      if(mode==='view-outline')assert.equal(await page.locator('.nest-shape').first().getAttribute('fill'),'none');
    }
    await screenshot('beinest-'+theme);
  }
  await page.locator('#view-layout').click();assert.equal(await page.locator('#toggle-labels').isVisible(),true);assert.equal(await page.locator('.shape-label').count(),12);await page.locator('#toggle-labels').click();assert.equal(await page.locator('.shape-label').count(),0);await page.locator('#toggle-labels').click();assert.equal(await page.locator('.shape-label').count(),12);
  // Keyboard activation is deterministic for concave shapes whose bbox center
  // may be empty or occupied by a different nested part.
  await page.locator('.nest-shape').first().press('Enter');assert.equal(await page.locator('#selection-bar').isVisible(),true);await page.locator('#clear-selection').click();results.transparentBothThemesAndLabels=true;

  const committedChart=await chart();await page.locator('#time-budget').fill('300');assert.deepEqual(await chart(),committedChart);assert.equal(committedChart.end,'0:06');await page.locator('#time-budget').fill('6');results.completedChartStable=true;
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise;const exported=new URL('beinest-actual-layout.svg',out);await download.saveAs(fileURLToPath(exported));const text=await readFile(exported,'utf8');assert.match(text,/<svg[\s>]/);assert.match(text,/(path|polygon)/);assert.match(text,/(mm|viewBox)/);results.actualSvgExport=true;

  await page.locator('#time-budget').fill('20');await page.locator('.nest-shape').first().press('Enter');
  await page.evaluate(()=>{window.cancelSnapshots=0;window.cancelObserver=new MutationObserver(()=>{if(document.body.classList.contains('is-running')&&document.querySelector('.nest-shape'))window.cancelSnapshots++;});window.cancelObserver.observe(document.querySelector('#sheets-gallery'),{childList:true});});
  await page.locator('#run-button').click();await page.waitForFunction(()=>document.body.classList.contains('is-running'));assert.equal(await page.locator('#selection-bar').isVisible(),false);await page.waitForFunction(()=>window.cancelSnapshots>0,null,{timeout:60000});
  const snapshot=await page.evaluate(()=>{const get=()=>({viewBox:document.querySelector('#nesting-svg').getAttribute('viewBox'),paths:[...document.querySelectorAll('.nest-shape')].map(el=>el.getAttribute('d')),size:document.querySelector('#stat-size').textContent});const value={layout:get(),iteration:Number(document.querySelector('#stat-iterations').textContent)};document.querySelector('#run-button').click();return value;});
  await completed();assert.deepEqual(await layout(),snapshot.layout,'Stop commits the latest live geometry exactly');const stopped=await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]);assert.equal(stopped.result.studio_stopped,true);assert.equal(stopped.result.validation.valid,true);assert.equal(stopped.result.studio_iterations,snapshot.iteration);assert.ok(stopped.result.studio_elapsed>0&&stopped.result.studio_elapsed<20);assert.equal(stopped.chartSeconds,stopped.result.studio_elapsed);const stoppedChart=await chart();await page.waitForTimeout(700);assert.deepEqual(await layout(),snapshot.layout,'Late worker messages cannot replace stopped geometry');assert.deepEqual(await chart(),stoppedChart,'Late worker messages cannot change stopped chart');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]),stopped);await page.evaluate(()=>window.cancelObserver.disconnect());results.stopCommitsLatestCandidate=true;

  // Seven-sheet fixture tests rendering only. Its geometry starts from a real,
  // validated, persisted run; it is not evidence of a seven-sheet engine search.
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('nestbolt-projects'))[0],first=p.result.layout.sheets[0],placements=p.result.layout.placements;p.result.layout.sheets=Array.from({length:7},(_,i)=>({...first,id:'ui-fixture-'+i}));p.result.layout.placements=p.result.layout.sheets.flatMap(s=>placements.map(placement=>({...placement,sheet_id:s.id})));p.id=p.name='Seven-sheet UI fixture';localStorage.setItem('nestbolt-projects',JSON.stringify([p]));});
  await page.locator('[data-nav="projects"]').click();await page.locator('[data-open-project]').first().click();assert.equal(await page.locator('.sheet-card').count(),7);assert.equal(await page.locator('.sheet-tab').count(),0);
  await page.locator('#layout-row').click();await page.locator('#canvas-stage').scrollIntoViewIfNeeded();
  const row=await page.locator('.sheet-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
  assert.ok(row.every(r=>Math.abs(r.x-row[0].x)<2),'Row layout is a vertical stack');assert.ok(row[1].y>=row[0].y+row[0].height-2);
  assert.ok(await page.locator('#sheets-gallery').evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollWidth<=el.clientWidth+1),'Vertical internal scrolling only');
  const normal=await page.locator('#canvas-stage').boundingBox();assert.ok(normal.height<=480);const documentHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
  const unzoomed=await page.locator('.sheet-card').first().boundingBox();await page.locator('#zoom-in').click();const zoomed=await page.locator('.sheet-card').first().boundingBox();assert.ok(zoomed.height>unzoomed.height||zoomed.width>unzoomed.width);await page.locator('#zoom-reset').click();
  await page.locator('#layout-grid').click();const columns=await page.locator('.sheet-card').evaluateAll(els=>new Set(els.map(el=>Math.round(el.getBoundingClientRect().x))).size);assert.ok(columns>1,'Grid has multiple columns on desktop');assert.ok(Math.abs(await page.evaluate(()=>document.documentElement.scrollHeight)-documentHeight)<100);await page.locator('.sheet-card-heading').nth(3).click();assert.match(await page.locator('#sheets-summary').textContent(),/04/);await screenshot('beinest-multisheet-grid');results.multisheetVerticalRowGridZoom=true;

  await page.locator('#fullscreen-button').click();await page.waitForFunction(()=>!!document.fullscreenElement);const full=await page.locator('#canvas-stage').boundingBox();const viewport=await page.evaluate(()=>innerHeight);assert.ok(full.height>normal.height+150,JSON.stringify({normal,full}));assert.ok(full.y+full.height>viewport-100,'Fullscreen stage extends near screen bottom');await screenshot('beinest-fullscreen');await page.evaluate(()=>document.exitFullscreen());results.fullscreenExpandsToBottom=true;
  for(const viewport of [{width:375,height:812},{width:812,height:375}]){await page.setViewportSize(viewport);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');assert.ok((await page.locator('#canvas-stage').boundingBox()).height<=480);await screenshot(`beinest-mobile-${viewport.width}`);}results.mobileNoOverflow=true;
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);results.status='passed';
}catch(error){results.status='failed';results.failure=error.stack;await screenshot('beinest-failure').catch(()=>{});throw error;
}finally{results.errors=errors;results.failedAssets=failedAssets;await browser.close();await writeFile(new URL('beinest-report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}