/** Versioned, non-destructive migration of both historical preset libraries. */
export const PRESET_KEY = 'nestbolt-saved-parameters-v2';
export const LEGACY_PARAMETER_KEY = 'nestbolt-parameter-presets-v1';
export const LEGACY_SHEET_KEY = 'beinest-sheet-presets-v1';
export const presetNameKey = name => name.trim().normalize('NFKC').toLocaleLowerCase();
export const validPresetName = name => typeof name === 'string' && name.trim().length > 0 && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name);
export const newPresetId = () => globalThis.crypto?.randomUUID?.() || `parameters-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function normalizeSettings(source, defaults, schema, complete = true) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid settings');
  const values = source.values && typeof source.values === 'object' ? source.values : source;
  if (Object.keys(values).some(key => !(key in schema))) throw new Error('Unknown setting');
  const result = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.hasOwn(values, key) && complete && key !== 'time-unlimited') throw new Error(`Missing ${key}`);
    const value = Object.hasOwn(values, key) ? values[key] : key === 'time-unlimited' ? false : defaults[key];
    if (rule.type === 'checkbox') {
      if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`);
      result[key] = value;
    } else if (rule.options) {
      if (!['number', 'string'].includes(typeof value) || !rule.options.includes(String(value))) throw new Error(`Invalid ${key}`);
      result[key] = String(value);
    } else {
      if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error(`Invalid ${key}`);
      const n = Number(value);
      const stepValue = (n - (Number.isFinite(rule.min) ? rule.min : 0)) / rule.step;
      if (n < rule.min || n > rule.max || (rule.step && Math.abs(stepValue - Math.round(stepValue)) > 1e-7)) throw new Error(`Invalid ${key}`);
      result[key] = String(n);
    }
  }
  const size = Math.min(Number(result['sheet-width']), Number(result['sheet-height']));
  const edge = result['edge-unlinked'] ? Number(result['edge-spacing']) : Number(result[result['common-line-enabled'] ? 'common-line-kerf' : 'spacing']);
  if ((Number(result.margin) + edge) * 2 >= size) throw new Error('Invalid working area');
  return result;
}

export function createPresetStore({ defaults, schema, storage = globalThis.localStorage }) {
  const normalize = (value, complete = true) => normalizeSettings(value, defaults, schema, complete);
  const validateItems = items => {
    if (!Array.isArray(items)) throw new Error('Invalid library');
    const ids = new Set(), names = new Set();
    return items.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !validPresetName(item.name) || names.has(presetNameKey(item.name))) throw new Error('Invalid preset');
      ids.add(item.id); names.add(presetNameKey(item.name));
      return { id: item.id, name: item.name.trim(), builtin: item.builtin === true, settings: normalize(item.settings) };
    });
  };
  let state = { version: 2, items: [], selectedId: null }, error = null;
  const write = next => { storage.setItem(PRESET_KEY, JSON.stringify(next)); state = next; };
  try {
    const current = storage.getItem(PRESET_KEY);
    if (current !== null) {
      const parsed = JSON.parse(current);
      if (!parsed || parsed.version !== 2 || !(parsed.selectedId === null || typeof parsed.selectedId === 'string')) throw new Error('Invalid version');
      state = { version: 2, items: validateItems(parsed.items), selectedId: parsed.selectedId };
      if (state.selectedId && !state.items.some(item => item.id === state.selectedId)) throw new Error('Invalid selection');
    } else {
      const oldParameters = storage.getItem(LEGACY_PARAMETER_KEY), oldSheets = storage.getItem(LEGACY_SHEET_KEY);
      const items = [], ids = new Set(), names = new Set();
      const append = item => {
        let id = item.id, name = item.name.trim(), suffix = 2;
        while (ids.has(id)) id = `migrated-${id}`;
        while (names.has(presetNameKey(name))) name = `${item.name.trim().slice(0, 70)} (${suffix++})`;
        ids.add(id); names.add(presetNameKey(name)); items.push({ ...item, id, name });
      };
      if (oldParameters !== null) {
        const parsed = JSON.parse(oldParameters);
        if (!Array.isArray(parsed)) throw new Error('Invalid old parameters');
        for (const item of parsed) {
          if (!item || typeof item.id !== 'string' || !item.id || !validPresetName(item.name)) throw new Error('Invalid old preset');
          append({ id: item.id, name: item.name, builtin: false, settings: normalize(item.settings, false) });
        }
      }
      if (oldSheets !== null) {
        const parsed = JSON.parse(oldSheets);
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) throw new Error('Invalid old sheets');
        for (const item of parsed.items) {
          if (!item || typeof item.id !== 'string' || !item.id || !validPresetName(item.name) || !Number.isInteger(item.w) || !Number.isInteger(item.h)) throw new Error('Invalid old size');
          append({ id: item.id, name: item.name, builtin: item.builtin === true, settings: normalize({ ...defaults, 'sheet-width': item.w, 'sheet-height': item.h }) });
        }
      }
      // An explicitly empty historical library represents a deletion, never a seed request.
      if (oldSheets === null && oldParameters === null) {
        for (const [id, name, w, h] of [['0', 'Компактный', 300, 200], ['1', 'Стандартный', 600, 400], ['2', 'Средний', 900, 600], ['3', 'Полный лист', defaults['sheet-width'], defaults['sheet-height']]]) append({ id, name, builtin: true, settings: normalize({ ...defaults, 'sheet-width': w, 'sheet-height': h }) });
      }
      write({ version: 2, items: validateItems(items), selectedId: null });
    }
  } catch (cause) { error = cause; }
  return {
    get items() { return state.items; }, get selectedId() { return state.selectedId; }, get error() { return error; }, normalize,
    save(items, selectedId = state.selectedId) {
      if (error) throw new Error('Storage is protected after a read error');
      const validated = validateItems(items);
      if (selectedId !== null && !validated.some(item => item.id === selectedId)) throw new Error('Invalid selection');
      write({ version: 2, items: validated, selectedId });
    }
  };
}