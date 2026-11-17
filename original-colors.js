/** Local-only SVG paint recovery. No uploaded DOM is ever attached to a document.
 * Contract: const paints = readOriginalPaints(files); // BEFORE engine import
 *           attachOriginalPaints(library, paints);   // returns the same library
 * registry.bySource is a Map keyed by the engine's filename#elementId source.
 * warnings explicitly describe unsupported/ambiguous cases, not invented palettes.
 * DXF, gradients, patterns, external CSS, use-instance styles and advanced CSS
 * selectors are not reconstructed. Such cases use a neutral visible outline.
 */
const NEUTRAL = Object.freeze({ fill: 'none', stroke: '#64748b', opacity: 1 });
const INITIAL = { fill: 'black', stroke: 'none', color: 'black', 'fill-opacity': '1', 'stroke-opacity': '1', opacity: '1' };
const PROPS = Object.keys(INITIAL);
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const SKIP = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'script', 'foreignObject', 'image', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'symbol']);
const UNKNOWN = '__unresolved_svg_paint__';

// Strip only an ordinary external SVG doctype, BEFORE DOMParser sees it. The
// URI is metadata, never fetched. Internal subsets and entity declarations are
// deliberately not supported, even when the entity looks harmless.
function safeXML(text) {
  if (/<!ENTITY\b/i.test(text)) return null;
  let invalid = false, count = 0;
  const cleaned = text.replace(/<!DOCTYPE\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, declaration => {
    count++;
    if (!/^<!DOCTYPE\s+svg(?:\s+(?:PUBLIC\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')|SYSTEM\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')))?\s*>$/i.test(declaration)) invalid = true;
    return '';
  });
  return invalid || count > 1 || /<!DOCTYPE\b/i.test(cleaned) ? null : cleaned;
}

function warn(registry, message) {
  if (!registry.warnings.includes(message)) registry.warnings.push(message);
}

function amount(value, fallback = 1) {
  const text = String(value).trim();
  const n = Number(text.endsWith('%') ? text.slice(0, -1) : text);
  return Number.isFinite(n) && text !== '' ? Math.max(0, Math.min(1, text.endsWith('%') ? n / 100 : n)) : fallback;
}

// Native CSS parsing only; a constructed stylesheet is never adopted, so even
// @import and url() cannot trigger loads. Only a small allowlist is read out.
function rulesFor(root, registry, name) {
  const rules = [];
  for (const node of root.querySelectorAll('style')) {
    if (node.getAttribute('media') && node.getAttribute('media') !== 'all') {
      warn(registry, `${name}: conditional SVG stylesheet ignored.`);
      rules.incomplete = true;
      continue;
    }
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(node.textContent || '');
      for (const rule of sheet.cssRules) {
        if (!rule.selectorText || !rule.style) {
          // Layout-only at-rules cannot change recovered paint.
          if (!/(?:^|[;{\s])(?:fill|stroke|color|fill-opacity|stroke-opacity|opacity)\s*:|@import\b/i.test(rule.cssText)) continue;
          warn(registry, `${name}: conditional/external CSS rules ignored.`);
          rules.incomplete = true;
          continue;
        }
        for (const selector of rule.selectorText.includes('(') ? [rule.selectorText] : rule.selectorText.split(',')) {
          if (!PROPS.some(p => rule.style.getPropertyValue(p))) continue;
          // :root is common in exported SVG and matches the detached XML root.
          // Unhandled selectors only make matching paint declarations unknown;
          // an unrelated CSS rule must not erase every explicit white fill.
          const simple = selector.replace(/:root\b/g, '.root');
          const unsupported = simple.includes(':') || simple.includes('|') || simple.includes('\\');
          if (unsupported) {
            warn(registry, `${name}: advanced CSS selector ignored: ${selector.trim()}`);
          }
          const stripped = simple.replace(/\[[^\]]*\]/g, '.attr');
          const specificity = [0, (stripped.match(/#[\w-]+/g) || []).length,
            (stripped.match(/\.[\w-]+/g) || []).length,
            (stripped.replace(/[#.][\w-]+/g, '').match(/[a-zA-Z_][\w-]*/g) || []).length];
          rules.push({ selector: selector.trim(), specificity, style: rule.style, unsupported });
        }
      }
    } catch {
      warn(registry, `${name}: SVG CSS could not be parsed in this browser.`);
      rules.incomplete = true;
    }
  }
  if (root.querySelector('link') || /@import\b/i.test([...root.querySelectorAll('style')].map(n => n.textContent).join(''))) {
    warn(registry, `${name}: external stylesheets are not loaded.`);
    rules.incomplete = true;
  }
  return rules;
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function specified(element, rules) {
  const values = {}, ranks = {};
  function offer(property, value, rank) {
    if (value && (!ranks[property] || compare(rank, ranks[property]) >= 0)) {
      values[property] = value.trim(); ranks[property] = rank;
    }
  }
  for (const p of PROPS) offer(p, element.getAttribute(p), [0, 0, 0, 0, 0, -1]);
  rules.forEach((rule, index) => {
    let matches = false;
    try { matches = element.matches(rule.selector); } catch { matches = rule.unsupported; }
    if (matches) for (const p of PROPS) offer(p, rule.unsupported && rule.style.getPropertyValue(p) ? UNKNOWN : rule.style.getPropertyValue(p),
      [rule.style.getPropertyPriority(p) === 'important' ? 1 : 0, ...(rule.unsupported ? [2, 0, 0, 0] : rule.specificity), index]);
  });
  for (const p of PROPS) offer(p, element.style?.getPropertyValue(p),
    [element.style?.getPropertyPriority(p) === 'important' ? 1 : 0, 1, 0, 0, 0, rules.length]);
  return values;
}

function stateFor(element, parent, rules) {
  const specifiedValues = specified(element, rules), state = {};
  for (const p of PROPS) {
    let v = specifiedValues[p];
    if (!v || v === 'unset') v = p === 'opacity' ? INITIAL[p] : parent[p];
    if (v === 'inherit') v = parent[p];
    if (v === 'initial') v = INITIAL[p];
    state[p] = v;
  }
  if (state.color.toLowerCase() === 'currentcolor') state.color = parent.color;
  // currentColor on an inherited paint resolves using the child's color.
  state.totalOpacity = state.opacity === UNKNOWN ? NaN : parent.totalOpacity * amount(state.opacity);
  return state;
}

function paintFor(state, context, registry, name) {
  const unresolved = paint => state[paint] === UNKNOWN ||
    (state[paint].toLowerCase() !== 'none' && state[`${paint}-opacity`] === UNKNOWN) ||
    (state[paint].toLowerCase() === 'currentcolor' && state.color === UNKNOWN);
  if (unresolved('fill') || unresolved('stroke') || !Number.isFinite(state.totalOpacity)) {
    warn(registry, `${name}: matching unsupported CSS paint; neutral fallback used.`);
    return { ...NEUTRAL };
  }
  function color(value, alpha) {
    value = value.trim();
    if (value.toLowerCase() === 'currentcolor') value = state.color;
    if (value.toLowerCase() === 'none') return 'none';
    // Reject all functions except literal rgb/hsl. No URL, var, context paints,
    // browser-dependent system colors, CSS injection or external resources.
    if (!/^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+\-/degturnrad]*\)|[a-z]+)$/i.test(value) ||
        /^(?:inherit|initial|unset|revert|context-fill|context-stroke)$/i.test(value) ||
        !globalThis.CSS?.supports('color', value)) {
      warn(registry, `${name}: unsupported paint (${value.slice(0, 80)}); neutral fallback used.`);
      return null;
    }
    // Canvas normalizes literal named/hex/rgb/hsl colors without executing SVG.
    context.fillStyle = '#010203'; context.fillStyle = value;
    const normalized = context.fillStyle;
    if (alpha === 1) return normalized;
    context.clearRect(0, 0, 1, 1); context.globalAlpha = alpha;
    context.fillRect(0, 0, 1, 1); context.globalAlpha = 1;
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  }
  const fill = color(state.fill, amount(state['fill-opacity']));
  const stroke = color(state.stroke, amount(state['stroke-opacity']));
  if (fill === null || stroke === null) return { ...NEUTRAL };
  const invisible = v => v === 'none' || v === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0*)?\)$/.test(v) || /^#[\da-f]{6}00$/i.test(v);
  if ((invisible(fill) && invisible(stroke)) || state.totalOpacity === 0) {
    warn(registry, `${name}: invisible paint replaced with a visible neutral outline.`);
    return { ...NEUTRAL };
  }
  return { fill, stroke, opacity: state.totalOpacity };
}

function add(registry, source, paint) {
  if (registry.bySource.has(source)) {
    registry.bySource.set(source, null);
    warn(registry, `${source}: ambiguous source identifier; neutral fallback used.`);
  } else registry.bySource.set(source, paint);
}

/** Synchronous. Input is decoded [{name, text}], never File objects or URLs. */
export function readOriginalPaints(files) {
  const registry = { bySource: new Map(), warnings: [] };
  if (!Array.isArray(files)) throw new TypeError('readOriginalPaints expects [{name, text}]');
  for (const file of files) {
    if (typeof file?.name !== 'string' || typeof file?.text !== 'string') throw new TypeError('Each paint source needs name and text strings');
    const { name, text } = file;
    if (!/\.svg$/i.test(name)) {
      warn(registry, `${name}: original paints for this format are not recovered; neutral fallback used.`);
      continue;
    }
    if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
      warn(registry, `${name}: SVG paint parsing requires browser DOMParser; neutral fallback used.`);
      continue;
    }
    const xml = safeXML(text);
    if (xml === null) {
      warn(registry, `${name}: DTD/entity SVG not parsed; neutral fallback used.`);
      continue;
    }
    const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.querySelector('parsererror') || root.localName !== 'svg') {
      warn(registry, `${name}: malformed SVG; neutral fallback used.`); continue;
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) { warn(registry, `${name}: color normalization unavailable.`); continue; }
    const rules = rulesFor(root, registry, name);
    if (rules.incomplete) warn(registry, `${name}: incomplete CSS cascade; neutral fallback used rather than guessing original colors.`);
    // WASM smoke verified: root=1, groups count, style/title/defs do not;
    // anonymous converted shapes use original-tag + '-' + tree-node ordinal.
    let ordinal = 0;
    function walk(element, parent, excluded = false) {
      const tag = element.localName;
      const skip = excluded || SKIP.has(tag);
      if (!skip) ordinal++;
      const state = stateFor(element, parent, rules);
      if (SHAPES.has(tag) && !skip) {
        const id = element.getAttribute('id') || `${tag}-${ordinal}`;
        add(registry, `${name}#${id}`, rules.incomplete ? { ...NEUTRAL } : paintFor(state, context, registry, name));
      }
      if (tag === 'use') warn(registry, `${name}: use-instance paint/source mapping is unsupported; neutral fallback may be used.`);
      for (const child of element.children) walk(child, state, skip);
    }
    walk(root, { ...INITIAL, totalOpacity: 1 });
    if (root.querySelector('use, switch, text, image, foreignObject')) {
      // These can change the engine's converted tree and invalidate ordinals.
      // Exact explicit IDs remain reliable; do not guess anonymous mappings.
      warn(registry, `${name}: converted/hidden SVG nodes may change generated sources; anonymous mapping disabled.`);
      for (const key of registry.bySource.keys()) if (key.startsWith(`${name}#`) && /#(?:path|rect|circle|ellipse|polygon|polyline|line)-\d+$/.test(key)) {
        const id = key.slice(name.length + 1);
        if (![...root.querySelectorAll('[id]')].some(e => e.id === id)) registry.bySource.delete(key);
      }
    }
  }
  return registry;
}

/** Mutates only part.studio_paint; geometry and generated-color mode stay intact. */
export function attachOriginalPaints(library, registry) {
  for (const part of library?.parts || []) {
    const paint = registry?.bySource?.get(part.source);
    part.studio_paint = { ...(paint || NEUTRAL) };
    if (!paint && registry) warn(registry, `${part.source || part.id || 'Part'}: no exact original paint mapping; neutral fallback used.`);
  }
  return library;
}