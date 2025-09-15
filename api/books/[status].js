// dynamic loader for @vercel/blob to handle different export shapes in runtime
let blobModule;
async function getBlob() {
  if (blobModule) return blobModule;
  const mod = await import('@vercel/blob');
  // try direct properties first
  let list = mod.list;
  let put = mod.put;
  let head = mod.head;
  let del = mod.del;

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
      if (!head && lower.includes('head') && typeof val === 'function') head = val;
      if (!del && lower.includes('del') && typeof val === 'function') del = val;
    }
  }

  // try to find functions named list/put/head/del anywhere (fallback)
  if (typeof mod === 'object') {
    for (const key of Object.keys(mod)) {
      const val = mod[key];
      const lower = key.toLowerCase();
      if (!list && typeof val === 'function' && lower.includes('list')) list = val;
      if (!put && typeof val === 'function' && lower.includes('put')) put = val;
      if (!head && typeof val === 'function' && lower.includes('head')) head = val;
      if (!del && typeof val === 'function' && lower.includes('del')) del = val;
    }
  }

  const modKeys = Object.keys(mod || {});
  const defaultKeys = mod && mod.default ? Object.keys(mod.default) : [];
  if (!list) console.error('vercel-blob has no list; available keys:', { modKeys, defaultKeys });

  blobModule = { list, put, head, del, raw: mod };
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

import fs from 'fs/promises';
import path from 'path';

async function loadBooks() {
  // local file fallback for development
  try {
    const local = await fs.readFile(path.join(process.cwd(), BLOB_FILE), 'utf8').catch(() => null);
    if (local) return JSON.parse(local);
  } catch (e) {
    // continue to remote attempt
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // no token and no local file -> empty list
    return [];
  }

  try {
    const { list, head } = await getBlob();
    if (typeof list === 'function') {
      const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
      const blob = blobs.find(b => b.pathname === BLOB_FILE);
      if (!blob) return [];
      const fetch = await getFetch();
      const res = await fetch(blob.url);
      return await res.json();
    }

    // fallback: try direct public URL
    const base = process.env.VERCEL_BLOB_API_URL || 'https://blob.vercel-storage.com';
    const url = `${base}/${BLOB_FILE}`;
    const fetch = await getFetch();
    const res = await fetch(url);
    if (!res.ok) return [];
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
