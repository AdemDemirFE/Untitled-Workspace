'use strict';

const path = require('node:path');

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(`Node.js 18 veya üstü gerekli. Kurulu sürüm: ${process.versions.node}`);
  process.exit(1);
}

// Load menu/.env when the Node version supports it (20.12+ / 21.7+). Real env vars win.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.join(__dirname, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`.env okunamadı: ${err.message}`);
  }
}

const { createApp, DEV_PASSWORD } = require('./src/app');

async function main() {
  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    adminPassword = DEV_PASSWORD;
    console.warn(
      [
        '',
        '!!! UYARI: ADMIN_PASSWORD ayarlanmamış.',
        `!!! Geliştirme şifresi kullanılıyor: "${DEV_PASSWORD}"`,
        '!!! Yayına almadan önce ADMIN_PASSWORD ortam değişkenini mutlaka ayarlayın.',
        '',
      ].join('\n'),
    );
  }

  const port = Number(process.env.PORT) || 3000;
  const { app, seeded, publicUrlIgnored } = await createApp({
    adminPassword,
    publicUrl: process.env.PUBLIC_URL,
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  });

  if (seeded) console.log('Veri dosyası bulunamadı; örnek menü ile data/menu.json oluşturuldu.');
  if (publicUrlIgnored) console.warn(`PUBLIC_URL geçersiz ("${process.env.PUBLIC_URL}"), istek adresi kullanılacak.`);

  const server = app.listen(port, () => {
    console.log(`QR Menü çalışıyor:  http://localhost:${port}/`);
    console.log(`Yönetici paneli:    http://localhost:${port}/admin/`);
  });
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} kullanımda. PORT ile başka bir port seçin.` : err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
