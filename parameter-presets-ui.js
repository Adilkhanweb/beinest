import { createPresetStore, validPresetName, presetNameKey, newPresetId } from './parameter-presets.js';

/** One library, one compact entry point, and a complete editor generated from live controls. */
export function setupPresetUI({ root, ids, node, capture, apply, validate, locked, onDirty }) {
  const $ = id => document.getElementById(id);
  const defaults = capture(), schema = {};
  for (const id of ids) {
    const input = $(id);
    schema[id] = { type: input.type, options: input.tagName === 'SELECT' ? [...input.options].map(option => option.value) : null,
      min: input.min === '' ? -Infinity : Number(input.min), max: input.max === '' ? Infinity : Number(input.max),
      step: input.step && input.step !== 'any' ? Number(input.step) : null };
  }
  let storage;
  try { storage = globalThis.localStorage; }
  catch { storage = { getItem() { throw new Error('Storage unavailable'); } }; }
  const store = createPresetStore({ defaults, schema, storage });
  let selectedId = store.selectedId || null;
  if (!selectedId && store.items.length === 4 && store.items.every(item => item.builtin)) {
    selectedId = store.items.find(item => ids.every(id => String(item.settings[id]) === String(defaults[id])))?.id || null;
  }
  let baseline = store.items.find(item => item.id === selectedId)?.settings || { ...defaults };
  const section = node('section', { class: 'parameter-preset settings-section', id: 'parameter-preset', 'aria-label': 'Сохранённые параметры' });
  const open = $('material-presets');
  open.className = 'parameter-preset-open';
  open.setAttribute('type', 'button');
  open.setAttribute('aria-haspopup', 'dialog');
  const caption = node('span', { class: 'parameter-preset-caption' }, 'Сохранённые параметры');
  const name = node('span', { class: 'parameter-preset-name', 'data-i18n-ignore': '' });
  open.replaceChildren(caption, name);
  const save = node('button', { id: 'save-parameter-preset', type: 'button', class: 'icon-button parameter-preset-save', title: 'Сохранить изменения', 'aria-label': 'Сохранить изменения' });
  save.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>';
  section.append(open, save); root.prepend(section);
  const nav = document.querySelector('[data-nav="materials"] > span:last-child');
  if (nav) nav.textContent = 'Сохранённые параметры';
  const style = node('link', { rel: 'stylesheet', href: new URL('./parameter-presets.css', import.meta.url).href });
  document.head.append(style);
  const different = () => {
    const current = capture();
    return ids.some(id => String(current[id]) !== String(baseline[id]));
  };
  function refresh() {
    const selected = store.items.find(item => item.id === selectedId);
    name.textContent = selected?.name || 'Без сохранения';
    if (!selected || selected.builtin) name.removeAttribute('data-i18n-ignore'); else name.setAttribute('data-i18n-ignore', '');
    open.disabled = locked();
    save.hidden = !different();
    save.disabled = locked() || Boolean(store.error);
    section.dataset.dirty = String(different());
  }
  const failMessage = 'Не удалось прочитать сохранённые данные. Исходные данные не изменены.';
  function show(title, build) {
    if (locked()) return;
    const dialog = $('app-dialog'), content = $('dialog-content');
    $('dialog-title').textContent = title;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    content.replaceChildren();
    const wrapper = node('div', { 'data-settings-dialog': '' }); content.append(wrapper);
    build(wrapper, dialog);
    if (!dialog.open) dialog.showModal();
  }
  function status(parent, text = '') { const el = node('p', { class: 'management-error', role: 'alert', id: 'management-error' }, text); parent.append(el); return el; }
  function persist(items, selection, error) {
    if (locked()) return false;
    try { store.save(items, selection); selectedId = selection; refresh(); return true; }
    catch { if (error) error.textContent = store.error ? failMessage : 'Не удалось сохранить параметры. Проверьте доступ к хранилищу браузера.'; return false; }
  }
  function select(item, dialog) {
    if (locked() || !apply(item.settings)) return;
    selectedId = item.id; baseline = { ...item.settings };
    // Identity persists, but settings are intentionally never auto-applied on reload.
    try { if (!store.error) store.save(store.items, selectedId); } catch { /* Applying remains useful without writable storage. */ }
    refresh(); onDirty(); dialog.close();
  }
  function openPresets() {
    show('Сохранённые параметры', (wrapper, dialog) => {
      const toolbar = node('div', { class: 'management-toolbar' });
      const add = node('button', { type: 'button', class: 'button primary', id: 'add-parameter-preset' }, 'Сохранить текущие параметры');
      add.disabled = Boolean(store.error); add.onclick = () => edit(); toolbar.append(add); wrapper.append(toolbar);
      if (store.error) { status(wrapper, failMessage); return; }
      const grid = node('div', { class: 'preset-grid management-presets' });
      for (const item of store.items) {
        const cardWrap = node('div', { class: 'management-preset' });
        const card = node('button', { type: 'button', class: 'preset-card', 'data-preset': item.id, 'aria-pressed': String(item.id === selectedId) });
        card.append(node('strong', {}, `${item.settings['sheet-width']} × ${item.settings['sheet-height']} мм`), node('span', item.builtin ? {} : { 'data-i18n-ignore': '' }, item.name));
        card.onclick = () => select(item, dialog);
        const actions = node('div', { class: 'management-row-actions' });
        const editButton = node('button', { type: 'button', class: 'button secondary', 'data-edit-preset': item.id }, 'Изменить');
        const remove = node('button', { type: 'button', class: 'button secondary danger-button', 'data-delete-preset': item.id }, 'Удалить');
        editButton.onclick = () => edit(item); remove.onclick = () => confirmDelete(item); actions.append(editButton, remove);
        cardWrap.append(card, actions); grid.append(cardWrap);
      }
      wrapper.append(grid);
      if (!store.items.length) wrapper.append(node('p', {}, 'Сохранённых параметров пока нет.'));
    });
  }
  function confirmDelete(item) {
    show('Удалить параметры?', wrapper => {
      wrapper.append(node('p', { class: 'management-item-name', 'data-i18n-ignore': '' }, item.name), node('p', {}, 'Текущие параметры останутся без изменений.'));
      const error = status(wrapper), actions = node('div', { class: 'dialog-actions' });
      const cancel = node('button', { type: 'button', class: 'button secondary', id: 'cancel-management' }, 'Отмена');
      const confirm = node('button', { type: 'button', class: 'button danger-button', id: 'confirm-delete' }, 'Удалить');
      cancel.onclick = openPresets;
      confirm.onclick = () => {
        if (persist(store.items.filter(preset => preset.id !== item.id), selectedId === item.id ? null : selectedId, error)) {
          if (!selectedId) baseline = { ...defaults };
          refresh(); onDirty(); openPresets();
        }
      };
      actions.append(cancel, confirm); wrapper.append(actions); cancel.focus();
    });
  }
  function edit(item = null, initial = null) {
    if (locked() || store.error) return;
    const snapshot = initial || item?.settings || capture();
    show(item ? 'Изменить параметры' : 'Сохранить параметры', (wrapper, dialog) => {
      const form = node('form', { id: 'parameter-preset-form', novalidate: '' });
      const label = node('label', { class: 'dialog-label', for: 'parameter-preset-name' }, 'Название параметров');
      const nameInput = node('input', { id: 'parameter-preset-name', class: 'dialog-input', maxlength: 80, required: '', autocomplete: 'off', 'data-i18n-ignore': '' });
      nameInput.value = item?.name || '';
      const replace = node('button', { type: 'button', class: 'text-button preset-replace-current' }, 'Заменить текущими параметрами');
      const details = node('details', { class: 'preset-editor-details', open: '' });
      details.append(node('summary', {}, 'Все параметры'));
      const fields = node('div', { class: 'preset-editor-fields' }), editors = new Map();
      for (const id of ids) {
        const source = $(id === 'time-budget' ? 'time-output' : id);
        const control = source.cloneNode(true);
        control.id = `preset-${id}`; control.disabled = false; control.removeAttribute('aria-describedby'); control.removeAttribute('aria-invalid');
        if (id === 'allow-holes') control.disabled = true; // Informational: the worker always uses holes automatically.
        control.classList.remove('field-invalid');
        const sourceLabel = $(id).labels?.[0];
        let text = sourceLabel?.childNodes[0]?.textContent?.trim() || source.getAttribute('aria-label') || id;
        if (id === 'time-budget') text = 'Время поиска, секунды';
        const row = node('label', { class: `preset-editor-field${source.type === 'checkbox' ? ' preset-editor-toggle' : ''}`, for: control.id });
        row.append(node('span', {}, text), control); fields.append(row); editors.set(id, control);
      }
      const fill = values => { for (const [id, input] of editors) { if (input.type === 'checkbox') input.checked = values[id]; else input.value = values[id]; } };
      fill(snapshot);
      replace.onclick = () => { if (!locked()) fill(capture()); };
      details.append(fields);
      const error = status(form), actions = node('div', { class: 'dialog-actions' });
      const cancel = node('button', { type: 'button', class: 'button secondary', id: 'cancel-management' }, 'Отмена');
      const submit = node('button', { type: 'submit', class: 'button primary', id: 'save-preset' }, 'Сохранить');
      cancel.onclick = openPresets; actions.append(cancel, submit);
      form.prepend(label, nameInput, replace, details); form.append(actions); wrapper.append(form);
      form.onsubmit = event => {
        event.preventDefault(); if (locked()) return;
        const nextName = nameInput.value.trim();
        if (!validPresetName(nextName)) { error.textContent = 'Название должно содержать от 1 до 80 символов.'; nameInput.focus(); return; }
        if (store.items.some(preset => preset.id !== item?.id && presetNameKey(preset.name) === presetNameKey(nextName))) { error.textContent = 'Параметры с таким названием уже существуют.'; nameInput.focus(); return; }
        const values = {};
        for (const [id, input] of editors) {
          values[id] = input.type === 'checkbox' ? input.checked : input.value;
          if (!input.checkValidity()) { details.open = true; input.reportValidity(); return; }
        }
        let settings;
        try { settings = store.normalize(values); } catch { error.textContent = 'Проверьте значения параметров и рабочую область листа.'; return; }
        const record = { id: item?.id || newPresetId(), name: nextName, settings, builtin: false };
        const next = item ? store.items.map(preset => preset.id === item.id ? record : preset) : [...store.items, record];
        // A new snapshot is selected only when it matches the live panel; editing never silently applies it.
        const matches = ids.every(id => String(settings[id]) === String(capture()[id]));
        if (!persist(next, matches ? record.id : selectedId, error)) return;
        if (selectedId === record.id) baseline = { ...settings };
        refresh(); onDirty(); openPresets();
      };
      requestAnimationFrame(() => nameInput.focus());
    });
  }
  open.onclick = openPresets;
  save.onclick = () => {
    if (locked() || store.error) return;
    const selected = store.items.find(item => item.id === selectedId), error = validate();
    if (error) { show('Сохранить параметры', wrapper => status(wrapper, error)); return; }
    if (!selected) { edit(null, capture()); return; }
    let settings;
    try { settings = store.normalize(capture()); } catch { return; }
    const updated = { ...selected, settings, builtin: false };
    if (persist(store.items.map(item => item.id === selected.id ? updated : item), selectedId)) { baseline = { ...settings }; refresh(); onDirty(); }
  };
  root.addEventListener('input', refresh); root.addEventListener('change', refresh);
  function restoreSelection(metadata) {
    const id = typeof metadata === 'string' ? metadata : metadata?.selectedId;
    const selected = store.items.find(item => item.id === id);
    selectedId = selected?.id || null;
    try { baseline = metadata?.baseline ? store.normalize(metadata.baseline) : { ...(selected?.settings || defaults) }; }
    catch { baseline = { ...(selected?.settings || defaults) }; }
    refresh();
  }
  refresh();
  return { openPresets, refresh, normalize: store.normalize, captureSelection: () => ({ selectedId, baseline: { ...baseline } }), restoreSelection,
    restorePresetSelection: id => restoreSelection(id) };
}