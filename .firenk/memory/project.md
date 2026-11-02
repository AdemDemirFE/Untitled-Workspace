## Custom team: Tam yığın web ürünü (version 1)
Goal: Bana bir tane çok detaylı malzeme satış web sitesi yapsın giriş auth javaspring boot 4 java 25 kullansıl frontent react geliştirsin.
- Execution: parallel
- 1 x Software Architect
- 1 x Backend Engineer
- 1 x Frontend Engineer
- 1 x QA & Test Engineer
- 1 x Code Reviewer

## Run: animated developer website (2026-11-02)
- Decision (Software Architect): goal "animasyonlu yazılımcı web sitesi" is built as a static site in site/ (index.html, styles.css, script.js), vanilla JS, no build step, no backend. Content in Turkish. One worker (Frontend Engineer) self-checks.
- Frontend Engineer (2026-11-02): site/ built (index.html, styles.css, script.js). Animations: typing, hero canvas particles, IntersectionObserver reveal, skill bars, card tilt, scroll progress. Verified headless via Playwright (no console errors, no H-scroll at 360/375/1280, reduced-motion and no-JS OK).
- Animation states are gated behind `html.js` + `@media (prefers-reduced-motion: no-preference)` in CSS, so content stays visible without JS or with reduced motion.
- Done: animated developer site delivered in site/ (t2 accepted 2026-11-02). Plan file was then replaced with the QR menu project.

## Project: QR menü (menu/) (2026-11-02)
- Decision (Software Architect): QR menu lives in menu/. Node.js + Express, JSON file store at menu/data/menu.json (atomic write, seeded on first run), plain HTML/CSS/JS pages: / customer menu, /admin panel. Backend is needed because admin edits must reach every customer's phone. Admin auth = ADMIN_PASSWORD env + httpOnly session cookie. Images via multer to menu/uploads; QR via 'qrcode' npm package. No DB server, no frontend framework.
- Frontend Engineer (2026-11-02): menu/ built. Server in menu/src (app.js routes, store.js serialized atomic JSON writes, auth.js, validate.js, seed.js); pages in menu/public (index.html, admin/index.html, css/base.css shared tokens, js/shared.js `h()` DOM builder). `npm test` = 14 node:test API tests on a temp data dir; Playwright self-check 40/40 at 360/1280 + dark.
- menu/ conventions: PUT on items/categories/settings merges partial bodies; reorder is PUT /api/admin/reorder {type, ids}; extra endpoint GET /api/admin/qr?format=json -> {url}. Dev password when ADMIN_PASSWORD unset: "degistir-beni".
- Open in menu/: replaced/deleted images are not removed from uploads/; sessions are in memory (restart = re-login).
