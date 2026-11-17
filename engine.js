/** Actual Nestbolt WASM engine. Serve this directory over HTTP(S), not file://.
 * Geometry and search run entirely in the vendored module worker.
 * All methods except stop() return Promises. See THIRD_PARTY_NOTICES.md.
 */
const WORKER_URL = new URL('./assets/vendor/worker-Bpfw-h0X.js', import.meta.url);
// UI-only artwork metadata is deliberately not part of the strict Rust library schema.
const serializeLibrary = library => JSON.stringify(library, (key, value) => key.startsWith('studio_') ? undefined : value);

function cancelled() {
  const error = new Error('Nesting cancelled');
  error.name = 'AbortError';
  return error;
}

class WorkerClient {
  constructor(url) {
    this.pending = new Map();
    this.next = 1;
    this.memoryBytes = 0;
    this.closed = false;
    this.worker = new Worker(url, { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const task = this.pending.get(data.id);
      if (!task) return;
      if (data.type === 'progress') {
        let layout;
        try { layout = data.layout ? JSON.parse(data.layout) : undefined; }
        catch (error) { this.pending.delete(data.id); task.reject(error); return; }
        // A UI callback must not break worker lifecycle or strand its Promise.
        try { task.onProgress?.({ t: data.t, material: data.material, layout }); }
        catch (error) { console.error('Nestbolt progress callback failed:', error); }
        return;
      }
      this.pending.delete(data.id);
      this.memoryBytes = data.memory ?? this.memoryBytes;
      if (data.type === 'done') task.resolve(data.value);
      else task.reject(new Error(data.message || 'Nestbolt worker failed'));
    };
    this.worker.onerror = (event) => this.terminate(new Error(event.message || 'Nestbolt worker could not load. Serve the site over HTTP(S) and check WASM assets.'));
    this.worker.onmessageerror = () => this.terminate(new Error('Could not decode Nestbolt worker message'));
  }

  call(type, args, onProgress) {
    if (this.closed) return Promise.reject(new Error('Nestbolt worker is closed'));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      try { this.worker.postMessage({ id, type, args }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  terminate(reason = cancelled()) {
    this.closed = true;
    this.worker.terminate();
    for (const task of this.pending.values()) task.reject(reason);
    this.pending.clear();
  }
}

export class NestEngine {
  constructor({ workerUrl = WORKER_URL } = {}) {
    this.workerUrl = workerUrl;
    this.utility = null;
    this.active = null;
    this.memoryBytes = 0;
  }

  _utility() {
    if (!this.utility || this.utility.closed) this.utility = new WorkerClient(this.workerUrl);
    return this.utility;
  }

  /** files: [{name:string,text:string}], options: tolerance,closeGapsMm,layers,colors,dxfUnitMm,sheetLayers. */
  async importFiles(files, options = {}) {
    if (!Array.isArray(files) || !files.length) throw new Error('Choose at least one SVG, DXF or LightBurn file');
    if (files.some(file => typeof file.name !== 'string' || typeof file.text !== 'string')) {
      throw new TypeError('importFiles expects [{name, text}] with string file contents');
    }
    return JSON.parse(await this._utility().call('import', { ...options, files }));
  }

  /** result: {layout,validation:{valid,violations,metrics},seed,seconds,repeatable,...}.
   * onProgress receives {t,material,layout?}; times are seconds, layout uses mm.
   * stop() rejects the running promise with name === 'AbortError'.
   */
  async run(library, request, { seconds = 5, onProgress, seed = 1, repeatable = false, live = 0.5 } = {}) {
    if (!library?.parts?.length) throw new Error('Import parts before nesting');
    if (!request?.parts?.length || !request?.sheets?.length) throw new Error('Nesting requires parts and at least one stock sheet');
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Search duration must be a positive number of seconds');
    this.stop();
    const client = new WorkerClient(this.workerUrl);
    this.active = client;
    try {
      const result = JSON.parse(await client.call('nest', {
        library: serializeLibrary(library), request: JSON.stringify(request),
        seconds, seed, repeatable, live,
      }, onProgress));
      this.memoryBytes = client.memoryBytes;
      if (!result.validation?.valid) {
        throw new Error(result.validation?.violations?.map(v => v.message).join('; ') || 'The engine did not find a valid layout');
      }
      return result;
    } finally {
      client.terminate();
      if (this.active === client) this.active = null;
    }
  }

  /** sheetId is result.layout.sheets[i].id, NOT stock_id. Returns SVG/DXF text. */
  async exportSheet(library, request, layout, sheetId, format = 'svg', { outline = format === 'lbrn2' } = {}) {
    if (!layout?.sheets?.some(sheet => sheet.id === sheetId)) throw new Error('Choose an existing layout sheet to export');
    return this._utility().call('export', {
      library: serializeLibrary(library), request: JSON.stringify(request), layout: JSON.stringify(layout),
      sheet: sheetId, format, outline: Boolean(outline),
    });
  }

  /** Optional: engine-native validity report, useful after loading saved projects. */
  async validate(library, request, layout) {
    return JSON.parse(await this._utility().call('validate', {
      library: serializeLibrary(library), request: JSON.stringify(request), layout: JSON.stringify(layout),
    }));
  }

  /** Decode browser File bytes using the engine (also supports binary DXF). */
  async readFile(file) {
    const text = await this._utility().call('decode', { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return { name: file.name, text };
  }

  stop() {
    if (this.active) { this.active.terminate(); this.active = null; }
  }

  dispose() {
    this.stop();
    this.utility?.terminate();
    this.utility = null;
  }
}

export const Engine = NestEngine;
const shared = new NestEngine();
export const importFiles = (...args) => shared.importFiles(...args);
export const run = (...args) => shared.run(...args);
export const exportSheet = (...args) => shared.exportSheet(...args);
export const stop = () => shared.stop();
export default NestEngine;