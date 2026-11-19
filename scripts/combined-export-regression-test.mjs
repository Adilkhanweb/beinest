// Genuine two-sheet WASM export regression. No mocked engine/layouts, no ZIP.
// node scripts/combined-export-regression-test.mjs
// Self-hosts on an ephemeral local port unless TEST_URL is supplied.
// Optional CHROME_PATH / PLAYWRIGHT_MODULE / TEST_RESULTS_DIR overrides.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

/** Inspect real serialized downloads in a browser, including their mounted CTMs. */
export async function inspectCombinedDownload(page,bytes,natives) {
  return page.evaluate(({text,natives})=>{
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const near=(a,b,message)=>check(Math.abs(a-b)<1e-6,`${message}: ${a} != ${b}`);
    const mount=text=>{
      const doc=new DOMParser().parseFromString(text,'image/svg+xml');
      check(!doc.querySelector('parsererror'),'Valid XML');
      const svg=document.importNode(doc.documentElement,true);
      svg.style.position='fixed';svg.style.left='-20000px';document.body.append(svg);return svg;
    };
    const merged=mount(text),originals=natives.map(mount);
    try{
      check(merged.localName==='svg','Single SVG root');
      const nested=[...merged.children].filter(el=>el.localName==='svg');
      check(nested.length===originals.length,'Exactly one viewport per exported stock sheet');
      const ids=[...merged.querySelectorAll('[id]')].map(el=>el.id);
      check(ids.length===new Set(ids).size,'No duplicate IDs across sheets');
      check(!merged.querySelector('script,foreignObject,image'),'No active/external content');
      const dimensions=originals.map(svg=>({width:parseFloat(svg.getAttribute('width')),height:parseFloat(svg.getAttribute('height'))}));
      const width=dimensions.reduce((n,s)=>n+s.width,0)+100*(originals.length-1),height=Math.max(...dimensions.map(s=>s.height));
      check(merged.getAttribute('width')===`${width}mm`,'Root physical width in mm');
      check(merged.getAttribute('height')===`${height}mm`,'Root physical height in mm');
      check(merged.getAttribute('viewBox')===`0 0 ${width} ${height}`,'Root mm coordinate system');
      const geometrySelector='path,polygon,polyline,rect,circle,ellipse,line,use';
      const geometry=svg=>[...svg.querySelectorAll(geometrySelector)];
      const attributes=el=>Object.fromEntries([...el.attributes].filter(a=>a.name!=='id').map(a=>[a.name,a.value]));
      const transforms=(el,root)=>{const values=[];for(let node=el;node&&node!==root;node=node.parentElement)values.push(node.getAttribute('transform'));return values;};
      const matrix=(el,root)=>root.getScreenCTM().inverse().multiply(el.getScreenCTM());
      const nativeMillimeters=(el,root,dimension)=>{
        // Convert native user coordinates analytically to physical millimeters.
        // CSS pixel bounding rectangles round mm dimensions; dividing by those
        // rounded sizes would manufacture a small scale error in the oracle.
        const box=root.viewBox.baseVal,aspect=root.preserveAspectRatio.baseVal;
        let sx=dimension.width/box.width,sy=dimension.height/box.height,dx=0,dy=0;
        if(aspect.align!==SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE){
          const scale=aspect.meetOrSlice===SVGPreserveAspectRatio.SVG_MEETORSLICE_SLICE?Math.max(sx,sy):Math.min(sx,sy);
          sx=sy=scale;
          const alignment=aspect.align-SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_XMINYMIN;
          dx=(dimension.width-box.width*scale)*(alignment%3)/2;
          dy=(dimension.height-box.height*scale)*Math.floor(alignment/3)/2;
        }
        const userToMillimeters=new DOMMatrix([sx,0,0,sy,dx-box.x*sx,dy-box.y*sy]);
        return userToMillimeters.multiply(matrix(el,root));
      };
      let x=0,totalShapes=0;
      const sheets=originals.map((native,index)=>{
        const target=nested[index],actual=geometry(target),expected=geometry(native);
        check(expected.length>0,'Native sheet contains actual geometry');
        check(actual.length===expected.length,'No fabricated or omitted geometry');
        check(target.getAttribute('viewBox')===native.getAttribute('viewBox'),'Native viewBox retained');
        check(target.getAttribute('overflow')==='visible'&&getComputedStyle(target).overflow==='visible','Nested viewport never clips');
        near(Number(target.getAttribute('x')),x,'Stock extent + 100 mm offset');
        near(Number(target.getAttribute('y')),0,'Horizontal row');
        near(Number(target.getAttribute('width')),dimensions[index].width,'Native stock width');
        near(Number(target.getAttribute('height')),dimensions[index].height,'Native stock height');
        actual.forEach((shape,i)=>{
          const source=expected[i];
          check(shape.localName===source.localName,'Same geometry element type');
          check(JSON.stringify(attributes(shape))===JSON.stringify(attributes(source)),'Native path/geometry attributes unchanged');
          check(JSON.stringify(transforms(shape,target))===JSON.stringify(transforms(source,native)),'Native ancestor transforms unchanged');
          const a=matrix(shape,merged),b=nativeMillimeters(source,native,dimensions[index]);
          for(const key of ['a','b','c','d','f'])near(a[key],b[key],`Native CTM ${key}`);
          near(a.e,b.e+x,'Only horizontal stock translation added');
        });
        const sheet={index:index+1,x,width:dimensions[index].width,height:dimensions[index].height,shapes:actual.length,outline:!!target.querySelector('[id$="-SHEET"] rect[id$="-sheet"]')};
        totalShapes+=actual.length;x+=dimensions[index].width+100;return sheet;
      });
      return {width,height,totalShapes,sheets};
    }finally{merged.remove();originals.forEach(svg=>svg.remove());}
  },{text:bytes.toString('utf8'),natives});
}

/** Reopen/rename/manual-save proofs reuse an existing real result; no re-nest. */
export async function checkProjectExportFilenames(page,download) {
  const readSaved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]);
  const openSaved=async()=>{await page.locator('[data-nav="projects"]').click();await page.locator('[data-open-project]').first().click();};
  await page.reload({waitUntil:'networkidle'});await openSaved();
  await page.locator('#export-parameters').evaluate(el=>el.open=true);await page.locator('#export-scope').selectOption('all');
  const original=await readSaved();assert.equal(original.projectExplicitName,false);assert.deepEqual(original.importNames,['чертёж.svg']);
  await download('combined-reopened-auto.svg','чертёж beinest 2 lists.svg');
  await page.locator('#new-project').click();await page.locator('#save-current-project').click();await page.locator('#dialog-close').click();
  assert.equal((await readSaved()).projectExplicitName,true,'Manual save explicitly selects project basename');
  await download('combined-manual-saved.svg',`${original.name} beinest 2 lists.svg`);
  await page.locator('[data-nav="projects"]').click();await page.locator('[data-rename-project]').first().click();
  await page.locator('#rename-project-name').fill('Заказ: чертёж.');await page.locator('#save-project-name').click();await page.locator('#dialog-close').click();
  await download('combined-renamed.svg','Заказ_ чертёж beinest 2 lists.svg');
  await page.reload({waitUntil:'networkidle'});await openSaved();
  const renamed=await readSaved();assert.equal(renamed.projectExplicitName,true);assert.equal(renamed.name,'Заказ: чертёж.');assert.deepEqual(renamed.importNames,['чертёж.svg']);
  await download('combined-renamed-reopened.svg','Заказ_ чертёж beinest 2 lists.svg');
  return {automaticSaveRetainsOriginalBasename:true,manualSaveUsesProjectName:true,renameAndReloadRetainExplicitName:true};
}

async function localServer(){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!path.startsWith(root.endsWith(sep)?root:root+sep)||!(await stat(path)).isFile())throw new Error('Not found');
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(path));
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  return {server,base:`http://127.0.0.1:${server.address().port}`};
}

export async function runCombinedExportRegression(){
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
  const executablePath=process.env.CHROME_PATH||[
    process.env.PROGRAMFILES&&`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
    process.env['PROGRAMFILES(X86)']&&`${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`,
    '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean).find(existsSync);
  const out=process.env.TEST_RESULTS_DIR?pathToFileURL(resolve(process.env.TEST_RESULTS_DIR)+sep):new URL('../test-results/',import.meta.url);
  await mkdir(out,{recursive:true});
  const hosted=process.env.TEST_URL?null:await localServer();
  let browser;const errors=[],report={};
  try{
    browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
    const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
    page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.TEST_URL||hosted.base,{waitUntil:'networkidle'});
    await page.locator('#parts-tab').click();
    // Each native part occupies > half of the stock area: exactly two sheets
    // are necessary, while the hole exercises non-bounding-box paths.
    const source='<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80"><path id="чертёж" fill-rule="evenodd" d="M0 0H100V80H0Z M10 10V20H20V10Z"/></svg>';
    await page.locator('#file-input').setInputFiles({name:'чертёж.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});
    await page.waitForFunction(()=>document.querySelectorAll('.part-row').length===1);
    await page.locator('[data-quantity]').fill('2');await page.locator('[data-quantity]').dispatchEvent('change');
    await page.locator('#settings-tab').click();
    await page.locator('#sheet-width').fill('120');await page.locator('#sheet-height').fill('100');
    await page.locator('#advanced-parameters').evaluate(el=>el.open=true);await page.locator('#time-unlimited').uncheck();await page.locator('#time-output').fill('1');
    await page.locator('#run-button').click();
    await page.waitForFunction(()=>document.body.classList.contains('is-running'));
    await page.waitForFunction(()=>!document.body.classList.contains('is-running')&&!document.body.classList.contains('is-stopping'),null,{timeout:90000});
    assert.equal(await page.locator('#export-button').isDisabled(),false,await page.locator('#toast-text').textContent());
    assert.equal(await page.locator('.sheet-card').count(),2,'Genuine engine produced two sheets');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('nestbolt-projects'))[0]);
    assert.equal(saved.result.validation.valid,true);assert.equal(saved.result.layout.sheets.length,2);
    await writeFile(new URL('combined-export-real-project.json',out),JSON.stringify(saved,null,2));
    await page.locator('#export-parameters').evaluate(el=>el.open=true);
    assert.equal(await page.locator('.export-format').textContent(),'SVG');
    const native=async outline=>page.evaluate(async({project,outline})=>{
      const {NestEngine}=await import('./engine.js'),engine=new NestEngine();
      try{return await Promise.all(project.result.layout.sheets.map(sheet=>engine.exportSheet(project.library,project.request,project.result.layout,sheet.id,'svg',{outline})));}finally{engine.dispose();}
    },{project:saved,outline});
    const download=async(name,expected)=>{
      const pending=page.waitForEvent('download');await page.locator('#export-button').click();const file=await pending;
      assert.equal(await file.failure(),null);assert.equal(file.suggestedFilename(),expected);
      const path=new URL(name,out);await file.saveAs(fileURLToPath(path));const bytes=await readFile(path);
      assert.match(bytes.toString('utf8'),/^<\?xml[^>]+>\s*<svg\b/,'Actual download is XML SVG, not ZIP');return bytes;
    };
    for(const outline of [false,true]){
      const natives=await native(outline);for(let i=0;i<natives.length;i++)await writeFile(new URL(`combined-native-${i+1}${outline?'-outline':''}.svg`,out),natives[i]);
      await page.locator('#export-scope').selectOption('all');await page.locator('#export-sheet-outline').setChecked(outline);
      const bytes=await download(`combined-all${outline?'-outline':''}.svg`,'чертёж beinest 2 lists.svg');
      const data=await inspectCombinedDownload(page,bytes,natives);
      assert.equal(data.width,340);assert.equal(data.height,100);assert.equal(data.sheets[1].x,220);
      assert.ok(data.sheets.every(sheet=>sheet.outline===outline));report[outline?'outlined':'plain']=data;
      await page.locator('.sheet-card-heading').nth(1).click();await page.locator('#export-scope').selectOption('selected');
      const selected=await download(`combined-selected${outline?'-outline':''}.svg`,'чертёж beinest 1 lists.svg');
      const one=await inspectCombinedDownload(page,selected,[natives[1]]);assert.equal(one.width,120);assert.equal(one.height,100);
    }
    // Lightweight reference/safety fixture, explicitly separate from real WASM.
    report.referenceFixture=await page.evaluate(async()=>{
      const {combineSheetSvgs,combinedExportFilename}=await import('./export-files.js');
      const fixture='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="5 2 40 20"><defs><linearGradient id="ink"><stop stop-color="red"/></linearGradient><path id="shape" d="M5 2H15V12Z"/></defs><style>#shape{stroke:blue}.paint{fill:url(#ink)}</style><use class="paint" href="#shape"/><script>alert(1)</script><image href="https://invalid.test/a"/><path onload="alert(1)" d="M6 3H7"/></svg>';
      const text=combineSheetSvgs([fixture,fixture]),doc=new DOMParser().parseFromString(text,'image/svg+xml'),ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);
      if(doc.querySelector('parsererror,script,image,[onload]')||new Set(ids).size!==ids.length)throw new Error('Sanitization/ID isolation failed');
      for(const use of doc.querySelectorAll('use'))if(!doc.getElementById(use.getAttribute('href').slice(1)))throw new Error('Unresolved prefixed href');
      const styles=[...doc.querySelectorAll('style')].map(e=>e.textContent);
      if(!styles[0].includes('sheet-1-ink')||!styles[1].includes('sheet-2-ink')||!styles[0].includes('sheet-1-shape'))throw new Error('CSS ID/url references not isolated');
      const cases=[
        [{projectExplicitName:false,projectName:'Автосохранение',importNames:['чертёж.svg']},'чертёж beinest 2 lists.svg'],
        [{projectExplicitName:true,projectName:'Проект: тест. ',importNames:['чертёж.svg']},'Проект_ тест beinest 2 lists.svg'],
        [{library:{parts:[{source:'folder/деталь.dxf#shape'}]}},'деталь beinest 2 lists.svg']
      ];
      for(const [state,want] of cases)if(combinedExportFilename(state,2)!==want)throw new Error('Filename contract failed');
      return {uniqueIds:ids.length,hrefs:doc.querySelectorAll('use').length,filenameCases:cases.length};
    });
    const transformed=await page.evaluate(async()=>{
      const {combineSheetSvgs}=await import('./export-files.js');
      const source='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="5 2 40 20"><g transform="translate(7 3) rotate(17)"><path id="tool" d="M5 2H15V12Z" transform="scale(0.7)"/></g></svg>';
      return {text:combineSheetSvgs([source,source]),natives:[source,source]};
    });
    report.transformedNonzeroViewBox=await inspectCombinedDownload(page,Buffer.from(transformed.text),transformed.natives);
    report.projectFilenameLifecycle=await checkProjectExportFilenames(page,download);
    assert.deepEqual(errors,[]);report.status='passed';return report;
  }catch(error){report.status='failed';report.failure=error.stack;throw error;}
  finally{
    if(browser)await browser.close();if(hosted)await new Promise(done=>hosted.server.close(done));
    report.errors=errors;await writeFile(new URL('combined-export-regression-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runCombinedExportRegression();