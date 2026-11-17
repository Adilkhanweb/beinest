import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
page.setDefaultTimeout(7000);page.setDefaultNavigationTimeout(20000);
const report={combinations:[],errors:[],failedAssets:[]};
page.on('pageerror',error=>report.errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)report.failedAssets.push(response.url());});
const output=new URL('../test-results/',import.meta.url);
try{
  console.log('Loading UI');await page.goto('http://127.0.0.1:4175',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!document.querySelector('#parameter-preset'));await page.evaluate(()=>document.fonts.ready);
  console.log('Open disclosures');await page.locator('#export-parameters > summary').click();await page.locator('#advanced-parameters > summary').click();
  await page.locator('#language-select').selectOption('en');
  report.untranslated=await page.evaluate(()=>{
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),values=[];
    for(let node;node=walker.nextNode();){
      if(node.parentElement.closest('script,style,noscript,option,[translate=no],.part-info,.project-card strong'))continue;
      if(/[\u0400-\u04ff]/.test(node.textContent.trim()))values.push(node.textContent.trim());
    }
    return [...new Set(values)];
  });
  assert.deepEqual(report.untranslated,[],'New UI must be fully localized');
  for(const viewport of [{width:320,height:900},{width:375,height:812},{width:390,height:844},{width:768,height:1024},{width:812,height:375},{width:1024,height:900},{width:1440,height:1000},{width:1920,height:1200}]){
    console.log('Viewport',viewport.width);await page.setViewportSize(viewport);
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const language of ['ru','kk','en']){
        await page.locator('#language-select').selectOption(language);
        const measurement=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(document.body).fontFamily,time:document.querySelector('#stat-time').textContent}));
        assert.equal(measurement.overflow,false,JSON.stringify({viewport,theme,language}));
        assert.equal(await page.locator('#menu-button').isVisible(),true,'Sidebar toggle is available at every viewport');
        const noHeadingOverlap=await page.locator('.stat-top').evaluateAll(elements=>elements.every(element=>{
          const range=document.createRange();range.selectNodeContents(element.firstElementChild);
          const icon=element.lastElementChild.getBoundingClientRect();
          return [...range.getClientRects()].every(rect=>rect.right<=icon.left+1);
        }));
        assert.equal(noHeadingOverlap,true,'Stat labels and icons have separate columns');
        assert.match(measurement.font,/Noto Sans/);report.combinations.push({viewport,theme,language,...measurement});
      }
    }
  }
  // Fresh navigation resets responsive/full-page screenshot scroll and focus artifacts.
  await page.setViewportSize({width:375,height:900});await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);await page.locator('#language-select').selectOption('kk');
  await page.evaluate(()=>{document.querySelector('#export-parameters').open=true;document.activeElement.blur();window.scrollTo(0,0);});
  await page.screenshot({path:new URL('v2-mobile-kk.png',output).pathname.slice(1),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);await page.locator('#language-select').selectOption('ru');await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.querySelector('#export-parameters').open=true;document.activeElement.blur();window.scrollTo(0,0);});
  await page.screenshot({path:new URL('v2-desktop.png',output).pathname.slice(1),fullPage:true});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedAssets,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{await browser.close();await writeFile(new URL('ui-audit-report.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,combinations:report.combinations.length,untranslated:report.untranslated,errors:report.errors}));}