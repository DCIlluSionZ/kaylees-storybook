# Kaylee's Magical Storybook

A web-based, interactive illustrated picture-book generator for an 8-year-old. Each "book" is a ~10-page, AI-written, AI-illustrated story starring **Kaylee** and her fairy best friend **Lucy**, on whatever topic Kaylee picks (Squishmallows, unicorns, puppies, mermaids, you name it). A few pages along the way let Kaylee choose what happens next.

## How it works

1. Cover screen: Kaylee types or picks a topic ("a magical pink unicorn", "a friendly Squishmallow named Love", etc.).
2. The server asks the Gemini text model to write a single page (50–120 words) and provides a 1–2 sentence visual description for the illustrator.
3. The server then asks the Gemini image model to draw that scene in a bright Disney-cartoon style, with a fixed character sheet for Kaylee and Lucy so they look consistent across pages.
4. The page is sent back as JSON (text + base64 image) and rendered as a real two-page spread. The browser reads the text aloud with `SpeechSynthesis`.
5. On most pages Kaylee taps **Turn the Page**. On 2–3 pages across the book she gets choice buttons that shape what happens next.
6. The story arcs across exactly 10 pages and ends warmly with a "The End" screen.

The Gemini API key never leaves the server.

## Files

```
kaylees-storybook/
├── server.js              Express backend: text + image generation, book sessions
├── package.json           express, @google/generative-ai, dotenv
├── .env.example           Template for your real .env
├── public/
│   ├── index.html         Cover / book / end screens
│   ├── styles.css         Pink / Disney-bright theme
│   └── app.js             Topic picker, page turner, choices, TTS
```

## Setup

```bash
npm install
cp .env.example .env       # paste your GEMINI_API_KEY
npm start
```

Open <http://localhost:3000>.

## Environment variables

| Variable             | Required | Default                  | Notes                                              |
|----------------------|----------|--------------------------|----------------------------------------------------|
| `GEMINI_API_KEY`     | yes      | —                        | From Google AI Studio.                             |
| `GEMINI_TEXT_MODEL`  | no       | `gemini-3.1-flash-lite`  | Used to write each page.                           |
| `GEMINI_IMAGE_MODEL` | no       | `gemini-3.1-flash-image-preview` | Used to illustrate each page. Nano Banana 2. |
| `ENABLE_IMAGES`      | no       | `true`                   | Set to `false` for text-only mode (no image costs). |
| `BOOK_PAGES`         | no       | `10`                     | Pages per book.                                    |
| `PORT`               | no       | `3000`                   | Server port.                                       |

## Endpoints

- `POST /api/book/start` — body: `{ topic: string }`. Returns `{ bookId, title, totalPages, currentPage, page }`.
- `POST /api/book/next`  — body: `{ bookId, choice?: string }`. Returns the next page.
- `GET /api/health`      — returns the configured models + active book count.

Each `page` shape:
```json
{
  "pageNumber": 1,
  "text": "Page prose (50-120 words)...",
  "isChoicePage": false,
  "choices": [],
  "isFinalPage": false,
  "imageDataUrl": "data:image/png;base64,..."
}
```

## Hosting on DCI Cloud Hub

Run with pm2 behind your existing nginx/Caddy:

```bash
sudo npm install -g pm2
pm2 start server.js --name kaylees-storybook
pm2 save
pm2 startup
```

Then reverse-proxy a subdomain like `storybook.dci-au.com` to `http://127.0.0.1:3000`. Make sure outbound HTTPS to `generativelanguage.googleapis.com` is allowed.

## Cost notes

Roughly **30–60 ¢ per finished book** at current pricing (10 image generations dominate the cost; text is negligible). Set `ENABLE_IMAGES=false` to make books essentially free at the cost of losing the pictures.

## Safety design

The system prompt forbids violence, scary content, romance, real-world brands, requests for personal info, and any topic outside the lore. Gemini's safety filters are turned up to `BLOCK_LOW_AND_ABOVE` on all four harm categories. Every text response is JSON-schema-validated server-side before being sent to the browser.
