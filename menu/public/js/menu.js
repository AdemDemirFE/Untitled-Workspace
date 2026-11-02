import { h, formatPrice, applyPrimaryColor, normalizeSearch, tagTone } from './shared.js';

const $ = (id) => document.getElementById(id);
const els = {
  main: $('menu-content'),
  name: $('restaurant-name'),
  desc: $('restaurant-desc'),
  logo: $('logo'),
  toolbar: $('toolbar'),
  search: $('search'),
  tabs: $('tabs'),
  loading: $('loading'),
  message: $('message'),
  messageTitle: $('message-title'),
  messageText: $('message-text'),
  messageAction: $('message-action'),
  sections: $('sections'),
  status: $('search-status'),
  footer: $('footer-text'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** One entry per rendered category: its section, its tab and its item cards. */
let entries = [];
let activeEntry = null;

function showMessage(title, text, action) {
  els.messageTitle.textContent = title;
  els.messageText.textContent = text;
  els.messageAction.hidden = !action;
  if (action) {
    els.messageAction.textContent = action.label;
    els.messageAction.onclick = action.run;
  }
  els.message.hidden = false;
}

function hideMessage() {
  els.message.hidden = true;
}

function placeholder() {
  const box = h('div', { class: 'placeholder' });
  box.append($('placeholder-icon').content.cloneNode(true));
  return box;
}

function itemImage(url) {
  // loading must be set before src for lazy loading to apply.
  const img = h('img', { loading: 'lazy', decoding: 'async', alt: '', width: 116, height: 116, src: url });
  img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
  return img;
}

function itemCard(item, currency) {
  const badges = [];
  if (item.isFeatured) badges.push(h('li', { class: 'badge badge-featured' }, '★ Öne çıkan'));
  if (!item.isAvailable) badges.push(h('li', { class: 'badge badge-soldout' }, 'Tükendi'));

  const classes = ['item'];
  if (item.isFeatured) classes.push('is-featured');
  if (!item.isAvailable) classes.push('is-unavailable');

  return h(
    'article',
    { class: classes.join(' ') },
    h(
      'div',
      { class: 'item-body' },
      h('h3', { class: 'item-name' }, item.name),
      badges.length > 0 && h('ul', { class: 'badges', 'aria-label': 'Durum' }, badges),
      item.description && h('p', { class: 'item-desc' }, item.description),
      item.tags.length > 0 &&
        h(
          'ul',
          { class: 'chips', 'aria-label': 'Etiketler' },
          item.tags.map((tag) => h('li', { class: `chip chip-${tagTone(tag)}` }, tag)),
        ),
      item.allergens && h('p', { class: 'allergens' }, h('strong', {}, 'Alerjen: '), item.allergens),
      h(
        'p',
        { class: 'price' },
        h('span', { class: 'visually-hidden' }, item.isAvailable ? 'Fiyat: ' : 'Tükendi, fiyat: '),
        formatPrice(item.price, currency),
      ),
    ),
    h('div', { class: 'item-media' }, item.imageUrl ? itemImage(item.imageUrl) : placeholder()),
  );
}

function renderHeader(settings) {
  const name = settings.restaurantName || 'Menü';
  els.name.textContent = name;
  document.title = `${name} · Menü`;
  els.desc.textContent = settings.description || '';
  els.desc.hidden = !settings.description;
  els.footer.textContent = `${name} · Afiyet olsun!`;
  if (settings.logoUrl) {
    els.logo.src = settings.logoUrl;
    els.logo.alt = `${name} logosu`;
    els.logo.hidden = false;
    els.logo.onerror = () => {
      els.logo.hidden = true;
    };
  } else {
    els.logo.hidden = true;
  }
  applyPrimaryColor(settings.primaryColor);
}

function renderMenu(menu) {
  const { settings } = menu;
  renderHeader(settings);

  const categories = menu.categories.filter((c) => c.items.length > 0);
  els.sections.replaceChildren();
  els.tabs.replaceChildren();
  entries = [];

  if (categories.length === 0) {
    els.toolbar.hidden = true;
    showMessage('Menü hazırlanıyor', 'Şu anda listelenecek ürün yok. Lütfen daha sonra tekrar bakın.');
    return;
  }

  for (const category of categories) {
    const sectionId = `kategori-${category.id}`;
    const headingId = `${sectionId}-baslik`;
    const heading = h('h2', { class: 'section-title', id: headingId, tabindex: '-1' }, category.name);
    const cards = category.items.map((item) => ({
      el: itemCard(item, settings.currency),
      haystack: normalizeSearch([item.name, item.description, ...item.tags].join(' ')),
    }));
    const section = h(
      'section',
      { class: 'menu-section', id: sectionId, 'aria-labelledby': headingId },
      h(
        'div',
        { class: 'section-head' },
        heading,
        category.description && h('p', { class: 'section-desc' }, category.description),
      ),
      h('div', { class: 'grid' }, cards.map((c) => c.el)),
    );
    const link = h('a', { class: 'tab', href: `#${sectionId}` }, category.name);
    const entry = { section, heading, link, tabItem: h('li', {}, link), cards };
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setActive(entry);
      section.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      heading.focus({ preventScroll: true });
    });
    entries.push(entry);
    els.sections.append(section);
    els.tabs.append(entry.tabItem);
  }

  hideMessage();
  els.toolbar.hidden = false;
  applySearch();
}

function setActive(entry) {
  if (entry === activeEntry) return;
  activeEntry?.link.removeAttribute('aria-current');
  activeEntry = entry;
  if (!entry) return;
  entry.link.setAttribute('aria-current', 'location');
  // Keep the active tab in view inside the horizontal strip without moving the page.
  const list = els.tabs.getBoundingClientRect();
  const tab = entry.link.getBoundingClientRect();
  const delta = tab.left - list.left - (list.width - tab.width) / 2;
  els.tabs.scrollBy({ left: delta, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

/** Scrollspy: the active category is the last one whose top has passed under the sticky bar. */
function updateActive() {
  const visible = entries.filter((e) => !e.section.hidden);
  if (visible.length === 0) {
    setActive(null);
    return;
  }
  const line = els.toolbar.getBoundingClientRect().bottom + 24;
  let current = visible[0];
  for (const entry of visible) {
    if (entry.section.getBoundingClientRect().top <= line) current = entry;
    else break;
  }
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) current = visible[visible.length - 1];
  setActive(current);
}

function applySearch() {
  const query = normalizeSearch(els.search.value);
  let total = 0;
  for (const entry of entries) {
    let count = 0;
    for (const card of entry.cards) {
      const match = !query || card.haystack.includes(query);
      card.el.hidden = !match;
      if (match) count += 1;
    }
    entry.section.hidden = count === 0;
    entry.tabItem.hidden = count === 0;
    total += count;
  }

  if (query && total === 0) {
    showMessage('Sonuç bulunamadı', `“${els.search.value.trim()}” için eşleşen ürün yok.`, {
      label: 'Aramayı temizle',
      run: () => {
        els.search.value = '';
        applySearch();
        els.search.focus();
      },
    });
  } else if (entries.length > 0) {
    hideMessage();
  }
  els.status.textContent = query ? (total === 0 ? 'Sonuç bulunamadı.' : `${total} ürün bulundu.`) : '';
  updateActive();
}

async function loadMenu() {
  els.main.setAttribute('aria-busy', 'true');
  els.loading.hidden = false;
  hideMessage();
  try {
    const res = await fetch('/api/menu', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderMenu(await res.json());
  } catch (err) {
    console.warn('Menü yüklenemedi:', err);
    els.toolbar.hidden = true;
    showMessage('Menü yüklenemedi', 'Bağlantınızı kontrol edip tekrar deneyin.', {
      label: 'Tekrar dene',
      run: loadMenu,
    });
    els.status.textContent = 'Menü yüklenemedi.';
  } finally {
    els.loading.hidden = true;
    els.main.setAttribute('aria-busy', 'false');
  }
}

let scrollQueued = false;
window.addEventListener(
  'scroll',
  () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      updateActive();
    });
  },
  { passive: true },
);

new ResizeObserver(() => {
  document.documentElement.style.setProperty('--toolbar-h', `${els.toolbar.offsetHeight}px`);
}).observe(els.toolbar);

els.search.addEventListener('input', applySearch);
els.search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.search.value) {
    els.search.value = '';
    applySearch();
  }
});

loadMenu();
