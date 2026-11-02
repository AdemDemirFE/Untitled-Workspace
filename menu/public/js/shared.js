// Helpers shared by the customer menu and the admin panel.
// The DOM is always built with createElement/textContent, never innerHTML.

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'type']);

/**
 * h('button', { class: 'btn', onclick: fn }, 'Kaydet')
 * Strings and numbers among children become text nodes.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** "₺" and other one-character symbols go in front (₺85); codes like "TL" go after (85 TL). */
export function formatPrice(price, currency = '₺') {
  const whole = Number.isInteger(price);
  const amount = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price);
  const symbol = (currency || '').trim();
  if (!symbol) return amount;
  return [...symbol].length === 1 ? `${symbol}${amount}` : `${amount} ${symbol}`;
}

/** Applies the brand color and picks black or white text on top of it for contrast. */
export function applyPrimaryColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
  const root = document.documentElement;
  root.style.setProperty('--primary', hex);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast with white is (1.05)/(L+0.05); with black (L+0.05)/0.05. Pick the larger.
  const onPrimary = 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#111111';
  root.style.setProperty('--on-primary', onPrimary);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
}

/** Lower-cases with Turkish rules and strips accents so "cay" finds "Çay". */
export function normalizeSearch(value) {
  return String(value)
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/** Known tags get a color; anything else uses the neutral chip. */
export function tagTone(tag) {
  const key = normalizeSearch(tag);
  if (key === 'vegan' || key === 'vejetaryen') return 'green';
  if (key === 'aci') return 'red';
  if (key === 'glutensiz') return 'amber';
  if (key === 'yeni') return 'blue';
  return 'neutral';
}
