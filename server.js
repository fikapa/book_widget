
import express from "express";
let fetch;

async function getFetch() {
  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }
  return fetch;
}
import { put, list } from "@vercel/blob";

const app = express();
app.use(express.json());
const PORT = 3000;

import path from 'path';

app.get('/book', (req, res) => {
  res.send('Book endpoint is working!');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

const BLOB_FILE = "books.json"; // we'll keep all books here

// --- Helper: load books from blob ---
async function loadBooks() {
  try {
    const { blobs } = await list();
    const blob = blobs.find(b => b.pathname === BLOB_FILE);
    if (!blob) return [];

  const fetch = await getFetch();
  const res = await fetch(blob.url);
    return await res.json();
  } catch {
    return [];
  }
}

// --- Helper: save books to blob ---
async function saveBooks(books) {
  await put(BLOB_FILE, JSON.stringify(books, null, 2), {
    contentType: "application/json",
    access: "public" // so frontend can fetch if needed
  });
}

// --- Fetch book info from APIs ---
async function fetchFromOpenLibrary(isbn) {
  try {
  const fetch = await getFetch();
  const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title,
      cover: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
    };
  } catch {
    return null;
  }
}

async function fetchFromGoogleBooks(isbn) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await res.json();
    if (!data.items?.length) return null;
    const book = data.items[0].volumeInfo;
    return {
      title: book.title,
      cover: book.imageLinks?.thumbnail || null
    };
  } catch {
    return null;
  }
}

async function resolveBook(isbn, title, author) {
  let book = null;
  if (isbn) {
    book = await fetchFromOpenLibrary(isbn) || await fetchFromGoogleBooks(isbn);
  }
  if (!book && title) {
    book = { title, cover: "https://via.placeholder.com/150x220?text=No+Cover" };
  }
  return book;
}

// --- API Endpoints ---

// Get books by status
app.get("/books/:status", async (req, res) => {
  const { status } = req.params;
  const books = await loadBooks();
  res.json(books.filter(b => b.status === status));
});

// Add a new book
app.post("/book", async (req, res) => {
  const { isbn, title, author, status } = req.body;
  const book = await resolveBook(isbn, title, author);
  if (!book) return res.status(404).json({ error: "Book not found" });

  const books = await loadBooks();
  const newBook = {
    id: Date.now(), // simple ID
    title: book.title,
    cover: book.cover,
    status: status || "wishlist"
  };

  books.push(newBook);
  await saveBooks(books);

  res.json(newBook);
});

// Move book between lists
app.put("/book/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const books = await loadBooks();
  const book = books.find(b => b.id == id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  book.status = status;
  await saveBooks(books);

  res.json(book);
});

// Delete book
app.delete("/book/:id", async (req, res) => {
  const { id } = req.params;
  let books = await loadBooks();
  books = books.filter(b => b.id != id);
  await saveBooks(books);

  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));
