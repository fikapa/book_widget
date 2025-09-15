import { put, list } from "@vercel/blob";
import fetch from "node-fetch";

const BLOB_FILE = "books.json";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Helper: load books
async function loadBooks() {
  try {
    const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === BLOB_FILE);
    if (!blob) return [];
    const res = await fetch(blob.url);
    return await res.json();
  } catch {
    return [];
  }
}

// Helper: save books
async function saveBooks(books) {
  try {
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

// Helper: fetch cover
async function fetchFromOpenLibrary(isbn) {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title, cover: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` };
  } catch { return null; }
}

async function fetchFromGoogleBooks(isbn) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await res.json();
    if (!data.items?.length) return null;
    const book = data.items[0].volumeInfo;
    return { title: book.title, cover: book.imageLinks?.thumbnail || null };
  } catch { return null; }
}

// Add book endpoint
export default async function handler(req, res) {
  setCors(res);
    console.log('POST /api/book invoked', { method: req.method, blobTokenSet: !!process.env.BLOB_READ_WRITE_TOKEN });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const msg = 'BLOB_READ_WRITE_TOKEN not set in environment';
    console.error(msg);
    return res.status(500).json({ error: msg });
  }
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== "POST") return res.status(405).end();

    const { isbn, title, author, status } = req.body;
    let book = null;

    if (isbn) book = await fetchFromOpenLibrary(isbn) || await fetchFromGoogleBooks(isbn);
    if (!book && title) book = { title, cover: "https://via.placeholder.com/150x220?text=No+Cover" };
    if (!book) return res.status(404).json({ error: "Book not found" });

    const books = await loadBooks();
    const newBook = { id: Date.now(), title: book.title, cover: book.cover, status: status || "wishlist" };
    books.push(newBook);
    await saveBooks(books);

    res.json(newBook);
  } catch (err) {
    console.error('Add book error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
