// No dependencies: exercise the UNMODIFIED browser worker/WASM in Node using
// a small Worker/fetch compatibility bridge. Run: node assets/vendor/smoke-test.mjs
import { Worker as NodeWorker } from 'node:worker_threads';
import assert from 'node:assert/strict';

globalThis.Worker = class BrowserWorker {
  constructor(url) {
    this.worker = new NodeWorker(`
      const {parentPort, workerData} = require('node:worker_threads');
      const {readFile} = require('node:fs/promises');
      globalThis.self = globalThis;
      globalThis.postMessage = data => parentPort.postMessage(data);
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = async (input, options) => {
        const url = input instanceof URL ? input : new URL(input);
        if (url.protocol === 'file:') return new Response(await readFile(url), {
          headers: {'Content-Type':'application/wasm'}
        });
        return nativeFetch(input, options);
      };
      (async () => {
        await import(workerData);
        parentPort.on('message', data => self.onmessage({data}));
      })().catch(error => { throw error; });
    `, { eval: true, workerData: url.href });
    this.worker.on('message', data => this.onmessage?.({ data }));
    this.worker.on('error', error => this.onerror?.({ message: error.message }));
  }
  postMessage(data) { this.worker.postMessage(data); }
  terminate() { this.worker.terminate(); }
};

const { NestEngine } = await import('../../engine.js');
const engine = new NestEngine();
try {
  const library = await engine.importFiles([{ name: 'smoke.svg', text:
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path id="square" d="M0 0H20V20H0Z"/></svg>'
  }]);
  assert.ok(library.parts.length > 0);
  const request = {
    parts: library.parts.map(part => ({ id: part.id, quantity: 3,
      rotations: {kind:'step', degrees:90}, allow_mirror:false, priority:1 })),
    sheets:[{id:'stock-1',width_mm:100,height_mm:100,count:1,
      margins_mm:{left:5,right:5,bottom:5,top:5},defects_mm:[]}],
    spacing_mm:2,edge_spacing_mm:1,mode:'all'
  };
  let progress = 0;
  const result = await engine.run(library, request, {seconds:1,onProgress:() => progress++});
  assert.equal(result.validation.valid, true);
  assert.equal(result.layout.placements.length, 3);
  assert.equal((await engine.validate(library,request,result.layout)).valid,true);
  const svg = await engine.exportSheet(library,request,result.layout,result.layout.sheets[0].id);
  assert.match(svg, /<svg/);
  const dxf = await engine.exportSheet(library,request,result.layout,result.layout.sheets[0].id,'dxf');
  assert.match(dxf, /ENTITIES/);
  const pending = engine.run(library, request, {seconds:10});
  setTimeout(() => engine.stop(), 100);
  await assert.rejects(pending, {name:'AbortError'});
  const restarted = await engine.run(library,request,{seconds:2});
  assert.equal(restarted.validation.valid,true);
  console.log(JSON.stringify({ok:true,libraryParts:library.parts.length,
    placements:result.layout.placements.length,metrics:result.validation.metrics,
    progressEvents:progress,svgBytes:svg.length,dxfBytes:dxf.length,
    cancelledAndRestarted:true,memoryBytes:engine.memoryBytes},null,2));
} finally { engine.dispose(); }