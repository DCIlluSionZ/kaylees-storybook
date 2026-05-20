const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const sdkVersion = require('@google/generative-ai/package.json').version;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const BOOK_PAGES = Number(process.env.BOOK_PAGES) || 10;
const ENABLE_IMAGES = process.env.ENABLE_IMAGES !== 'false';
const BOOK_TTL_MS = 1000 * 60 * 60 * 4;
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS) || 45000;
const TEXT_TIMEOUT_MS = Number(process.env.TEXT_TIMEOUT_MS) || 25000;
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
]);

if (!process.env.GEMINI_API_KEY) {
  console.error('[FATAL] Missing GEMINI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
];

const ALLOWED_HAIR = new Set(['blonde', 'light brown', 'brown', 'dark brown', 'black', 'red', 'auburn']);
const ALLOWED_COLOURS = new Set(['pink', 'purple', 'blue', 'teal', 'rainbow', 'mint', 'lavender', 'yellow']);
const COLOUR_OUTFIT = {
  pink: 'a soft pink t-shirt, denim shorts or jeans, and pink sneakers',
  purple: 'a soft purple t-shirt with little stars, denim shorts or jeans, and purple sneakers',
  blue: 'a soft sky-blue t-shirt, denim shorts or jeans, and blue sneakers',
  teal: 'a soft teal t-shirt with a wave pattern, denim shorts or jeans, and teal sneakers',
  rainbow: 'a soft rainbow-striped t-shirt, denim shorts or jeans, and rainbow sneakers',
  mint: 'a soft mint-green t-shirt, denim shorts or jeans, and mint sneakers',
  lavender: 'a soft lavender t-shirt with tiny flowers, denim shorts or jeans, and lavender sneakers',
  yellow: 'a soft buttercup-yellow t-shirt, denim shorts or jeans, and yellow sneakers',
};
const COLOUR_RIBBON = {
  pink: 'pink', purple: 'purple', blue: 'blue', teal: 'teal',
  rainbow: 'rainbow', mint: 'mint-green', lavender: 'lavender', yellow: 'yellow',
};

function sanitizeAbout(raw) {
  const about = (raw && typeof raw === 'object') ? raw : {};
  const hair = typeof about.hair === 'string' ? about.hair.toLowerCase().trim() : '';
  const favColour = typeof about.favColour === 'string' ? about.favColour.toLowerCase().trim() : '';
  const petRaw = typeof about.pet === 'string' ? about.pet.trim() : '';
  return {
    hair: ALLOWED_HAIR.has(hair) ? hair : '',
    favColour: ALLOWED_COLOURS.has(favColour) ? favColour : '',
    pet: petRaw.replace(/[\r\n\t]+/g, ' ').slice(0, 120),
  };
}

function buildCharacterSheet(about) {
  const hair = (about && about.hair) ? about.hair : 'light-brown';
  const colour = (about && about.favColour) ? about.favColour : 'pink';
  const outfit = COLOUR_OUTFIT[colour] || COLOUR_OUTFIT.pink;
  const ribbon = COLOUR_RIBBON[colour] || 'pink';
  const friendsLine = (about && about.pet)
    ? `\nKAYLEE'S FRIENDS / PETS (always include them where natural): ${about.pet}. Treat these as friendly, kid-safe characters Kaylee already knows and loves. Children should be drawn as 8-year-olds, similar size to Kaylee. Pets should be small and friendly. Weave them into the story and illustrations.`
    : '';
  return `KAYLEE: An 8-year-old human girl. Long wavy ${hair} hair often in a side ponytail with a ${ribbon} ribbon. Fair skin, big bright hazel eyes, friendly smile. Wears ${outfit}. Cheerful, brave, kind. Cute Disney-style cartoon proportions.
LUCY: Kaylee's best friend, a small beautiful fairy. Sparkling translucent blue wings, flowing blue dress with silver trim, long flowing blonde hair, kind smile, holds a slim silver magic wand with a star tip. Hovers in mid-air or perches on Kaylee's shoulder. Cute Disney-style cartoon proportions.${friendsLine}`;
}

const buildSystemPrompt = (topic, totalPages, characterSheet) => `You are the "Storybook Author" for an interactive illustrated picture book made for an 8-year-old girl named Kaylee. Write ONE page per turn. The book is exactly ${totalPages} pages long and must reach a warm, satisfying ending on page ${totalPages}.

==========================
THE HEROES (always present)
==========================
${characterSheet}

==========================
THIS BOOK'S TOPIC (chosen by Kaylee)
==========================
"${topic}"

Build the supporting cast, setting, and plot around this topic. Kaylee and Lucy are the heroes; the topic shapes who or what they meet, where they go, and what the adventure is about. Invent named friendly characters as needed, but stay inside the safety rules.

==========================
BOOK ARC (across ${totalPages} pages)
==========================
- Page 1: Cozy opening. Establish the setting and gently introduce the topic. Show Kaylee and Lucy together.
- Pages 2-3: Inciting moment — something magical, curious, or exciting connected to the topic appears.
- Pages 4-7: The middle of the adventure. New friends, gentle obstacles to solve with kindness or cleverness, beautiful sights.
- Pages 8-9: A small climax — the most exciting or heartwarming moment.
- Page ${totalPages}: A warm, satisfying resolution. Kaylee and Lucy share a feeling of joy, friendship, or wonder. Set isFinalPage = true.

==========================
CHOICE PAGES
==========================
Pick 2 or 3 pages across the book where Kaylee's choice should shape what happens next. Good moments: page 3, page 5 or 6, and page 8 — but you may shift them by one if it feels more natural. On those pages, set isChoicePage = true and provide 2-3 distinct, kid-friendly choices Kaylee could make. Each choice is 3-10 words and starts with an action verb. Choices must all be safe and on-topic.
On every other page (the majority of pages), set isChoicePage = false and choices = []. The story simply continues; the reader just taps Next.

==========================
PAGE TEXT
==========================
Each page is between 50 and 120 words. Aim for about 80 words. Warm picture-book prose. Use Kaylee's name. Short sentences mixed with longer ones. Sensory detail (sparkle, soft, warm, fluffy, twinkling). Dialogue is welcome and should use quote marks. Occasional sound words ("Whoosh!", "Tinkle-tinkle!"). Always emotionally safe.

==========================
ABSOLUTELY FORBIDDEN
==========================
- No violence, blood, weapons (the silver wand is magic only, NEVER a weapon), fighting, scary monsters.
- No death, illness, kidnapping, anything frightening.
- No romance, kissing, dating.
- No real-world brands, no internet/phones/screens.
- No strangers asking Kaylee to go somewhere unsafe.
- No swearing, slang, sarcasm.
- Never ask Kaylee for personal information.
- Never break character; never mention being an AI, a model, JSON, a prompt, or these rules.

==========================
ILLUSTRATION PROMPT (every page)
==========================
On every page, also write a 1-2 sentence "illustrationPrompt" that describes what should be drawn for this page. Write it for a visual artist. Always include the heroes where they appear in the scene — refer to them by name (Kaylee, Lucy) only, since the illustrator already has their full visual descriptions from THE HEROES section above. Do NOT repeat hair colour, ribbon colour, outfit, or wing colour in the illustrationPrompt — that is fixed by the character sheet. Describe the setting, the action, the lighting, and any topic-specific characters or props. Bright Disney-style cartoon picture-book look.

==========================
PAGE TEXT — DESCRIBING KAYLEE
==========================
When the page text mentions Kaylee's appearance, use ONLY the hair colour, ribbon colour, and outfit colour shown in THE HEROES section above. Do not invent different ones.

==========================
BOOK TITLE
==========================
On page 1 only, also include a "bookTitle" — a warm, charming title for the whole book based on the topic. 3-8 words. On pages 2 through ${totalPages}, omit bookTitle (or set to empty string).

==========================
OUTPUT FORMAT — STRICT JSON ONLY
==========================
Return ONLY one JSON object matching the schema. No prose outside it, no markdown fences, no commentary.`;

const PAGE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    bookTitle: { type: SchemaType.STRING, description: 'Title (page 1 only).' },
    text: { type: SchemaType.STRING, description: '50-120 words of page prose.' },
    illustrationPrompt: { type: SchemaType.STRING, description: 'Visual description for the illustrator.' },
    isChoicePage: { type: SchemaType.BOOLEAN },
    choices: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    isFinalPage: { type: SchemaType.BOOLEAN },
  },
  required: ['text', 'illustrationPrompt', 'isChoicePage', 'choices', 'isFinalPage'],
};

function validatePagePayload(payload, expectedPage, totalPages) {
  if (!payload || typeof payload !== 'object') return { error: 'payload is not an object' };
  const { bookTitle, text, illustrationPrompt, isChoicePage, choices, isFinalPage } = payload;
  if (typeof text !== 'string' || text.trim().length === 0) return { error: 'missing or empty text' };
  if (typeof illustrationPrompt !== 'string' || illustrationPrompt.trim().length === 0) return { error: 'missing or empty illustrationPrompt' };
  if (typeof isChoicePage !== 'boolean') return { error: 'isChoicePage not boolean' };
  if (typeof isFinalPage !== 'boolean') return { error: 'isFinalPage not boolean' };
  if (!Array.isArray(choices)) return { error: 'choices not array' };
  if (isChoicePage && (choices.length < 2 || choices.length > 3)) return { error: `isChoicePage true but ${choices.length} choices` };
  const safeChoices = isChoicePage ? choices.map((c) => String(c).trim()).filter(Boolean) : [];
  return {
    ok: {
      bookTitle: typeof bookTitle === 'string' ? bookTitle.trim() : '',
      text: text.trim(),
      illustrationPrompt: illustrationPrompt.trim(),
      isChoicePage,
      choices: safeChoices,
      isFinalPage: isFinalPage || expectedPage >= totalPages,
    },
  };
}

async function generatePageText({ topic, totalPages, history, userTurn, characterSheet }) {
  const model = genAI.getGenerativeModel({
    model: TEXT_MODEL,
    systemInstruction: buildSystemPrompt(topic, totalPages, characterSheet),
    generationConfig: {
      temperature: 0.95,
      topP: 0.95,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: PAGE_SCHEMA,
    },
    safetySettings: SAFETY,
  });
  const chat = model.startChat({ history });
  const result = await withTimeout(chat.sendMessage(userTurn), TEXT_TIMEOUT_MS, 'text generation');
  const response = result.response;
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Story blocked by safety filter (${blockReason}). Try a gentler topic.`);
  }
  const cand = response?.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
    throw new Error(`Story stopped early (${cand.finishReason}). Try a different topic.`);
  }
  let text;
  try { text = response.text(); }
  catch (err) { throw new Error(`No story text returned: ${err.message || err}`); }
  if (!text || !text.trim()) throw new Error('Empty response from story model.');
  try { return JSON.parse(text); }
  catch (err) { throw new Error(`Story JSON parse failed: ${err.message}. First 200 chars: ${text.slice(0, 200)}`); }
}

async function generatePageImage(illustrationPrompt, characterSheet) {
  if (!ENABLE_IMAGES) return { ok: false, reason: 'Images disabled' };
  const fullPrompt = `Bright Disney-style cartoon illustration. Warm sunny lighting, cheerful saturated colors, soft outlines, friendly expressions.

CRITICAL: The image must contain ZERO text, ZERO words, ZERO letters, ZERO captions, ZERO speech bubbles, ZERO signs, ZERO book pages with writing on them, ZERO numbers. The image is PURE artwork only — like a single illustration panel with no overlaid text of any kind. If you would normally include any writing, REMOVE it and replace it with plain decorative shapes or empty space.

CHARACTERS (use these EXACT designs every time these characters appear, for visual consistency across the whole book):
${characterSheet}

SCENE TO DRAW: ${illustrationPrompt}`;
  try {
    const model = genAI.getGenerativeModel({
      model: IMAGE_MODEL,
      safetySettings: SAFETY,
    });
    const result = await withTimeout(model.generateContent(fullPrompt), IMAGE_TIMEOUT_MS, 'image generation');
    const response = result?.response;
    const blockReason = response?.promptFeedback?.blockReason;
    if (blockReason) {
      return { ok: false, reason: `Image blocked by safety filter (${blockReason})` };
    }
    const cand = response?.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== 'STOP') {
      return { ok: false, reason: `Image stopped early (${cand.finishReason})` };
    }
    const parts = cand?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData && typeof p.inlineData.data === 'string');
    if (!imgPart) return { ok: false, reason: 'Image model returned no picture' };
    return {
      ok: true,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      data: imgPart.inlineData.data,
    };
  } catch (err) {
    const reason = String(err?.message || err || 'unknown error').slice(0, 200);
    console.error('[image] generation failed:', reason);
    return { ok: false, reason };
  }
}

const books = new Map();

function pruneOldBooks() {
  const now = Date.now();
  for (const [id, book] of books) {
    if (now - book.lastTouched > BOOK_TTL_MS) books.delete(id);
  }
}
setInterval(pruneOldBooks, 1000 * 60 * 15).unref();

function sanitizeTopic(raw) {
  const cleaned = String(raw || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
  return cleaned || 'a magical surprise adventure';
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

app.post('/api/book/start', async (req, res) => {
  try {
    const topic = sanitizeTopic(req.body?.topic);
    const about = sanitizeAbout(req.body?.about);
    const characterSheet = buildCharacterSheet(about);
    const bookId = crypto.randomUUID();
    const book = {
      id: bookId,
      topic,
      about,
      characterSheet,
      totalPages: BOOK_PAGES,
      currentPage: 0,
      title: '',
      history: [],
      pages: [],
      lastTouched: Date.now(),
    };
    books.set(bookId, book);

    const page = await advanceBook(book, `Write page 1 of ${BOOK_PAGES} for a brand new book. The topic Kaylee chose is "${topic}". Open the story warmly. Include a bookTitle. Return strict JSON only.`);
    res.json({
      bookId,
      topic,
      title: book.title,
      totalPages: book.totalPages,
      currentPage: book.currentPage,
      page,
    });
  } catch (err) {
    console.error('[book/start] error:', err);
    res.status(500).json({ error: String(err?.message || err), stage: 'book/start' });
  }
});

app.post('/api/book/next', async (req, res) => {
  try {
    const { bookId, choice } = req.body || {};
    const book = books.get(bookId);
    if (!book) return res.status(404).json({ error: 'That story has flown away. Please start a new one.' });
    if (book.currentPage >= book.totalPages) {
      return res.status(400).json({ error: 'The story is already finished. Start a new one!' });
    }

    const lastPage = book.pages[book.pages.length - 1];
    const nextPageNumber = book.currentPage + 1;
    let userTurn;
    if (lastPage && lastPage.isChoicePage) {
      const safeChoice = String(choice || '').slice(0, 200) || lastPage.choices[0];
      userTurn = `Kaylee chose: "${safeChoice}". Now write page ${nextPageNumber} of ${book.totalPages}, continuing the story to honor that choice. Return strict JSON only.`;
    } else {
      userTurn = `Continue the book. Write page ${nextPageNumber} of ${book.totalPages}. ${nextPageNumber === book.totalPages ? 'This is the FINAL page — wrap the story up warmly and set isFinalPage to true.' : ''} Return strict JSON only.`;
    }

    const page = await advanceBook(book, userTurn);
    res.json({
      bookId,
      title: book.title,
      totalPages: book.totalPages,
      currentPage: book.currentPage,
      page,
    });
  } catch (err) {
    console.error('[book/next] error:', err);
    res.status(500).json({ error: String(err?.message || err), stage: 'book/next' });
  }
});

async function advanceBook(book, userTurn) {
  book.lastTouched = Date.now();
  const expectedPage = book.currentPage + 1;

  const characterSheet = book.characterSheet || buildCharacterSheet({});
  let raw;
  try {
    raw = await generatePageText({
      topic: book.topic,
      totalPages: book.totalPages,
      history: book.history,
      userTurn,
      characterSheet,
    });
  } catch (err) {
    console.error('[text] generation failed:', err.message || err);
    throw err;
  }

  const result = validatePagePayload(raw, expectedPage, book.totalPages);
  if (!result.ok) {
    console.error('[text] schema validation failed:', result.error, 'Raw:', raw);
    throw new Error(`Story validation failed: ${result.error}`);
  }
  const validated = result.ok;

  if (expectedPage === 1 && validated.bookTitle) {
    book.title = validated.bookTitle;
  }

  const image = await generatePageImage(validated.illustrationPrompt, characterSheet);
  const imageOk = image && image.ok;

  book.history.push({ role: 'user', parts: [{ text: userTurn }] });
  book.history.push({ role: 'model', parts: [{ text: JSON.stringify({
    text: validated.text,
    illustrationPrompt: validated.illustrationPrompt,
    isChoicePage: validated.isChoicePage,
    choices: validated.choices,
    isFinalPage: validated.isFinalPage,
  }) }] });

  const pageRecord = {
    pageNumber: expectedPage,
    text: validated.text,
    isChoicePage: validated.isChoicePage,
    choices: validated.choices,
    isFinalPage: validated.isFinalPage,
    imageMime: imageOk ? image.mimeType : null,
    imageData: imageOk ? image.data : null,
  };
  book.pages.push(pageRecord);
  book.currentPage = expectedPage;

  return {
    pageNumber: pageRecord.pageNumber,
    text: pageRecord.text,
    isChoicePage: pageRecord.isChoicePage,
    choices: pageRecord.choices,
    isFinalPage: pageRecord.isFinalPage,
    imageDataUrl: imageOk ? `data:${image.mimeType};base64,${image.data}` : null,
    imageError: imageOk ? null : (image && image.reason) || null,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    textModel: TEXT_MODEL,
    imageModel: IMAGE_MODEL,
    imagesEnabled: ENABLE_IMAGES,
    pagesPerBook: BOOK_PAGES,
    activeBooks: books.size,
  });
});

app.get('/api/diagnose', async (_req, res) => {
  const out = {
    node: process.version,
    sdkVersion,
    textModel: TEXT_MODEL,
    imageModel: IMAGE_MODEL,
    enableImages: ENABLE_IMAGES,
    bookPages: BOOK_PAGES,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    legacyGeminiModelEnv: process.env.GEMINI_MODEL || null,
    probe: null,
    imageProbe: null,
  };
  try {
    const m = genAI.getGenerativeModel({ model: TEXT_MODEL });
    const r = await m.generateContent('Reply with the single word: ok');
    out.probe = { ok: true, text: (r.response.text() || '').slice(0, 50) };
  } catch (err) {
    out.probe = { ok: false, error: String(err?.message || err) };
  }
  if (ENABLE_IMAGES) {
    try {
      const m = genAI.getGenerativeModel({ model: IMAGE_MODEL });
      const r = await withTimeout(
        m.generateContent('A tiny pink sparkle on a white background, cartoon style, no text.'),
        IMAGE_TIMEOUT_MS,
        'image probe',
      );
      const parts = r?.response?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData && typeof p.inlineData.data === 'string');
      out.imageProbe = imgPart
        ? { ok: true, mimeType: imgPart.inlineData.mimeType || 'image/png', bytes: imgPart.inlineData.data.length }
        : { ok: false, error: 'Image model returned no picture part' };
    } catch (err) {
      out.imageProbe = { ok: false, error: String(err?.message || err).slice(0, 400) };
    }
  } else {
    out.imageProbe = { ok: false, error: 'ENABLE_IMAGES is false' };
  }
  res.json(out);
});

app.listen(PORT, () => {
  console.log(`Kaylee's Storybook running at http://localhost:${PORT}`);
  console.log(`  text model:  ${TEXT_MODEL}`);
  console.log(`  image model: ${IMAGE_MODEL} (${ENABLE_IMAGES ? 'enabled' : 'disabled'})`);
  console.log(`  pages/book:  ${BOOK_PAGES}`);
});
