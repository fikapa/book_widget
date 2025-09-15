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
