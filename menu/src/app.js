'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const QRCode = require('qrcode');

const { MenuStore } = require('./store');
const { createAuth } = require('./auth');
const { HttpError, badRequest, notFound } = require('./errors');
const { validateSettings, validateCategory, validateItem, validateReorder } = require('./validate');

const ROOT = path.join(__dirname, '..');
const DEV_PASSWORD = 'degistir-beni';
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const byOrder = (a, b) => a.sortOrder - b.sortOrder;

/** Checks the file's first bytes, since the browser-reported type can be wrong. */
function hasImageSignature(buf, mimetype) {
  if (mimetype === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mimetype === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function readHead(file, length = 12) {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, 0);
    return buf;
  } finally {
    await handle.close();
  }
}

function normalizePublicUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return null;
  }
}

function sortedCategories(data) {
  return [...data.categories].sort(byOrder);
}

function sortedItems(data) {
  const catOrder = new Map(data.categories.map((c) => [c.id, c.sortOrder]));
  return [...data.items].sort(
    (a, b) => (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0) || byOrder(a, b),
  );
}

function nextSortOrder(list) {
  return list.reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1;
}

function publicMenu(data) {
  const categories = sortedCategories(data)
    .filter((c) => c.isVisible)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      items: data.items
        .filter((i) => i.categoryId === c.id)
        .sort(byOrder)
        .map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          price: i.price,
          imageUrl: i.imageUrl,
          tags: i.tags,
          allergens: i.allergens,
          isAvailable: i.isAvailable,
          isFeatured: i.isFeatured,
        })),
    }));
  return { settings: data.settings, categories };
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self'; script-src 'self'; " +
      "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });
  next();
}

/**
 * Builds the Express app. Paths and secrets are options so tests can point it at a temp folder.
 * @param {{ adminPassword: string, dataFile?: string, uploadsDir?: string, publicUrl?: string, trustProxy?: boolean }} options
 */
async function createApp(options) {
  const {
    adminPassword,
    dataFile = path.join(ROOT, 'data', 'menu.json'),
    uploadsDir = path.join(ROOT, 'uploads'),
    publicDir = path.join(ROOT, 'public'),
    publicUrl,
    trustProxy = false,
  } = options;
  if (!adminPassword) throw new Error('adminPassword gerekli');

  const store = new MenuStore(dataFile);
  const { seeded } = await store.init();
  await fs.mkdir(uploadsDir, { recursive: true });

  const fixedMenuUrl = normalizePublicUrl(publicUrl);
  const menuUrl = (req) => fixedMenuUrl || `${req.protocol}://${req.get('host')}/`;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(securityHeaders);
  app.use(cookieParser());
  app.use('/api', express.json({ limit: '100kb' }));

  // ---- Public ----
  app.get('/api/menu', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(publicMenu(store.current));
  });

  const auth = createAuth({ password: adminPassword });
  app.use('/api/auth', auth.router);

  // ---- Admin (every route needs a session) ----
  const admin = express.Router();
  admin.use(auth.requireAdmin);
  admin.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  admin.get('/settings', (req, res) => {
    res.json(store.current.settings);
  });

  admin.put('/settings', async (req, res) => {
    const settings = await store.update((data) => {
      data.settings = validateSettings(req.body, data.settings);
      return data.settings;
    });
    res.json(settings);
  });

  admin.get('/categories', (req, res) => {
    const { items } = store.current;
    res.json(
      sortedCategories(store.current).map((c) => ({
        ...c,
        itemCount: items.filter((i) => i.categoryId === c.id).length,
      })),
    );
  });

  admin.post('/categories', async (req, res) => {
    const fields = validateCategory(req.body);
    const category = await store.update((data) => {
      const created = { id: crypto.randomUUID(), ...fields, sortOrder: nextSortOrder(data.categories) };
      data.categories.push(created);
      return created;
    });
    res.status(201).json(category);
  });

  admin.put('/categories/:id', async (req, res) => {
    const category = await store.update((data) => {
      const target = data.categories.find((c) => c.id === req.params.id);
      if (!target) throw notFound('Kategori bulunamadı.');
      Object.assign(target, validateCategory(req.body, target));
      return target;
    });
    res.json(category);
  });

  admin.delete('/categories/:id', async (req, res) => {
    await store.update((data) => {
      const index = data.categories.findIndex((c) => c.id === req.params.id);
      if (index === -1) throw notFound('Kategori bulunamadı.');
      const count = data.items.filter((i) => i.categoryId === req.params.id).length;
      if (count > 0) {
        throw new HttpError(
          409,
          `Bu kategoride ${count} ürün var. Önce ürünleri silin veya başka bir kategoriye taşıyın.`,
        );
      }
      data.categories.splice(index, 1);
    });
    res.status(204).end();
  });

  admin.get('/items', (req, res) => {
    const { categoryId } = req.query;
    let items = sortedItems(store.current);
    if (typeof categoryId === 'string' && categoryId) items = items.filter((i) => i.categoryId === categoryId);
    res.json(items);
  });

  admin.post('/items', async (req, res) => {
    const fields = validateItem(req.body);
    const item = await store.update((data) => {
      if (!data.categories.some((c) => c.id === fields.categoryId)) throw badRequest('Seçilen kategori bulunamadı.');
      const siblings = data.items.filter((i) => i.categoryId === fields.categoryId);
      const created = { id: crypto.randomUUID(), ...fields, sortOrder: nextSortOrder(siblings) };
      data.items.push(created);
      return created;
    });
    res.status(201).json(item);
  });

  admin.put('/items/:id', async (req, res) => {
    const item = await store.update((data) => {
      const target = data.items.find((i) => i.id === req.params.id);
      if (!target) throw notFound('Ürün bulunamadı.');
      const fields = validateItem(req.body, target);
      if (!data.categories.some((c) => c.id === fields.categoryId)) throw badRequest('Seçilen kategori bulunamadı.');
      if (fields.categoryId !== target.categoryId) {
        // Moving to another category puts the item at the end of that category.
        target.sortOrder = nextSortOrder(data.items.filter((i) => i.categoryId === fields.categoryId));
      }
      Object.assign(target, fields);
      return target;
    });
    res.json(item);
  });

  admin.delete('/items/:id', async (req, res) => {
    await store.update((data) => {
      const index = data.items.findIndex((i) => i.id === req.params.id);
      if (index === -1) throw notFound('Ürün bulunamadı.');
      data.items.splice(index, 1);
    });
    res.status(204).end();
  });

  // Body: { type: "categories" | "items", ids: [...] }. Listed records get sortOrder 0..n-1 in that order.
  admin.put('/reorder', async (req, res) => {
    const { type, ids } = validateReorder(req.body);
    const result = await store.update((data) => {
      const list = data[type];
      const byId = new Map(list.map((entry) => [entry.id, entry]));
      const missing = ids.find((id) => !byId.has(id));
      if (missing) throw badRequest('Sıralama listesinde bulunmayan bir kayıt var.');
      if (type === 'items') {
        const categoryIds = new Set(ids.map((id) => byId.get(id).categoryId));
        if (categoryIds.size > 1) throw badRequest('Ürünler yalnızca aynı kategori içinde sıralanabilir.');
      }
      ids.forEach((id, index) => {
        byId.get(id).sortOrder = index;
      });
      return type === 'categories' ? sortedCategories(data) : sortedItems(data);
    });
    res.json(result);
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(badRequest('Yalnızca JPG, PNG veya WEBP görsel yükleyebilirsiniz.'));
    },
  });

  admin.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Yüklenecek bir görsel seçilmedi.');
    const head = await readHead(req.file.path);
    if (!hasImageSignature(head, req.file.mimetype)) {
      await fs.rm(req.file.path, { force: true });
      throw badRequest('Dosya geçerli bir JPG, PNG veya WEBP görseli değil.');
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });

  admin.get('/qr', async (req, res) => {
    const format = req.query.format ?? 'png';
    const url = menuUrl(req);
    if (format === 'json') {
      res.json({ url });
      return;
    }
    if (format !== 'png' && format !== 'svg') throw badRequest('Biçim "png" veya "svg" olmalıdır.');
    if (req.query.download === '1') res.attachment(`menu-qr.${format}`);
    if (format === 'svg') {
      res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }));
    } else {
      res.type('image/png').send(await QRCode.toBuffer(url, { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M' }));
    }
  });

  app.use('/api/admin', admin);

  app.use('/api', (req, res, next) => next(notFound('İstenen adres bulunamadı.')));

  // ---- Static files. data/ is outside both roots, so it is never served. ----
  app.use(
    '/uploads',
    express.static(uploadsDir, { index: false, dotfiles: 'ignore', maxAge: '30d', immutable: true }),
  );
  app.use(
    express.static(publicDir, {
      setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
    }),
  );

  app.use((req, res) => {
    res.status(404).type('text/plain; charset=utf-8').send('Sayfa bulunamadı.');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500;
    let message = 'Beklenmeyen bir sunucu hatası oluştu. Lütfen tekrar deneyin.';
    if (err instanceof HttpError) {
      status = err.status;
      message = err.message;
    } else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Görsel en fazla 2 MB olabilir.'
          : 'Yükleme isteği geçersiz. Tek bir görsel dosyası gönderin.';
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'İstek gövdesi geçerli bir JSON değil.';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'İstek çok büyük.';
    } else {
      console.error(err);
    }
    if (res.headersSent) return;
    res.status(status).json({ error: message });
  });

  return { app, store, seeded, publicUrlIgnored: Boolean(publicUrl) && !fixedMenuUrl };
}

module.exports = { createApp, DEV_PASSWORD };
