/** Local Chrome + real vendored WASM paint regression. Run with server on :4175.
 * Optional NESTBOLT_BASE_URL, PLAYWRIGHT_MODULE and CHROME_PATH overrides.
 * No packages are installed and uploaded SVG DOM is never attached.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/adilkhan/Documents/tomorrow-school%203d%20tour/node_modules/playwright-core/index.mjs');
const baseURL = process.env.NESTBOLT_BASE_URL || 'http://localhost:4175';
const reportURL = new URL('../test-results/paint-regression-report.json', import.meta.url);
const report = { startedAt: new Date().toISOString(), baseURL, status: 'running', checks: [], externalRequests: [] };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.goto(baseURL);
  // Monitor every page/worker request after startup. Any external request fails,
  // including an attempted load that would otherwise fail DNS or be blocked.
  browser.contexts()[0].on('request', request => {
    if (new URL(request.url()).origin !== new URL(baseURL).origin) report.externalRequests.push(request.url());
  });
  report.results = await page.evaluate(async () => {
    const { readOriginalPaints, attachOriginalPaints } = await import('/original-colors.js');
    const { NestEngine } = await import('/engine.js');
    const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">${body}</svg>`;
    const rect = '<rect width="10" height="10" fill="white"/>';
    const publicDTD = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "https://paint-regression.invalid/svg11.dtd">';
    const files = [{
      name: 'CAD exportedSVG.svg',
      text: publicDTD + wrap('<g display="inline"><rect id="white" width="10" height="10" fill="white"/><rect x="20" width="10" height="10" fill="#fff"/><path d="M40 0h10v10h-10z" fill="none" stroke="white"/></g>'),
    }, {
      name: 'CSS exportedSVG.svg',
      text: wrap('<style>svg{fill:white}.stroke{fill:none;stroke:white;stroke-opacity:.5}</style><g display="inline" opacity=".5"><rect width="10" height="10"/><rect id="stroke" class="stroke" x="20" width="10" height="10"/></g>'),
    }, {
      name: 'hidden.svg',
      text: wrap('<g display="none"><rect width="10" height="10"/></g><rect x="20" width="10" height="10" fill="white"/>'),
    }, {
      name: 'system.svg', text: '<!DOCTYPE svg SYSTEM "https://paint-regression.invalid/svg.dtd">' + wrap(rect),
    }];
    const registry = readOriginalPaints(files);
    const engine = new NestEngine();
    let actual;
    try {
      const library = attachOriginalPaints(await engine.importFiles(files), registry);
      actual = library.parts.map(({ source, studio_paint }) => ({ source, paint: studio_paint }));
    } finally { engine.dispose(); }
    const parse = (name, text) => {
      const r = readOriginalPaints([{ name, text }]);
      return { entries: [...r.bySource], warnings: r.warnings };
    };
    const parser = {
      root: parse('root.svg', wrap('<style>:root{fill:white}.stroke{fill:none;stroke:white}</style><rect width="10" height="10"/><rect class="stroke" x="20" width="10" height="10"/>')),
      cascade: parse('cascade.svg', wrap('<style>rect{fill:red!important}.white{fill:white!important}</style><rect class="white" width="10" height="10" fill="blue" style="fill:green"/>')),
      currentColor: parse('current.svg', wrap('<g fill="currentColor" color="red" opacity=".5"><rect width="10" height="10" color="white" opacity=".5" fill-opacity="50%"/></g>')),
      unrelated: parse('unrelated.svg', wrap('<style>.different:is(rect){fill:red}text::first-letter{fill:green}@media print{text{font-size:20px}}</style>' + rect)),
      matchingUnsupported: parse('matching.svg', wrap('<style>rect:is(rect){fill:red}</style>' + rect)),
      entity: parse('entity.svg', '<!DOCTYPE svg [<!ENTITY x "white">]>' + wrap(rect)),
      externalEntity: parse('external-entity.svg', '<!DOCTYPE svg [<!ENTITY x SYSTEM "https://paint-regression.invalid/entity">]>' + wrap(rect)),
      internalSubset: parse('subset.svg', '<!DOCTYPE svg []>' + wrap(rect)),
      malformedDTD: parse('malformed.svg', '<!DOCTYPE svg SYSTEM "https://paint-regression.invalid/open"' + wrap(rect)),
    };
    return { actual, warnings: registry.warnings, parser,
      limitations: ['Paint parser supports :root, but the vendored geometry worker rejects :root/advanced selectors; those parser-only cases are not claimed as successful geometry imports.'] };
  });
  const { actual, warnings, parser } = report.results;
  const white = { fill: '#ffffff', stroke: 'none', opacity: 1 };
  const stroke = { fill: 'none', stroke: '#ffffff', opacity: 1 };
  const check = (name, fn) => { fn(); report.checks.push({ name, status: 'passed' }); };
  const part = source => actual.find(p => p.source === source)?.paint;
  check('PUBLIC DTD explicit ID preserves true white', () => assert.deepEqual(part('CAD exportedSVG.svg#white'), white));
  check('Anonymous display=inline source ordinal', () => assert.deepEqual(part('CAD exportedSVG.svg#rect-4'), white));
  check('Real WASM stroke-only keeps fill:none', () => assert.deepEqual(part('CAD exportedSVG.svg#path-5'), stroke));
  check('Group/class CSS white + group opacity', () => assert.deepEqual(part('CSS exportedSVG.svg#rect-3'), { ...white, opacity: .5 }));
  check('Class stroke opacity keeps white channels and fill:none', () => {
    const paint = part('CSS exportedSVG.svg#stroke');
    assert.equal(paint.fill, 'none'); assert.equal(paint.opacity, .5);
    assert.match(paint.stroke, /^rgba\(255, 255, 255, 0\.50/);
  });
  check('Hidden group retains anonymous ordinal', () => assert.deepEqual(part('hidden.svg#rect-4'), white));
  check('SYSTEM DTD safely stripped', () => assert.deepEqual(part('system.svg#rect-2'), white));
  check('Real import has no paint warnings or missing parts', () => { assert.deepEqual(warnings, []); assert.equal(actual.length, 7); });
  check(':root parser white and stroke-only', () => assert.deepEqual(parser.root.entries.map(e => e[1]), [white, stroke]));
  check('Important class cascade overrides non-important inline', () => assert.deepEqual(parser.cascade.entries[0][1], white));
  check('Inherited currentColor resolves child color, cumulative opacity', () => {
    const paint = parser.currentColor.entries[0][1];
    assert.equal(paint.opacity, .25); assert.equal(paint.stroke, 'none');
    assert.match(paint.fill, /^rgba\(255, 255, 255, 0\.50/);
  });
  check('Unrelated unsupported pseudo rules preserve explicit fill', () => assert.deepEqual(parser.unrelated.entries[0][1], white));
  check('Matching unsupported paint is honestly neutral', () => {
    assert.deepEqual(parser.matchingUnsupported.entries[0][1], { fill: 'none', stroke: '#64748b', opacity: 1 });
    assert.ok(parser.matchingUnsupported.warnings.some(w => w.includes('matching unsupported')));
  });
  for (const key of ['entity', 'externalEntity', 'internalSubset', 'malformedDTD']) {
    check(`Hostile/unsupported XML rejected: ${key}`, () => {
      assert.deepEqual(parser[key].entries, []); assert.ok(parser[key].warnings.some(w => w.includes('DTD/entity')));
    });
  }
  await page.waitForTimeout(200);
  check('No external DTD/entity/network requests', () => assert.deepEqual(report.externalRequests, []));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error); process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(reportURL, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, report: reportURL.href, error: report.error }, null, 2));
}