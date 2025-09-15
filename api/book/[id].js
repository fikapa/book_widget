// dynamic loader for @vercel/blob to handle different export shapes in runtime
let blobModule;
async function getBlob() {
  if (blobModule) return blobModule;
  const mod = await import('@vercel/blob');
  // try direct properties first
  let list = mod.list;
  let put = mod.put;

  // inspect default export if present
  const candidates = [];
  if (mod && typeof mod === 'object') candidates.push({src: 'mod', obj: mod});
  if (mod && mod.default && typeof mod.default === 'object') candidates.push({src: 'mod.default', obj: mod.default});

  for (const c of candidates) {
    for (const key of Object.keys(c.obj)) {
      const val = c.obj[key];
      const lower = key.toLowerCase();
      if (!list && lower.includes('list') && typeof val === 'function') list = val;
      if (!put && lower.includes('put') && typeof val === 'function') put = val;
    }
  }

  // try to find functions named list/put anywhere (fallback)
  if ((!list || !put) && typeof mod === 'object') {
    for (const key of Object.keys(mod)) {
      const val = mod[key];
      if (!list && typeof val === 'function' && key.toLowerCase().includes('list')) list = val;
      if (!put && typeof val === 'function' && key.toLowerCase().includes('put')) put = val;
    }
  }

  blobModule = { list, put, raw: mod };
  if (!list || !put) {
    const modKeys = Object.keys(mod || {});
    const defaultKeys = mod && mod.default ? Object.keys(mod.default) : [];
    console.error('vercel-blob exports missing list/put. available keys:', { modKeys, defaultKeys });
    throw new Error(`blob.list or blob.put not found. modKeys=${modKeys.join(',')}; defaultKeys=${defaultKeys.join(',')}`);
  }
  return blobModule;
}

let fetchFn;
async function getFetch() {
  if (!fetchFn) {
    fetchFn = (await import('node-fetch')).default;
  }
  return fetchFn;
}

const BLOB_FILE = "books.json";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function loadBooks() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not set');
  }
  try {
  const { list } = await getBlob();
  if (typeof list !== 'function') throw new Error('blob.list is not available');
  const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === BLOB_FILE);
    if (!blob) return [];
    const fetch = await getFetch();
    const res = await fetch(blob.url);
    return await res.json();
  } catch (err) {
    console.error('loadBooks error:', err);
    throw err;
  }
}

async function saveBooks(books) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not set');
  }
  try {
      const { put } = await getBlob();
      if (typeof put !== 'function') throw new Error('blob.put is not available');
      await put(BLOB_FILE, JSON.stringify(books, null, 2), {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: "application/json",
        access: "public"
      });
  } catch (err) {
    console.error('saveBooks error:', err);
    throw err;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { id } = req.query;
  try {
    let books = await loadBooks();
    const bookIndex = books.findIndex(b => b.id == id);
    if (bookIndex === -1) return res.status(404).json({ error: "Book not found" });

    if (req.method === "PUT") {
      const { status } = req.body;
      books[bookIndex].status = status;
      await saveBooks(books);
      return res.json(books[bookIndex]);
    }

    if (req.method === "DELETE") {
      books.splice(bookIndex, 1);
      await saveBooks(books);
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (err) {
    return res.status(500).json({ error: 'Storage operation failed', details: err.message });
  }
}
