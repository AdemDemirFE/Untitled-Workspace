import { h, formatPrice, applyPrimaryColor } from './shared.js';

const $ = (id) => document.getElementById(id);
const TAG_PRESETS = ['vegan', 'vejetaryen', 'acı', 'glutensiz', 'yeni'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ROUTES = { urunler: 'items', kategoriler: 'categories', ayarlar: 'settings', qr: 'qr' };

// ---------------------------------------------------------------------------
// API client: one place that talks to the server and turns failures into
// readable Turkish messages.
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = 'GET', body, form } = {}) {
  const init = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (res.status === 401 && path !== '/api/auth/login') {
    showLogin('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
    throw new ApiError(401, 'Oturumunuz sona erdi.');
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `İşlem başarısız oldu (${res.status}).`);
  return data;
}

// ---------------------------------------------------------------------------
// State. Server data is refetched after every change so there is one source
// of truth; the rest is UI state for this page.
// ---------------------------------------------------------------------------

const state = {
  settings: null,
  categories: [],
  items: [],
  view: 'items',
  filter: '', // '' = all categories
  editingItemId: null, // null = editor closed, 'new' = creating
  draftImageUrl: '',
  draftLogoUrl: '',
  uploading: false,
  confirmItemId: null,
  confirmCategoryId: null,
  editingCategoryId: null,
  rowErrors: new Map(), // record id -> message shown on its row
};

/** Element to focus after the next render, by its data-focus key. */
let pendingFocus = null;

function restoreFocus(fallback) {
  if (!pendingFocus) return;
  const key = pendingFocus;
  pendingFocus = null;
  const el = document.querySelector(`[data-focus="${CSS.escape(key)}"]`);
  if (el && !el.disabled) el.focus();
  else fallback?.focus();
}

const flashTimers = new WeakMap();
function flash(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  clearTimeout(flashTimers.get(el));
  if (!isError) {
    flashTimers.set(
      el,
      setTimeout(() => {
        if (el.textContent === message) el.textContent = '';
      }, 5000),
    );
  }
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

const byOrder = (a, b) => a.sortOrder - b.sortOrder;
const currency = () => state.settings?.currency || '₺';

// ---------------------------------------------------------------------------
// Login / session
// ---------------------------------------------------------------------------

function showLogin(notice = '') {
  $('app-view').hidden = true;
  $('login-view').hidden = false;
  showError($('login-error'), '');
  $('login-notice').textContent = notice;
  $('login-notice').hidden = !notice;
  $('password').value = '';
  $('password').focus();
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('password').value;
  const button = event.submitter || $('login-form').querySelector('button');
  if (!password) {
    showError($('login-error'), 'Şifre boş bırakılamaz.');
    $('password').setAttribute('aria-invalid', 'true');
    $('password').focus();
    return;
  }
  button.disabled = true;
  try {
    await api('/api/auth/login', { method: 'POST', body: { password } });
    $('password').removeAttribute('aria-invalid');
    await enterApp();
  } catch (err) {
    showError($('login-error'), err.message);
    $('password').setAttribute('aria-invalid', 'true');
    $('password').select();
  } finally {
    button.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // The cookie is cleared server-side when reachable; show the login either way.
  }
  closeItemEditor({ restore: false });
  showLogin('Çıkış yaptınız.');
});

async function enterApp() {
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  await loadAll();
  route({ focus: false });
}

async function loadAll() {
  showError($('load-error'), '');
  try {
    const [settings, categories, items] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/admin/categories'),
      api('/api/admin/items'),
    ]);
    Object.assign(state, { settings, categories, items });
    applySettings();
    renderSettingsForm();
    renderAll();
  } catch (err) {
    if (err.status !== 401) showError($('load-error'), `Veriler yüklenemedi: ${err.message}`);
  }
}

/** Refetches categories and items after a change. */
async function refresh() {
  const [categories, items] = await Promise.all([api('/api/admin/categories'), api('/api/admin/items')]);
  state.categories = categories;
  state.items = items;
  renderAll();
}

function renderAll() {
  if (state.filter && !state.categories.some((c) => c.id === state.filter)) state.filter = '';
  renderCategoryOptions();
  renderItems({ restore: false });
  renderCategories({ restore: false });
  restoreFocus($(`h-${state.view}`));
}

function applySettings() {
  applyPrimaryColor(state.settings.primaryColor);
  $('brand-name').textContent = state.settings.restaurantName;
}

// ---------------------------------------------------------------------------
// Routing between the four sections (#urunler, #kategoriler, #ayarlar, #qr)
// ---------------------------------------------------------------------------

function route({ focus = true } = {}) {
  const view = ROUTES[location.hash.slice(1)] || 'items';
  state.view = view;
  for (const name of Object.values(ROUTES)) $(`view-${name}`).hidden = name !== view;
  for (const link of document.querySelectorAll('.admin-nav-list a')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (view === 'qr') loadQr();
  if (focus) $(`h-${view}`).focus();
}

window.addEventListener('hashchange', () => route());

// ---------------------------------------------------------------------------
// Shared row controls
// ---------------------------------------------------------------------------

function toggle(label, checked, focusKey, accessibleSuffix, onChange) {
  return h(
    'label',
    { class: 'check' },
    h('input', {
      type: 'checkbox',
      checked,
      'aria-label': `${label} – ${accessibleSuffix}`,
      dataset: { focus: focusKey },
      onchange: (event) => onChange(event.target.checked),
    }),
    label,
  );
}

function moveButton(direction, name, disabled, focusKey, onClick) {
  return h(
    'button',
    {
      class: 'btn btn-sm icon-btn',
      type: 'button',
      disabled,
      'aria-label': `${name}: ${direction === 'up' ? 'yukarı taşı' : 'aşağı taşı'}`,
      dataset: { focus: focusKey },
      onclick: onClick,
    },
    h('span', { 'aria-hidden': 'true' }, direction === 'up' ? '↑' : '↓'),
  );
}

function confirmBox(message, confirmLabel, focusKey, onConfirm, onCancel) {
  const box = h(
    'div',
    { class: 'confirm', role: 'group', 'aria-label': 'Silme onayı' },
    h('p', {}, message),
    h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: onConfirm }, confirmLabel),
    h('button', { class: 'btn btn-sm', type: 'button', dataset: { focus: focusKey }, onclick: onCancel }, 'Vazgeç'),
  );
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') onCancel();
  });
  return box;
}

function rowError(id) {
  const message = state.rowErrors.get(id);
  return message ? h('p', { class: 'alert alert-error row-error', role: 'alert' }, message) : null;
}

/** Runs a change, refetches, and reports errors on the record's row. */
async function mutate(id, task, { flashEl, success, focus }) {
  pendingFocus = focus;
  try {
    await task();
    state.rowErrors.delete(id);
    await refresh();
    if (success) flash(flashEl, success);
  } catch (err) {
    if (err.status === 401) return;
    state.rowErrors.set(id, err.message);
    renderAll();
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function renderCategoryOptions() {
  const filter = $('item-filter');
  filter.replaceChildren(
    h('option', { value: '' }, 'Tüm kategoriler'),
    ...state.categories.map((c) => h('option', { value: c.id }, c.isVisible ? c.name : `${c.name} (gizli)`)),
  );
  filter.value = state.filter;

  const select = $('item-category');
  const current = select.value;
  select.replaceChildren(...state.categories.map((c) => h('option', { value: c.id }, c.name)));
  if (state.categories.some((c) => c.id === current)) select.value = current;

  $('new-item').disabled = state.categories.length === 0;
}

function itemRow(item, index, siblings) {
  const key = (action) => `${action}:${item.id}`;
  return h(
    'li',
    { class: item.isAvailable ? 'row' : 'row is-off' },
    item.imageUrl
      ? h('img', { class: 'thumb', loading: 'lazy', src: item.imageUrl, alt: '' })
      : h('div', { class: 'thumb', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'row-main' },
      h('p', { class: 'row-title' }, item.name),
      h(
        'p',
        { class: 'row-meta' },
        h('span', { class: 'row-price' }, formatPrice(item.price, currency())),
        !item.isAvailable && h('span', { class: 'pill pill-warn' }, 'Tükendi'),
        item.isFeatured && h('span', { class: 'pill pill-primary' }, 'Öne çıkan'),
        item.tags.length > 0 && h('span', {}, item.tags.join(', ')),
      ),
    ),
    h(
      'div',
      { class: 'row-toggles' },
      toggle('Satışta', item.isAvailable, key('available'), item.name, (value) =>
        mutate(item.id, () => api(`/api/admin/items/${item.id}`, { method: 'PUT', body: { isAvailable: value } }), {
          flashEl: $('items-flash'),
          success: value ? `“${item.name}” yeniden satışta.` : `“${item.name}” tükendi olarak işaretlendi.`,
          focus: key('available'),
        }),
      ),
      toggle('Öne çıkan', item.isFeatured, key('featured'), item.name, (value) =>
        mutate(item.id, () => api(`/api/admin/items/${item.id}`, { method: 'PUT', body: { isFeatured: value } }), {
          flashEl: $('items-flash'),
          success: value ? `“${item.name}” öne çıkarıldı.` : `“${item.name}” artık öne çıkan değil.`,
          focus: key('featured'),
        }),
      ),
    ),
    h(
      'div',
      { class: 'row-actions' },
      moveButton('up', item.name, index === 0, key('up'), () => moveItem(item, siblings, -1)),
      moveButton('down', item.name, index === siblings.length - 1, key('down'), () => moveItem(item, siblings, 1)),
      h(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          'aria-label': `Düzenle: ${item.name}`,
          dataset: { focus: key('edit') },
          onclick: () => openItemEditor(item),
        },
        'Düzenle',
      ),
      h(
        'button',
        {
          class: 'btn btn-sm btn-ghost',
          type: 'button',
          dataset: { focus: key('delete') },
          onclick: () => {
            state.confirmItemId = item.id;
            pendingFocus = key('cancel');
            renderItems();
          },
          'aria-label': `Sil: ${item.name}`,
        },
        'Sil',
      ),
    ),
    rowError(item.id),
    state.confirmItemId === item.id &&
      confirmBox(
        `“${item.name}” silinsin mi? Bu işlem geri alınamaz.`,
        'Evet, sil',
        key('cancel'),
        () => deleteItem(item),
        () => {
          state.confirmItemId = null;
          pendingFocus = key('delete');
          renderItems();
        },
      ),
  );
}

function renderItems({ restore = true } = {}) {
  const list = $('item-list');
  const groups = state.filter ? state.categories.filter((c) => c.id === state.filter) : state.categories;
  if (state.categories.length === 0) {
    list.replaceChildren(
      h('p', { class: 'empty' }, 'Ürün eklemeden önce bir kategori oluşturun. ', h('a', { href: '#kategoriler' }, 'Kategorilere git')),
    );
    if (restore) restoreFocus($('h-items'));
    return;
  }
  list.replaceChildren(
    ...groups.map((category) => {
      const items = state.items.filter((i) => i.categoryId === category.id).sort(byOrder);
      const headingId = `grup-${category.id}`;
      return h(
        'section',
        { 'aria-labelledby': headingId },
        h(
          'h2',
          { class: 'group-title', id: headingId },
          category.name,
          !category.isVisible && h('span', { class: 'pill' }, 'Menüde gizli'),
        ),
        items.length > 0
          ? h('ul', { class: 'rows' }, items.map((item, index) => itemRow(item, index, items)))
          : h('p', { class: 'empty' }, 'Bu kategoride henüz ürün yok.'),
      );
    }),
  );
  if (restore) restoreFocus($('h-items'));
}

function moveItem(item, siblings, delta) {
  const ids = siblings.map((i) => i.id);
  const from = ids.indexOf(item.id);
  const to = from + delta;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const action = delta < 0 ? 'up' : 'down';
  // If the item reaches the end, its button disables; focus the other one instead.
  const atEdge = to === 0 || to === ids.length - 1;
  mutate(item.id, () => api('/api/admin/reorder', { method: 'PUT', body: { type: 'items', ids } }), {
    focus: `${atEdge ? (action === 'up' ? 'down' : 'up') : action}:${item.id}`,
  });
}

async function deleteItem(item) {
  state.confirmItemId = null;
  if (state.editingItemId === item.id) closeItemEditor({ restore: false });
  pendingFocus = null;
  try {
    await api(`/api/admin/items/${item.id}`, { method: 'DELETE' });
    state.rowErrors.delete(item.id);
    await refresh();
    flash($('items-flash'), `“${item.name}” silindi.`);
    $('h-items').focus();
  } catch (err) {
    if (err.status === 401) return;
    state.rowErrors.set(item.id, err.message);
    pendingFocus = `delete:${item.id}`;
    renderItems();
  }
}

$('item-filter').addEventListener('change', (event) => {
  state.filter = event.target.value;
  renderItems();
});

// ---- Item editor ----

const tagPresetBox = $('item-tag-presets');
tagPresetBox.append(
  ...TAG_PRESETS.map((tag) => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: tag }), tag)),
);

let editorReturnFocus = null;

function setPreview(box, url, removeButton) {
  box.replaceChildren(url ? h('img', { src: url, alt: '' }) : '');
  removeButton.hidden = !url;
}

function openItemEditor(item = null) {
  editorReturnFocus = item ? `edit:${item.id}` : 'new-item';
  state.editingItemId = item ? item.id : 'new';
  const form = $('item-form');
  form.reset();
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  showError($('item-form-error'), '');
  $('item-image-status').textContent = '';

  $('item-editor-title').textContent = item ? `Ürünü düzenle: ${item.name}` : 'Yeni ürün';
  $('item-name').value = item?.name ?? '';
  $('item-category').value = item?.categoryId ?? (state.filter || state.categories[0]?.id || '');
  $('item-price').value = item ? String(item.price).replace('.', ',') : '';
  $('item-description').value = item?.description ?? '';
  $('item-allergens').value = item?.allergens ?? '';
  $('item-available').checked = item?.isAvailable ?? true;
  $('item-featured').checked = item?.isFeatured ?? false;

  const tags = item?.tags ?? [];
  const lower = (t) => t.toLocaleLowerCase('tr');
  for (const box of tagPresetBox.querySelectorAll('input')) box.checked = tags.some((t) => lower(t) === box.value);
  $('item-tags-extra').value = tags.filter((t) => !TAG_PRESETS.includes(lower(t))).join(', ');

  state.draftImageUrl = item?.imageUrl ?? '';
  setPreview($('item-image-preview'), state.draftImageUrl, $('item-image-remove'));

  $('item-editor').hidden = false;
  $('item-editor').scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('item-name').focus({ preventScroll: true });
}

function closeItemEditor({ restore = true } = {}) {
  state.editingItemId = null;
  $('item-editor').hidden = true;
  if (restore && editorReturnFocus) {
    const target =
      editorReturnFocus === 'new-item'
        ? $('new-item')
        : document.querySelector(`[data-focus="${CSS.escape(editorReturnFocus)}"]`);
    (target || $('h-items')).focus();
  }
  editorReturnFocus = null;
}

function invalid(field, message) {
  field.setAttribute('aria-invalid', 'true');
  field.focus();
  return message;
}

/** Client-side check for quick feedback; the server validates again. */
function readItemForm() {
  for (const el of $('item-form').querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  const name = $('item-name').value.trim();
  if (!name) return { error: invalid($('item-name'), 'Ürün adı boş bırakılamaz.') };
  const categoryId = $('item-category').value;
  if (!categoryId) return { error: invalid($('item-category'), 'Bir kategori seçin.') };
  const rawPrice = $('item-price').value.trim();
  if (!rawPrice) return { error: invalid($('item-price'), 'Fiyat zorunludur.') };
  const price = Number(rawPrice.replace(',', '.'));
  if (!Number.isFinite(price) || price < 0) {
    return { error: invalid($('item-price'), 'Fiyat 0 veya daha büyük bir sayı olmalıdır (örn. 89,90).') };
  }
  const extra = $('item-tags-extra').value.split(',').map((t) => t.trim()).filter(Boolean);
  const presets = [...tagPresetBox.querySelectorAll('input:checked')].map((box) => box.value);
  return {
    body: {
      name,
      categoryId,
      price,
      description: $('item-description').value.trim(),
      imageUrl: state.draftImageUrl,
      tags: [...presets, ...extra],
      allergens: $('item-allergens').value.trim(),
      isAvailable: $('item-available').checked,
      isFeatured: $('item-featured').checked,
    },
  };
}

// A field stops being marked invalid as soon as the user edits it.
document.addEventListener('input', (event) => {
  if (event.target.getAttribute?.('aria-invalid') === 'true') event.target.removeAttribute('aria-invalid');
});

$('new-item').addEventListener('click', () => openItemEditor());
$('item-cancel').addEventListener('click', () => closeItemEditor());
$('item-editor').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeItemEditor();
});

$('item-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.uploading) return;
  const { body, error } = readItemForm();
  if (error) {
    showError($('item-form-error'), error);
    return;
  }
  const isNew = state.editingItemId === 'new';
  const submit = $('item-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const saved = await api(isNew ? '/api/admin/items' : `/api/admin/items/${state.editingItemId}`, {
      method: isNew ? 'POST' : 'PUT',
      body,
    });
    editorReturnFocus = `edit:${saved.id}`;
    state.rowErrors.delete(saved.id);
    await refresh();
    closeItemEditor();
    flash($('items-flash'), isNew ? `“${saved.name}” eklendi.` : `“${saved.name}” kaydedildi.`);
  } catch (err) {
    if (err.status !== 401) showError($('item-form-error'), err.message);
  } finally {
    submit.disabled = false;
  }
});

// ---- Image uploads (item image and logo) ----

async function uploadImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new ApiError(400, 'Yalnızca JPG, PNG veya WEBP görsel yükleyebilirsiniz.');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'Görsel en fazla 2 MB olabilir.');
  const form = new FormData();
  form.append('file', file);
  const { url } = await api('/api/admin/upload', { method: 'POST', form });
  return url;
}

function wireImagePicker({ input, preview, removeButton, status, errorEl, submit, getUrl, setUrl }) {
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again fires change
    if (!file) return;
    showError(errorEl, '');
    status.textContent = 'Görsel yükleniyor…';
    state.uploading = true;
    submit.disabled = true;
    try {
      setUrl(await uploadImage(file));
      setPreview(preview, getUrl(), removeButton);
      status.textContent = 'Görsel yüklendi. Kaydetmeyi unutmayın.';
    } catch (err) {
      status.textContent = '';
      if (err.status !== 401) showError(errorEl, err.message);
    } finally {
      state.uploading = false;
      submit.disabled = false;
    }
  });
  removeButton.addEventListener('click', () => {
    setUrl('');
    setPreview(preview, '', removeButton);
    status.textContent = 'Görsel kaldırıldı. Kaydetmeyi unutmayın.';
    input.focus();
  });
}

wireImagePicker({
  input: $('item-image'),
  preview: $('item-image-preview'),
  removeButton: $('item-image-remove'),
  status: $('item-image-status'),
  errorEl: $('item-form-error'),
  submit: $('item-form').querySelector('[type="submit"]'),
  getUrl: () => state.draftImageUrl,
  setUrl: (url) => {
    state.draftImageUrl = url;
  },
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categoryRow(category, index) {
  const key = (action) => `cat-${action}:${category.id}`;
  const count = category.itemCount ?? 0;

  if (state.editingCategoryId === category.id) {
    const nameId = `cat-name-${category.id}`;
    const descId = `cat-desc-${category.id}`;
    const nameInput = h('input', { id: nameId, type: 'text', maxlength: 60, value: category.name, required: true, dataset: { focus: key('name') } });
    const descInput = h('input', { id: descId, type: 'text', maxlength: 200, value: category.description });
    const cancel = () => {
      state.editingCategoryId = null;
      state.rowErrors.delete(category.id);
      pendingFocus = key('edit');
      renderCategories();
    };
    const form = h(
      'form',
      {
        class: 'row-edit',
        novalidate: true,
        'aria-label': `${category.name} kategorisini düzenle`,
        onsubmit: (event) => {
          event.preventDefault();
          const name = nameInput.value.trim();
          if (!name) {
            state.rowErrors.set(category.id, 'Kategori adı boş bırakılamaz.');
            pendingFocus = key('name');
            renderCategories();
            return;
          }
          state.editingCategoryId = null;
          mutate(
            category.id,
            () => api(`/api/admin/categories/${category.id}`, { method: 'PUT', body: { name, description: descInput.value.trim() } }),
            { flashEl: $('categories-flash'), success: `“${name}” kaydedildi.`, focus: key('edit') },
          ).then(() => {
            // Keep the form open if the server rejected the change.
            if (state.rowErrors.has(category.id)) {
              state.editingCategoryId = category.id;
              renderCategories();
            }
          });
        },
        onkeydown: (event) => {
          if (event.key === 'Escape') cancel();
        },
      },
      h(
        'div',
        { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', { for: nameId }, 'Kategori adı'), nameInput),
        h('div', { class: 'field' }, h('label', { for: descId }, 'Açıklama'), descInput),
      ),
      rowError(category.id),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Kaydet'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: cancel }, 'Vazgeç'),
      ),
    );
    return h('li', { class: 'row' }, form);
  }

  return h(
    'li',
    { class: category.isVisible ? 'row' : 'row is-off' },
    h(
      'div',
      { class: 'row-main' },
      h('p', { class: 'row-title' }, category.name),
      h(
        'p',
        { class: 'row-meta' },
        h('span', {}, `${count} ürün`),
        !category.isVisible && h('span', { class: 'pill' }, 'Menüde gizli'),
        category.description && h('span', {}, category.description),
      ),
    ),
    h(
      'div',
      { class: 'row-toggles' },
      toggle('Menüde görünsün', category.isVisible, key('visible'), category.name, (value) =>
        mutate(category.id, () => api(`/api/admin/categories/${category.id}`, { method: 'PUT', body: { isVisible: value } }), {
          flashEl: $('categories-flash'),
          success: value ? `“${category.name}” menüde gösteriliyor.` : `“${category.name}” menüden gizlendi.`,
          focus: key('visible'),
        }),
      ),
    ),
    h(
      'div',
      { class: 'row-actions' },
      moveButton('up', category.name, index === 0, key('up'), () => moveCategory(category, -1)),
      moveButton('down', category.name, index === state.categories.length - 1, key('down'), () => moveCategory(category, 1)),
      h(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          dataset: { focus: key('edit') },
          onclick: () => {
            state.editingCategoryId = category.id;
            state.confirmCategoryId = null;
            state.rowErrors.delete(category.id);
            pendingFocus = key('name');
            renderCategories();
          },
          'aria-label': `Düzenle: ${category.name}`,
        },
        'Düzenle',
      ),
      h(
        'button',
        {
          class: 'btn btn-sm btn-ghost',
          type: 'button',
          dataset: { focus: key('delete') },
          onclick: () => {
            state.confirmCategoryId = category.id;
            state.rowErrors.delete(category.id);
            pendingFocus = key('cancel');
            renderCategories();
          },
          'aria-label': `Sil: ${category.name}`,
        },
        'Sil',
      ),
    ),
    rowError(category.id),
    state.confirmCategoryId === category.id &&
      confirmBox(
        `“${category.name}” kategorisi silinsin mi?`,
        'Evet, sil',
        key('cancel'),
        () => deleteCategory(category),
        () => {
          state.confirmCategoryId = null;
          pendingFocus = key('delete');
          renderCategories();
        },
      ),
  );
}

function renderCategories({ restore = true } = {}) {
  const list = $('category-list');
  if (state.categories.length === 0) {
    list.replaceChildren(h('li', { class: 'empty' }, 'Henüz kategori yok. Yukarıdaki formdan ilk kategorinizi ekleyin.'));
  } else {
    list.replaceChildren(...state.categories.map((category, index) => categoryRow(category, index)));
  }
  if (restore) restoreFocus($('h-categories'));
}

function moveCategory(category, delta) {
  const ids = state.categories.map((c) => c.id);
  const from = ids.indexOf(category.id);
  const to = from + delta;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const action = delta < 0 ? 'up' : 'down';
  const atEdge = to === 0 || to === ids.length - 1;
  mutate(category.id, () => api('/api/admin/reorder', { method: 'PUT', body: { type: 'categories', ids } }), {
    focus: `cat-${atEdge ? (action === 'up' ? 'down' : 'up') : action}:${category.id}`,
  });
}

async function deleteCategory(category) {
  state.confirmCategoryId = null;
  try {
    await api(`/api/admin/categories/${category.id}`, { method: 'DELETE' });
    state.rowErrors.delete(category.id);
    await refresh();
    flash($('categories-flash'), `“${category.name}” silindi.`);
    $('h-categories').focus();
  } catch (err) {
    if (err.status === 401) return;
    state.rowErrors.set(category.id, err.message);
    pendingFocus = `cat-delete:${category.id}`;
    renderCategories();
  }
}

$('category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const nameInput = $('category-name');
  const name = nameInput.value.trim();
  nameInput.removeAttribute('aria-invalid');
  if (!name) {
    showError($('category-form-error'), invalid(nameInput, 'Kategori adı boş bırakılamaz.'));
    return;
  }
  const submit = event.submitter || $('category-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/admin/categories', {
      method: 'POST',
      body: { name, description: $('category-description').value.trim(), isVisible: $('category-visible').checked },
    });
    showError($('category-form-error'), '');
    $('category-form').reset();
    await refresh();
    flash($('categories-flash'), `“${name}” eklendi.`);
    nameInput.focus();
  } catch (err) {
    if (err.status !== 401) showError($('category-form-error'), err.message);
  } finally {
    submit.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function renderSettingsForm() {
  const s = state.settings;
  $('settings-name').value = s.restaurantName;
  $('settings-description').value = s.description;
  $('settings-currency').value = s.currency;
  $('settings-color').value = s.primaryColor;
  $('settings-color-value').textContent = s.primaryColor;
  state.draftLogoUrl = s.logoUrl;
  setPreview($('settings-logo-preview'), s.logoUrl, $('settings-logo-remove'));
}

$('settings-color').addEventListener('input', (event) => {
  $('settings-color-value').textContent = event.target.value;
});

wireImagePicker({
  input: $('settings-logo'),
  preview: $('settings-logo-preview'),
  removeButton: $('settings-logo-remove'),
  status: $('settings-logo-status'),
  errorEl: $('settings-error'),
  submit: $('settings-form').querySelector('[type="submit"]'),
  getUrl: () => state.draftLogoUrl,
  setUrl: (url) => {
    state.draftLogoUrl = url;
  },
});

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.uploading) return;
  for (const el of $('settings-form').querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  const restaurantName = $('settings-name').value.trim();
  const currencyValue = $('settings-currency').value.trim();
  if (!restaurantName) {
    showError($('settings-error'), invalid($('settings-name'), 'Restoran adı boş bırakılamaz.'));
    return;
  }
  if (!currencyValue) {
    showError($('settings-error'), invalid($('settings-currency'), 'Para birimi boş bırakılamaz.'));
    return;
  }
  const submit = event.submitter || $('settings-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    state.settings = await api('/api/admin/settings', {
      method: 'PUT',
      body: {
        restaurantName,
        description: $('settings-description').value.trim(),
        logoUrl: state.draftLogoUrl,
        currency: currencyValue,
        primaryColor: $('settings-color').value,
      },
    });
    showError($('settings-error'), '');
    $('settings-logo-status').textContent = '';
    applySettings();
    renderSettingsForm();
    renderItems(); // prices use the currency
    flash($('settings-flash'), 'Ayarlar kaydedildi.');
  } catch (err) {
    if (err.status !== 401) showError($('settings-error'), err.message);
  } finally {
    submit.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// QR code
// ---------------------------------------------------------------------------

let menuUrl = '';

async function loadQr() {
  showError($('qr-error'), '');
  $('qr-print-name').textContent = state.settings?.restaurantName ?? '';
  const img = $('qr-image');
  img.onerror = () => showError($('qr-error'), 'QR kod yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
  img.src = `/api/admin/qr?format=svg&t=${Date.now()}`;
  try {
    ({ url: menuUrl } = await api('/api/admin/qr?format=json'));
    $('qr-url').textContent = menuUrl;
    $('qr-open').href = menuUrl;
  } catch (err) {
    if (err.status !== 401) showError($('qr-error'), err.message);
  }
}

$('qr-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(menuUrl);
    flash($('qr-flash'), 'Adres kopyalandı.');
  } catch {
    flash($('qr-flash'), 'Kopyalanamadı. Adresi elle seçip kopyalayın.', true);
  }
});

$('qr-print').addEventListener('click', () => window.print());

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function boot() {
  try {
    const me = await api('/api/auth/me');
    if (me.authenticated) await enterApp();
    else showLogin();
  } catch (err) {
    showLogin(err.message);
  } finally {
    $('boot').hidden = true;
  }
}

boot();
