import { put, list } from "@vercel/blob";

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

// Helper: load books
async function loadBooks() {
  try {
    const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === BLOB_FILE);
    if (!blob) return [];
  const fetch = await getFetch();
  const res = await fetch(blob.url);
  return await res.json();
  } catch {
    return [];
  }
}

// Helper: save books
async function saveBooks(books) {
  await put(BLOB_FILE, JSON.stringify(books, null, 2), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: "application/json",
    access: "public"
  });
}

// Helper: fetch cover
async function fetchFromOpenLibrary(isbn) {
  try {
  const fetch = await getFetch();
  const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title, cover: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` };
  } catch { return null; }
}

async function fetchFromGoogleBooks(isbn) {
  try {
  const fetch = await getFetch();
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await res.json();
    if (!data.items?.length) return null;
    const book = data.items[0].volumeInfo;
    let cover = book.imageLinks?.thumbnail || null;
    if (cover && cover.startsWith('http://')) {
      // use https to avoid mixed-content blocking on HTTPS pages
      cover = cover.replace(/^http:\/\//i, 'https://');
    }
    return { title: book.title, cover };
  } catch { return null; }
}

// Add book endpoint
export default async function handler(req, res) {
  setCors(res);
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
}
