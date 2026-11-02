'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../src/app');

const PASSWORD = 'test-sifresi';
// Smallest valid PNG (1x1 transparent pixel).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

let tmpDir;
let dataFile;
let server;
let baseUrl;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qrmenu-test-'));
  dataFile = path.join(tmpDir, 'data', 'menu.json');
  const { app } = await createApp({
    adminPassword: PASSWORD,
    dataFile,
    uploadsDir: path.join(tmpDir, 'uploads'),
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function request(method, url, { body, cookie, form } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + url, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;
  return { res, data };
}

async function login() {
  const { res } = await request('POST', '/api/auth/login', { body: { password: PASSWORD } });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'login should set a cookie');
  return setCookie.split(';')[0];
}

test('the data file is seeded in the temp folder', async () => {
  const saved = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.ok(saved.categories.length >= 4);
  assert.ok(saved.items.length >= 12);
});

test('GET /api/menu returns the public menu', async () => {
  const { res, data } = await request('GET', '/api/menu');
  assert.equal(res.status, 200);
  assert.equal(data.settings.currency, '₺');
  assert.ok(data.categories.length >= 4);
  assert.ok(data.categories.every((c) => c.items.length > 0));
  assert.ok(!('sortOrder' in data.categories[0].items[0]), 'internal fields are not exposed');
});

test('admin routes answer 401 without a session cookie', async () => {
  for (const url of ['/api/admin/settings', '/api/admin/items', '/api/admin/categories', '/api/admin/qr']) {
    const { res, data } = await request('GET', url);
    assert.equal(res.status, 401, url);
    assert.match(data.error, /giriş/);
  }
  const { res } = await request('POST', '/api/admin/items', { body: { name: 'X' } });
  assert.equal(res.status, 401);
});

test('login rejects a wrong password and accepts the right one', async () => {
  const wrong = await request('POST', '/api/auth/login', { body: { password: 'yanlis' } });
  assert.equal(wrong.res.status, 401);
  assert.equal(wrong.res.headers.get('set-cookie'), null);

  const right = await request('POST', '/api/auth/login', { body: { password: PASSWORD } });
  assert.equal(right.res.status, 200);
  const cookie = right.res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);

  const me = await request('GET', '/api/auth/me', { cookie: cookie.split(';')[0] });
  assert.equal(me.data.authenticated, true);
});

test('creating an item with an invalid price returns 400 with a Turkish message', async () => {
  const cookie = await login();
  const { data: categories } = await request('GET', '/api/admin/categories', { cookie });
  const categoryId = categories[0].id;

  for (const price of [-5, 'abc', null]) {
    const { res, data } = await request('POST', '/api/admin/items', {
      cookie,
      body: { name: 'Bozuk', categoryId, price },
    });
    assert.equal(res.status, 400, `price ${price}`);
    assert.match(data.error, /Fiyat/);
  }

  const noCategory = await request('POST', '/api/admin/items', {
    cookie,
    body: { name: 'Kayıp', categoryId: 'yok', price: 10 },
  });
  assert.equal(noCategory.res.status, 400);
  assert.match(noCategory.data.error, /kategori/i);
});

test('an item can be created, updated and deleted', async () => {
  const cookie = await login();
  const { data: categories } = await request('GET', '/api/admin/categories', { cookie });
  const categoryId = categories[0].id;

  const created = await request('POST', '/api/admin/items', {
    cookie,
    body: { name: '  Test Pidesi ', categoryId, price: '149,9', tags: ['yeni', 'Yeni', ' acı '] },
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.data.name, 'Test Pidesi');
  assert.equal(created.data.price, 149.9);
  assert.deepEqual(created.data.tags, ['yeni', 'acı']);
  assert.equal(created.data.isAvailable, true);
  const id = created.data.id;

  const updated = await request('PUT', `/api/admin/items/${id}`, {
    cookie,
    body: { price: 155.555, isAvailable: false },
  });
  assert.equal(updated.res.status, 200);
  assert.equal(updated.data.price, 155.56);
  assert.equal(updated.data.isAvailable, false);
  assert.equal(updated.data.name, 'Test Pidesi', 'fields not sent keep their value');

  const menu = await request('GET', '/api/menu');
  const onMenu = menu.data.categories.flatMap((c) => c.items).find((i) => i.id === id);
  assert.equal(onMenu.isAvailable, false);

  const saved = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.equal(saved.items.find((i) => i.id === id).price, 155.56, 'change is written to the data file');

  const removed = await request('DELETE', `/api/admin/items/${id}`, { cookie });
  assert.equal(removed.res.status, 204);
  const again = await request('DELETE', `/api/admin/items/${id}`, { cookie });
  assert.equal(again.res.status, 404);
});

test('a category with items cannot be deleted', async () => {
  const cookie = await login();
  const { data: categories } = await request('GET', '/api/admin/categories', { cookie });
  const full = categories.find((c) => c.itemCount > 0);
  const { res, data } = await request('DELETE', `/api/admin/categories/${full.id}`, { cookie });
  assert.equal(res.status, 409);
  assert.match(data.error, /ürün var/);

  const created = await request('POST', '/api/admin/categories', { cookie, body: { name: 'Geçici' } });
  assert.equal(created.res.status, 201);
  const removed = await request('DELETE', `/api/admin/categories/${created.data.id}`, { cookie });
  assert.equal(removed.res.status, 204);
});

test('reorder changes the public category order', async () => {
  const cookie = await login();
  const { data: categories } = await request('GET', '/api/admin/categories', { cookie });
  const reversed = categories.map((c) => c.id).reverse();
  const { res } = await request('PUT', '/api/admin/reorder', { cookie, body: { type: 'categories', ids: reversed } });
  assert.equal(res.status, 200);
  const menu = await request('GET', '/api/menu');
  assert.equal(menu.data.categories[0].id, reversed[0]);
});

test('concurrent writes are serialized and all saved', async () => {
  const cookie = await login();
  const { data: categories } = await request('GET', '/api/admin/categories', { cookie });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, n) =>
      request('POST', '/api/admin/items', { cookie, body: { name: `Paralel ${n}`, categoryId: categories[0].id, price: n } }),
    ),
  );
  assert.ok(results.every((r) => r.res.status === 201));
  const saved = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.equal(saved.items.filter((i) => i.name.startsWith('Paralel ')).length, 10);
});

test('upload accepts a real PNG and rejects other files', async () => {
  const cookie = await login();
  const good = new FormData();
  good.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'nokta.png');
  const ok = await request('POST', '/api/admin/upload', { cookie, form: good });
  assert.equal(ok.res.status, 201);
  assert.match(ok.data.url, /^\/uploads\/[0-9a-f-]+\.png$/);
  const served = await fetch(baseUrl + ok.data.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');

  const fake = new FormData();
  fake.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'fake.png');
  const rejected = await request('POST', '/api/admin/upload', { cookie, form: fake });
  assert.equal(rejected.res.status, 400);

  const text = new FormData();
  text.append('file', new Blob(['merhaba'], { type: 'text/plain' }), 'not.txt');
  const wrongType = await request('POST', '/api/admin/upload', { cookie, form: text });
  assert.equal(wrongType.res.status, 400);
  assert.match(wrongType.data.error, /JPG, PNG veya WEBP/);
});

test('QR code is returned as PNG and SVG', async () => {
  const cookie = await login();
  const png = await fetch(`${baseUrl}/api/admin/qr?format=png`, { headers: { Cookie: cookie } });
  assert.equal(png.status, 200);
  const bytes = Buffer.from(await png.arrayBuffer());
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');

  const svg = await fetch(`${baseUrl}/api/admin/qr?format=svg`, { headers: { Cookie: cookie } });
  assert.match(await svg.text(), /<svg/);

  const info = await request('GET', '/api/admin/qr?format=json', { cookie });
  assert.equal(info.data.url, `${baseUrl}/`);
});

test('the data folder is not served over HTTP', async () => {
  for (const url of ['/data/menu.json', '/../data/menu.json', '/uploads/../data/menu.json']) {
    const res = await fetch(baseUrl + url);
    assert.notEqual(res.status, 200, url);
  }
});

test('logout ends the session', async () => {
  const cookie = await login();
  await request('POST', '/api/auth/logout', { cookie });
  const { res } = await request('GET', '/api/admin/settings', { cookie });
  assert.equal(res.status, 401);
});

test('failed logins are rate limited', async () => {
  // Earlier tests made one failed attempt from this IP; keep failing until blocked.
  let last;
  for (let i = 0; i < 6; i++) {
    last = await request('POST', '/api/auth/login', { body: { password: `yanlis-${i}` } });
  }
  assert.equal(last.res.status, 429);
  assert.ok(last.res.headers.get('retry-after'));
});
