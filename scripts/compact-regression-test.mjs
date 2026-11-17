import assert from 'node:assert/strict';
// Import-only compact UI regression: no optimizer runs or synthetic layouts.
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath,'Set CHROME_PATH to an installed Chromium browser');
const base=process.env.TEST_URL||('http://127.0.0.1:'+(process.env.TEST_PORT||process.env.PORT||4175));
const root=fileURLToPath(new URL('../test-results/compact-v4/',import.meta.url));
await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={matrix:[],errors};
try {
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('#parts-tab').click();
 const dims=[[45,30],[85,42],[120,80],[225,160],[10000,9999]],fills=['#ffffff','#1234ef','#eb3677','#f2a125','#20aa85'];
 await page.locator('#file-input').setInputFiles(dims.map(([w,h],i)=>({name:`compact-original-artwork-${i+1}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><path id="shape${i+1}" d="M0 0H${w}V${h}H0Z" fill="${fills[i]}" stroke="${i===0?'none':'#223344'}" opacity="${i===2?'.55':'1'}"/></svg>`)})));
 await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===5,{timeout:60000});
 assert.equal(await page.locator('.parts-intro').count(),0);
 assert.equal(await page.locator('.part-info strong,.part-select-caption').count(),0);
 for(const width of [320,375,1024,1440])for(const theme of ['light','dark'])for(const mode of ['original','outline','color']){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.locator(mode==='original'?'#view-layout':mode==='outline'?'#view-outline':'#view-color').click();
  await page.waitForTimeout(100);
  const rows=await page.locator('.part-row').evaluateAll(els=>els.map(row=>{
   const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,cy:b.y+b.height/2,right:b.right,bottom:b.bottom}};
   const selectors=['.part-number','.part-preview','.part-info','.part-select','.quantity-control'];
   const path=row.querySelector('.part-preview path');
   return {tooltip:row.querySelector('.part-main').getAttribute('title'),id:row.dataset.partId,number:row.querySelector('.part-number').textContent,row:rect(row),items:selectors.map(s=>({selector:s,...rect(row.querySelector(s))})),dims:row.querySelector('.part-info').textContent,fill:path.getAttribute('fill'),stroke:path.getAttribute('stroke'),opacity:path.getAttribute('fill-opacity'),checker:getComputedStyle(row.querySelector('.part-preview')).backgroundColor,accessibleName:row.querySelector('.part-select').getAttribute('aria-label')};
  }));
  for(const [i,row]of rows.entries()){
   assert.equal(row.number,String(i+1).padStart(2,'0'));
   for(const item of row.items){assert.ok(Math.abs(item.cy-row.row.cy)<=1,`Center alignment ${width}/${theme}/${mode} row ${i+1}: ${item.selector}, ${item.cy-row.row.cy}`);assert.ok(item.x>=row.row.x&&item.right<=row.row.right+1,`Fits row ${width}: ${item.selector}`);}
   for(let j=1;j<row.items.length;j++)assert.ok(row.items[j].x>=row.items[j-1].right-1,`No overlap ${width} ${row.items[j].selector}`);
   assert.ok(row.accessibleName?.includes('compact-original-artwork-'));
   assert.equal(row.tooltip,`compact-original-artwork-${i+1}.svg#shape${i+1}`);
   if(mode==='original'){assert.equal(row.fill,fills[i]);assert.equal(row.stroke,i===0?'none':'#223344');assert.equal(Number(row.opacity),i===2?.55:1);}
   if(mode==='outline'){assert.equal(row.fill,'none');assert.equal(row.stroke,'var(--accent)');assert.equal(row.opacity,'1');}
   if(mode==='color')assert.notEqual(row.fill,fills[i]);
   if(theme==='dark')assert.equal(row.checker,'rgb(35, 39, 48)');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow');
  const name=`parts-${width}-${theme}-${mode}.png`;await page.screenshot({path:`${root}/${name}`,fullPage:true});
  report.matrix.push({width,theme,mode,screenshot:name,rows});
  console.log('PASS',width,theme,mode);
 }
 const first=page.locator('.part-row').first();
 await first.locator('.part-select').check();
 for(const mode of ['outline','color','original']){await page.locator(mode==='original'?'#view-layout':mode==='outline'?'#view-outline':'#view-color').click();assert.equal(await first.locator('.part-select').isChecked(),true);}
 await first.locator('[data-part-plus]').click();assert.equal(await first.locator('.part-select').isChecked(),true);assert.equal(await first.locator('[data-quantity]').inputValue(),'2');
 await first.locator('[data-part-minus]').click();assert.equal(await first.locator('.part-select').isChecked(),true);
 await first.locator('.part-main').click();assert.equal(await first.locator('.part-select').isChecked(),false);
 await first.locator('[data-quantity]').fill('3');await first.locator('[data-quantity]').dispatchEvent('change');assert.equal(await first.locator('.part-select').isChecked(),false);
 await first.locator('[data-quantity]').focus();await page.locator('#language-select').selectOption('en');
 assert.ok((await first.locator('.part-select').getAttribute('aria-label')).startsWith('Select part'));
 await first.locator('[data-quantity]').focus(); await page.locator('#view-outline').evaluate(el=>el.click()); assert.equal(await first.locator('[data-quantity]').evaluate(el=>el===document.activeElement),true);
 report.quantityFocusPreserved=true; report.selectionAndQuantity=true;
 assert.deepEqual(errors,[]);report.status='passed';
} catch(e){report.status='failed';report.failure=e.stack;throw e;} finally {await writeFile(`${root}/report.json`,JSON.stringify(report,null,2));await browser.close();}