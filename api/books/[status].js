// dynamic loader for @vercel/blob to handle different export shapes in runtime
let blobModule;
async function getBlob() {
  if (!blobModule) {
    const mod = await import('@vercel/blob');
    const list = mod.list ?? mod.default?.list;
    const put = mod.put ?? mod.default?.put;
    blobModule = { list, put };
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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { status } = req.query;
  try {
    const books = await loadBooks();
    return res.json(books.filter(b => b.status === status));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load books', details: err.message });
  }
}
