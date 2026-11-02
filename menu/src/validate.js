'use strict';

const { badRequest } = require('./errors');

const LIMITS = {
  restaurantName: 80,
  restaurantDescription: 300,
  currency: 8,
  categoryName: 60,
  categoryDescription: 200,
  itemName: 80,
  itemDescription: 400,
  allergens: 200,
  url: 500,
  tag: 24,
  tagCount: 10,
  maxPrice: 1_000_000,
};

const UPLOAD_URL = /^\/uploads\/[A-Za-z0-9._-]+$/;
const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(body) {
  if (!isPlainObject(body)) throw badRequest('İstek gövdesi bir JSON nesnesi olmalıdır.');
  return body;
}

function text(value, label, { required = false, max }) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${label} zorunludur.`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${label} metin olmalıdır.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw badRequest(`${label} boş bırakılamaz.`);
  if (trimmed.length > max) throw badRequest(`${label} en fazla ${max} karakter olabilir.`);
  return trimmed;
}

function bool(value, label) {
  if (typeof value !== 'boolean') throw badRequest(`${label} alanı true veya false olmalıdır.`);
  return value;
}

function imageUrl(value, label) {
  const url = text(value, label, { max: LIMITS.url });
  if (url && !UPLOAD_URL.test(url) && !HTTP_URL.test(url)) {
    throw badRequest(`${label} geçerli bir görsel adresi olmalıdır.`);
  }
  return url;
}

function price(value) {
  let num = value;
  if (typeof value === 'string' && value.trim() !== '') num = Number(value.trim().replace(',', '.'));
  if (typeof num !== 'number' || !Number.isFinite(num)) throw badRequest('Fiyat geçerli bir sayı olmalıdır.');
  if (num < 0) throw badRequest('Fiyat 0 veya daha büyük olmalıdır.');
  if (num > LIMITS.maxPrice) throw badRequest('Fiyat çok yüksek.');
  return Math.round(num * 100) / 100;
}

function tags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('Etiketler bir liste olmalıdır.');
  const seen = new Set();
  const out = [];
  for (const tag of value) {
    if (typeof tag !== 'string') throw badRequest('Her etiket metin olmalıdır.');
    const trimmed = tag.trim();
    if (!trimmed) continue;
    if (trimmed.length > LIMITS.tag) throw badRequest(`Bir etiket en fazla ${LIMITS.tag} karakter olabilir.`);
    const key = trimmed.toLocaleLowerCase('tr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  if (out.length > LIMITS.tagCount) throw badRequest(`En fazla ${LIMITS.tagCount} etiket eklenebilir.`);
  return out;
}

/**
 * Each validator takes the request body and the stored record (for updates).
 * Fields missing from the body keep their stored value, so PUT can send only what changed.
 */
function validateSettings(body, existing) {
  const src = { ...existing, ...requireObject(body) };
  const primaryColor = text(src.primaryColor, 'Ana renk', { required: true, max: 7 });
  if (!HEX_COLOR.test(primaryColor)) throw badRequest('Ana renk #RRGGBB biçiminde olmalıdır (örn. #c2410c).');
  return {
    restaurantName: text(src.restaurantName, 'Restoran adı', { required: true, max: LIMITS.restaurantName }),
    description: text(src.description, 'Açıklama', { max: LIMITS.restaurantDescription }),
    logoUrl: imageUrl(src.logoUrl, 'Logo adresi'),
    currency: text(src.currency, 'Para birimi', { required: true, max: LIMITS.currency }),
    primaryColor: primaryColor.toLowerCase(),
  };
}

function validateCategory(body, existing = {}) {
  const src = { isVisible: true, ...existing, ...requireObject(body) };
  return {
    name: text(src.name, 'Kategori adı', { required: true, max: LIMITS.categoryName }),
    description: text(src.description, 'Kategori açıklaması', { max: LIMITS.categoryDescription }),
    isVisible: bool(src.isVisible, 'Görünürlük'),
  };
}

function validateItem(body, existing = {}) {
  const src = { isAvailable: true, isFeatured: false, ...existing, ...requireObject(body) };
  if (typeof src.categoryId !== 'string' || !src.categoryId) throw badRequest('Kategori seçilmelidir.');
  if (src.price === undefined || src.price === null || src.price === '') throw badRequest('Fiyat zorunludur.');
  return {
    categoryId: src.categoryId,
    name: text(src.name, 'Ürün adı', { required: true, max: LIMITS.itemName }),
    description: text(src.description, 'Ürün açıklaması', { max: LIMITS.itemDescription }),
    price: price(src.price),
    imageUrl: imageUrl(src.imageUrl, 'Görsel adresi'),
    tags: tags(src.tags),
    allergens: text(src.allergens, 'Alerjen bilgisi', { max: LIMITS.allergens }),
    isAvailable: bool(src.isAvailable, 'Satış durumu'),
    isFeatured: bool(src.isFeatured, 'Öne çıkarma'),
  };
}

function validateReorder(body) {
  requireObject(body);
  if (body.type !== 'categories' && body.type !== 'items') {
    throw badRequest('Sıralama türü "categories" veya "items" olmalıdır.');
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.some((id) => typeof id !== 'string')) {
    throw badRequest('Sıralama için kimlik listesi gönderilmelidir.');
  }
  if (new Set(body.ids).size !== body.ids.length) throw badRequest('Sıralama listesinde tekrar eden kayıt var.');
  return { type: body.type, ids: body.ids };
}

module.exports = { LIMITS, validateSettings, validateCategory, validateItem, validateReorder };
