'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSeedData } = require('./seed');

const RENAME_RETRIES = 5;
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Writes to a temp file in the same folder, flushes it, then renames it over the target. */
async function writeFileAtomic(file, contents) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      // On Windows an antivirus or indexer can hold the target for a moment.
      if (LOCK_CODES.has(err.code) && attempt < RENAME_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
}

function normalize(data) {
  if (!data || typeof data !== 'object') throw new Error('kök değer bir nesne değil');
  return {
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    categories: Array.isArray(data.categories) ? data.categories : [],
    items: Array.isArray(data.items) ? data.items : [],
  };
}

/**
 * The menu lives in memory and is persisted to one JSON file.
 * All writes go through update(), which runs mutations one at a time,
 * so two requests can never interleave and corrupt the file.
 */
class MenuStore {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.queue = Promise.resolve();
  }

  /** Loads the file, or seeds it with a sample menu if it does not exist. */
  async init() {
    let raw;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.data = createSeedData();
      await writeFileAtomic(this.file, JSON.stringify(this.data, null, 2));
      return { seeded: true };
    }
    try {
      this.data = normalize(JSON.parse(raw));
    } catch (err) {
      // Never overwrite a file we could not read: the owner may want to repair it.
      throw new Error(`Veri dosyası okunamadı (${this.file}): ${err.message}`);
    }
    return { seeded: false };
  }

  /** Current data. Treat it as read-only; change it only through update(). */
  get current() {
    return this.data;
  }

  /**
   * Runs mutator on a copy of the data and saves it. If the mutator throws,
   * nothing is saved and the error reaches the caller.
   */
  update(mutator) {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.data);
      const result = await mutator(draft);
      await writeFileAtomic(this.file, JSON.stringify(draft, null, 2));
      this.data = draft;
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

module.exports = { MenuStore, writeFileAtomic };
