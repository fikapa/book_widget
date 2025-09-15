import { put, list } from "@vercel/blob";
import fetch from "node-fetch";

const BLOB_FILE = "books.json";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function loadBooks() {
  try {
    const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === BLOB_FILE);
    if (!blob) return [];
    const res = await fetch(blob.url);
    return await res.json();
  } catch { return []; }
}

async function saveBooks(books) {
  await put(BLOB_FILE, JSON.stringify(books, null, 2), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: "application/json",
    access: "public"
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { id } = req.query;
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
}
