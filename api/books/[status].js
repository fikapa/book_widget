import { list } from "@vercel/blob";
import fetch from "node-fetch";

const BLOB_FILE = "books.json";

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

export default async function handler(req, res) {
  const { status } = req.query;
  const books = await loadBooks();
  res.json(books.filter(b => b.status === status));
}
