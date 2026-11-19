/** Extended settings for the real Nestbolt worker. No chart or viewer mutations.
 * Request shapes verified against assets/vendor/web-src-{app,types,worker}.
 */
import { setupPresetUI } from './parameter-presets-ui.js';
const BASE_IDS = ['sheet-width', 'sheet-height', 'spacing', 'margin', 'rotation', 'allow-holes', 'time-unlimited', 'time-budget'];
const EXTRA_IDS = ['edge-unlinked', 'edge-spacing', 'sheet-count', 'nest-mode', 'allow-mirror',
  'common-line-enabled', 'common-line-kerf', 'common-line-search-bonus', 'lead-in-enabled',
  'lead-in-kerf', 'lead-in-length', 'lead-in-style', 'lead-in-outer-angle', 'lead-in-hole-angle',
  'run-seed', 'run-repeatable', 'quick-start', 'import-tolerance', 'import-close-gaps', 'import-gap-limit', 'import-dxf-unit'];

export function setupSettings({ onDirty = () => {}, isRunning = () => false } = {}) {
  const $ = id => document.getElementById(id);
  const root = $('settings-content');
  if (!root) throw new Error('Nestbolt settings require #settings-content');
  if (root.nestboltSettings) return root.nestboltSettings;
  let disabled = false;
  let presetUI = null;
  const locked = () => disabled || isRunning();
  const ids = [...BASE_IDS, ...EXTRA_IDS];
  const number = id => Number($(id).value);
  const checked = id => $(id).checked;

  function node(tag, attrs = {}, text) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') el.className = value;
      else el.setAttribute(key, String(value));
    }
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function hint(parent, text) { parent.append(node('p', { class: 'settings-hint' }, text)); }
  function field(parent, id, label, { value = 0, min = 0, max, step = 'any', options, unit } = {}) {
    const wrap = node('label', { class: 'settings-field', for: id });
    wrap.append(node('span', {}, label));
    let input;
    if (options) {
      input = node('select', { id });
      for (const [v, text] of options) input.append(node('option', { value: v }, text));
    } else {
      input = node('input', { id, type: 'number', min, step, required: '' });
      if (max !== undefined) input.max = max;
    }
    input.value = value;
    if (unit) {
      const unitWrap = node('span', { class: 'input-unit' });
      unitWrap.append(input, node('span', {}, unit));
      wrap.append(unitWrap);
    } else wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function toggle(parent, id, label, description, value = false) {
    const wrap = node('div', { class: 'toggle-row' });
    const text = node('label', { for: id }, label);
    if (description) text.append(node('span', {}, description));
    const input = node('input', { id, type: 'checkbox', class: 'switch' });
    input.checked = value;
    wrap.append(text, input);
    parent.append(wrap);
    return input;
  }
  function details(title) {
    const el = node('details', { class: 'advanced-settings settings-section' });
    el.append(node('summary', {}, title));
    advanced.append(el);
    return el;
  }

  // Leave only the everyday sheet/spacing/rotation/hole controls exposed.
  const geometrySection = $('rotation').closest('.settings-section');
  const holesRow = $('allow-holes').closest('.toggle-row');
  const advanced = node('details', { id: 'advanced-parameters', class: 'advanced-settings settings-section' });
  advanced.append(node('summary', {}, 'Расширенные параметры'));
  geometrySection.after(advanced);
  const extendedGeometry = node('section', { class: 'settings-section', 'aria-labelledby': 'extended-geometry-title' });
  extendedGeometry.append(node('h3', { id: 'extended-geometry-title' }, 'Геометрия и размещение'));
  advanced.append(extendedGeometry);
  while (holesRow.nextSibling) extendedGeometry.append(holesRow.nextSibling);
  // Move the existing optimization section intact, along with any later controls.
  while (advanced.nextSibling) advanced.append(advanced.nextSibling);

  // Keep sheet margins distinct from the engine's additional edge clearance.
  const marginLabel = $('margin').closest('label');
  if (marginLabel?.firstChild?.nodeType === 3) marginLabel.firstChild.textContent = 'Поля листа';
  $('margin').title = 'Одинаковые поля со всех четырёх сторон листа. Это не зазор между деталями.';
  $('spacing').step = 'any';
  $('rotation').append(node('option', { value: '15' }, 'С шагом 15°'), node('option', { value: 'free' }, 'Свободный поворот'));
  $('rotation').value = '15';
  field(extendedGeometry, 'sheet-count', 'Доступно листов', { value: 0, max: 100000, step: 1 });
  hint(extendedGeometry, '0 — количество листов не ограничено.');
  field(extendedGeometry, 'nest-mode', 'Цель раскроя', { value: 'all', options: [
    ['all', 'Разместить все детали'], ['fill_area', 'Заполнить по площади']
  ] });
  hint(extendedGeometry, 'В режиме заполнения часть деталей может остаться неразмещённой.');
  toggle(extendedGeometry, 'edge-unlinked', 'Отдельный зазор до границы', 'Если выключен, равен зазору между деталями', true);
  field(extendedGeometry, 'edge-spacing', 'Зазор до границы рабочего поля', { value: 0, max: 1000, unit: 'мм' });
  hint(extendedGeometry, 'Поля листа задаются выше отдельно. Зазор до границы рабочего поля не заменяет поля.');
  toggle(extendedGeometry, 'allow-mirror', 'Разрешить зеркальное отражение', 'Для всех деталей; отключите для лицевых материалов');
  // This worker has no allow_holes request flag: nesting inside holes is automatic.
  $('allow-holes').disabled = true;
  $('allow-holes').title = 'Nestbolt автоматически использует отверстия; отдельного переключателя в API нет.';
  const holesDescription = $('allow-holes').closest('.toggle-row')?.querySelector('label span');
  if (holesDescription) holesDescription.textContent = 'Автоматически в движке; при общем резе — без вложения';

  const cutting = details('Рез и заходы');
  toggle(cutting, 'common-line-enabled', 'Общий рез', 'Общие прямые участки реза с учётом ширины реза');
  const commonFields = node('div', { id: 'common-line-fields' });
  field(commonFields, 'common-line-kerf', 'Ширина реза (kerf)', { value: 0.15, min: 0.05, max: 1000, unit: 'мм' });
  toggle(commonFields, 'common-line-search-bonus', 'Искать больше общих резов', 'Часть времени поиска — на совмещение прямых участков');
  hint(commonFields, 'При общем резе расстояние между деталями равно kerf. Сравните экономию реза и расход материала перед резкой.');
  cutting.append(commonFields);
  toggle(cutting, 'lead-in-enabled', 'Припуск на заход', 'Зарезервировать место для начала реза');
  const leadFields = node('div', { id: 'lead-in-fields' });
  field(leadFields, 'lead-in-kerf', 'Ширина реза для захода', { value: 0.15, min: 0.001, max: 1000, unit: 'мм' });
  field(leadFields, 'lead-in-length', 'Длина захода', { value: 3, min: 0.5, max: 50, unit: 'мм' });
  field(leadFields, 'lead-in-style', 'Форма захода', { value: 'line', options: [['line', 'Прямая'], ['arc', 'Дуга']] });
  field(leadFields, 'lead-in-outer-angle', 'Угол внешнего захода', { value: 45, max: 90, unit: '°' });
  field(leadFields, 'lead-in-hole-angle', 'Угол захода в отверстие', { value: 90, max: 90, unit: '°' });
  hint(leadFields, 'Укажите измеренную ширину реза. Для небольших отверстий может потребоваться меньшая длина или ручной старт. Проверяйте экспорт в программе станка.');
  cutting.append(leadFields);

  const search = details('Дополнительный поиск');
  toggle(search, 'quick-start', 'Быстрое начальное размещение', 'Начать с простого раскроя и улучшать его; расход материала может быть выше', true);
  field(search, 'run-seed', 'Seed — начальное число поиска', { value: 1, max: 4294967295, step: 1 });
  toggle(search, 'run-repeatable', 'Повторяемый поиск', 'Одинаковые параметры и seed для повторяемого расчёта');

  const importing = details('Параметры импорта');
  field(importing, 'import-tolerance', 'Допуск аппроксимации', { value: 0, max: 1000, unit: 'мм' });
  hint(importing, '0 — автоматический допуск движка. Параметры применяются только при следующем импорте.');
  toggle(importing, 'import-close-gaps', 'Замыкать небольшие разрывы', 'Не исправляет произвольные открытые контуры');
  field(importing, 'import-gap-limit', 'Максимальный разрыв', { value: 0.1, min: 0.001, max: 1000, unit: 'мм' });
  field(importing, 'import-dxf-unit', 'Единицы DXF', { value: 'auto', options: [['auto', 'Из файла / автоматически'], ['mm', 'Миллиметры'], ['inch', 'Дюймы (25,4 мм)']] });

  // Replace output rather than layering a second, inaccessible input over it.
  const slider = $('time-budget');
  const oldOutput = $('time-output');
  const timeInput = node('input', { id: 'time-output', type: 'number', min: 1, max: 300, step: 1,
    inputmode: 'numeric', required: '', autocomplete: 'off',
    'aria-label': 'Время поиска, секунды', 'aria-describedby': 'settings-time-hint' });
  const timeWrap = node('span', { class: 'time-number-wrap' });
  timeWrap.append(timeInput, node('span', {}, 'сек'));
  if (oldOutput.parentElement.tagName === 'SPAN') oldOutput.parentElement.replaceChildren(timeWrap);
  else oldOutput.replaceWith(timeWrap);
  slider.min = '1';
  slider.max = '300';
  slider.step = '1';
  const timeSection = slider.closest('.settings-section');
  const unlimited = toggle(timeSection, 'time-unlimited', 'Без ограничения времени', 'Остановка после 15 секунд без улучшений проверенной раскладки.', true);
  timeSection.querySelector('.section-heading')?.after(unlimited.parentElement);
  const timeHint = timeSection.querySelector('.smart-tip p') || node('p', { class: 'settings-hint' });
  timeHint.id = 'settings-time-hint';
  timeHint.textContent = 'Лимит поиска — от 1 до 300 секунд.';
  if (!timeHint.parentElement) timeSection.append(timeHint);
  // The old app handler redraws chart history. Time editing must never do that.
  slider.oninput = null;
  let seconds = Math.min(300, Math.max(1, Math.round(Number(slider.value) || 10)));
  function parseTime(value) {
    if (!value.trim()) return null;
    const valueSeconds = Number(value);
    return Number.isInteger(valueSeconds) && valueSeconds >= 1 && valueSeconds <= 300 ? valueSeconds : null;
  }
  function validateTime() {
    const parsed = parseTime(timeInput.value);
    const invalid = parsed === null;
    timeInput.setCustomValidity(invalid ? 'Укажите целое число секунд от 1 до 300.' : '');
    timeInput.classList.toggle('field-invalid', invalid);
    timeInput.setAttribute('aria-invalid', String(invalid));
    return parsed;
  }
  function syncTime(value = slider.value) {
    const n = Number(value);
    seconds = Math.min(300, Math.max(1, Math.round(Number.isFinite(n) ? n : seconds)));
    slider.value = String(seconds);
    timeInput.value = String(seconds);
    slider.setAttribute('aria-valuetext', `${seconds} сек`);
    validateTime();
    presetUI?.refresh();
    return seconds;
  }
  slider.addEventListener('input', () => { if (!locked()) syncTime(slider.value); });
  timeInput.addEventListener('input', () => {
    if (locked()) return;
    const parsed = validateTime();
    if (parsed !== null) {
      seconds = parsed;
      slider.value = String(seconds);
      slider.setAttribute('aria-valuetext', `${seconds} сек`);
    }
  });
  timeInput.addEventListener('change', () => {
    if (locked()) return;
    const parsed = validateTime();
    if (parsed !== null) syncTime(parsed);
  });
  syncTime();
  unlimited.addEventListener('change', () => { if (!locked()) { if (unlimited.checked) syncTime(seconds); updateDependencies(); } });

  function capture() {
    const result = {};
    for (const id of ids) {
      const input = $(id);
      result[id] = input.type === 'checkbox' ? input.checked : id === 'time-budget' ? timeInput.value : input.value;
    }
    return result;
  }
  function updateDependencies() {
    const common = checked('common-line-enabled');
    const lead = checked('lead-in-enabled');
    // Derived worker values are computed in requestExtras(), not written over
    // inactive controls: a full preset must retain every captured input value.
    commonFields.hidden = !common;
    leadFields.hidden = !lead;
    for (const el of root.querySelectorAll('input,select,button')) el.disabled = locked();
    slider.disabled = timeInput.disabled = locked() || unlimited.checked;
    timeHint.parentElement.hidden = unlimited.checked;
    $('allow-holes').disabled = true;
    $('spacing').disabled = locked() || common;
    $('edge-spacing').disabled = locked() || !checked('edge-unlinked');
    $('lead-in-kerf').disabled = locked() || !lead || common;
    commonFields.querySelectorAll('input,select').forEach(el => { el.disabled = locked() || !common; });
    leadFields.querySelectorAll('input,select').forEach(el => { el.disabled = locked() || !lead || (common && el.id === 'lead-in-kerf'); });
    $('import-gap-limit').disabled = locked() || !checked('import-close-gaps');
    presetUI?.refresh();
  }
  function apply(data) {
    if (locked() || !data || typeof data !== 'object') return false;
    if (presetUI) { try {
      const incoming = data.values || data;
      const legacyTime = Object.hasOwn(incoming, 'time-budget') && !Object.hasOwn(incoming, 'time-unlimited');
      data = presetUI.normalize({ ...capture(), ...(legacyTime ? { 'time-unlimited': false } : {}), ...incoming });
    } catch { return false; } }
    const before = capture();
    const values = data.values && typeof data.values === 'object' ? data.values : data;
    for (const id of ids) {
      if (!Object.prototype.hasOwnProperty.call(values, id)) continue;
      const input = $(id);
      const value = values[id];
      if (input.type === 'checkbox') {
        if (typeof value === 'boolean') input.checked = value;
      } else if (typeof value === 'number' || typeof value === 'string') {
        if (input.tagName !== 'SELECT' || [...input.options].some(option => option.value === String(value))) input.value = String(value);
      }
    }
    syncTime(values['time-budget'] ?? slider.value);
    updateDependencies();
    const after = capture();
    if (ids.some(id => before[id] !== after[id])) onDirty();
    return true;
  }
  function requestExtras() {
    const common = checked('common-line-enabled');
    const spacing = common ? number('common-line-kerf') : number('spacing');
    const request = { spacing_mm: spacing, edge_spacing_mm: checked('edge-unlinked') ? number('edge-spacing') : spacing,
      mode: $('nest-mode').value, quick_start: checked('quick-start') };
    if (common) request.common_line = { kerf_mm: number('common-line-kerf'), search_bonus: checked('common-line-search-bonus') };
    if (checked('lead-in-enabled')) request.lead_in = {
      kerf_mm: common ? number('common-line-kerf') : number('lead-in-kerf'),
      length_mm: number('lead-in-length'), style: $('lead-in-style').value,
      outer_angle_degrees: number('lead-in-outer-angle'), hole_angle_degrees: number('lead-in-hole-angle')
    };
    return request;
  }
  function runOptions() { return { seconds: getSeconds(), unlimited: unlimited.checked, seed: number('run-seed'), repeatable: checked('run-repeatable') }; }
  function getSeconds() { return parseTime(timeInput.value) ?? seconds; }
  function importOptions() {
    const options = {};
    if (number('import-tolerance') > 0) options.tolerance = number('import-tolerance');
    if (checked('import-close-gaps')) options.closeGapsMm = number('import-gap-limit');
    const unit = $('import-dxf-unit').value;
    if (unit !== 'auto') options.dxfUnitMm = unit === 'inch' ? 25.4 : 1;
    return options;
  }
  function validate() {
    let first = null;
    validateTime();
    for (const input of root.querySelectorAll('input[type="number"],#time-output')) {
      const invalid = !input.disabled && !input.checkValidity();
      input.classList.toggle('field-invalid', invalid);
      if (invalid && !first) first = input;
    }
    if (first) {
      for (let parent = first.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
      const label = first.labels?.[0]?.querySelector('span')?.textContent || first.getAttribute('aria-label') || 'числовое поле';
      return `Проверьте значение: ${label}.`;
    }
    if (number('margin') * 2 >= Math.min(number('sheet-width'), number('sheet-height'))) return 'Поля листа должны быть меньше половины его ширины и высоты.';
    const edge = requestExtras().edge_spacing_mm;
    if ((number('margin') + edge) * 2 >= Math.min(number('sheet-width'), number('sheet-height'))) return 'Поля и зазор до границы не оставляют рабочего места на листе.';
    return null;
  }
  function setDisabled(value) {
    disabled = Boolean(value);
    updateDependencies();
    $('dialog-content')?.querySelectorAll('[data-settings-dialog] input,[data-settings-dialog] select,[data-settings-dialog] button').forEach(el => { el.disabled = locked(); });
    if ($('preset-allow-holes')) $('preset-allow-holes').disabled = true;
  }
  for (const id of EXTRA_IDS) {
    $(id).addEventListener('change', () => {
      if (locked()) return;
      if (id === 'lead-in-kerf' && checked('common-line-enabled')) $('common-line-kerf').value = $('lead-in-kerf').value;
      updateDependencies();
      onDirty();
    });
  }
  $('spacing').addEventListener('input', () => { if (!locked()) updateDependencies(); });

  const defaults = capture();
  presetUI = setupPresetUI({ root, ids, node, capture, apply, validate, locked, onDirty });
  updateDependencies();
  const { openPresets, captureSelection, restoreSelection, restorePresetSelection } = presetUI;
  const api = { capture, apply, openPresets, captureSelection, restoreSelection, restorePresetSelection, requestExtras, runOptions, setDisabled, getSeconds, syncTime, validate, importOptions,
    reset: () => { apply(defaults); presetUI.restoreDefaultSelection(); },
    sheetCount: () => number('sheet-count') === 0 ? null : number('sheet-count'), mirror: () => checked('allow-mirror') };
  root.nestboltSettings = api;
  return api;
}

/** Optional module-level validation for callers that do not retain setup's API. */
export function validate() { return document.getElementById('settings-content')?.nestboltSettings?.validate() ?? null; }