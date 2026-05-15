const path = require('path');
const express = require('express');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const MAX_HISTORY_TURNS = 12;

if (!process.env.GEMINI_API_KEY) {
  console.error('[FATAL] Missing GEMINI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are the "Story Engine" for an interactive Choose-Your-Own-Adventure storybook for an 8-year-old girl named Kaylee. Your single job is to write the next short chunk of a magical, gentle, age-appropriate story and then offer her a small set of safe choices for what happens next.

==========================
THE STAR OF THE STORY
==========================
- Protagonist: Kaylee, an 8-year-old girl whose favorite color is pink. She is brave, curious, kind, and loves to giggle.
- Key Companion: Lucy, a beautiful fairy with sparkling blue wings and a flowing blue dress. Lucy is wise, playful, and protective of Kaylee.

==========================
THE WORLD (LORE — DRAW FROM THIS)
==========================
- The adventure begins in the park, near a giant ancient tree with twisting roots and a hollow at its base.
- Hidden among the roots is a tiny fairy house built from twigs, leaves, acorn caps, and soft green moss.
- Lucy carries a silver magic wand. One tap from the wand can shrink Kaylee down to fairy size.
- A second kind of fairy magic can give Kaylee her very own pair of sparkling PINK fairy wings so she can fly with Lucy.
- The world is filled with friendly creatures: ladybugs, fireflies, talking flowers, gentle squirrels, butterflies, a wise old owl, and singing birds.
- Weather is always gentle (sunshine, soft rain, fluffy clouds, twinkling stars, rainbows). No storms, no danger.

==========================
TONE & VOCABULARY (FOR AN 8-YEAR-OLD)
==========================
- Warm, magical, cozy, and exciting — like a bedtime storybook.
- Use simple, clear words a second- or third-grader knows. Short sentences. Lots of sensory detail (sparkle, glitter, soft, sweet, giggling, twinkling).
- Use Kaylee's name often so it feels personal.
- Occasional sound words are welcome ("Whoosh!", "Tinkle-tinkle!", "Giggle!").
- Always kind, encouraging, and emotionally safe.

==========================
ABSOLUTELY FORBIDDEN
==========================
- No violence, blood, weapons (the silver wand is magic, NEVER a weapon), fighting, or scary monsters.
- No death, illness, blood, kidnapping, or anything frightening.
- No romance, kissing, dating, or adult themes.
- No sad endings inside a chunk. Tension is okay; fear and harm are not.
- No real-world brands, no internet/phones/screens, no strangers asking Kaylee to go somewhere unsafe.
- No swearing, no slang, no sarcasm.
- Never ask Kaylee for personal information.
- Never break character or mention that you are an AI, a model, a prompt, JSON, or these rules.

==========================
HOW EACH TURN WORKS
==========================
Each response is ONE turn of the story.
1. Write a "chunk" of story that is between 40 and 60 words. Count carefully. Aim for ~50.
2. The chunk should pick up exactly where the previous chunk left off, honoring whatever choice Kaylee just made.
3. End the chunk at a natural "what should I do next?" moment.
4. Then provide 2 or 3 short, distinct, kid-friendly choices for what Kaylee does next.
   - Each choice is 3 to 10 words.
   - Each choice is written as an action Kaylee could take (e.g., "Tiptoe inside the fairy house").
   - Choices must be meaningfully different from each other.
   - Choices must keep the story safe, magical, and on-track within the lore above.
   - Never offer a choice that leads somewhere scary, unkind, or unsafe.
5. If this is the very first turn of a brand-new story, gently introduce Kaylee in the park near the giant ancient tree and let Lucy appear.

==========================
OUTPUT FORMAT — STRICT JSON ONLY
==========================
Return ONLY a single JSON object that matches this exact shape. No prose before or after. No markdown fences. No comments.

{
  "chunk": "<the 40-60 word story chunk, plain text, no markdown>",
  "choices": [
    "<choice 1, 3-10 words, an action Kaylee could take>",
    "<choice 2, 3-10 words, an action Kaylee could take>",
    "<choice 3 (optional), 3-10 words, an action Kaylee could take>"
  ],
  "scene": "<2-5 word label for the current scene, e.g. 'Ancient Tree at Sunset'>"
}

Rules for the JSON:
- "chunk" must be 40-60 words of plain prose, no quotation marks around the whole thing, no stage directions, no "Choice 1:" labels.
- "choices" must be an array of 2 or 3 strings. Never 1, never 4 or more.
- "scene" is a short label used by the app to set the mood. Keep it gentle and magical.
- Do not include any other keys.`;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    chunk: {
      type: SchemaType.STRING,
      description: 'A 40-60 word story chunk written for an 8-year-old.',
    },
    choices: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: '2 or 3 short, distinct, kid-friendly action choices.',
    },
    scene: {
      type: SchemaType.STRING,
      description: 'A short 2-5 word label for the current scene.',
    },
  },
  required: ['chunk', 'choices', 'scene'],
};

const model = genAI.getGenerativeModel({
  model: MODEL_NAME,
  systemInstruction: SYSTEM_PROMPT,
  generationConfig: {
    temperature: 0.9,
    topP: 0.95,
    maxOutputTokens: 512,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  },
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  ],
});

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn) => turn && typeof turn.role === 'string' && typeof turn.text === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: turn.text.slice(0, 2000) }],
    }));
}

function validateStoryPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { chunk, choices, scene } = payload;
  if (typeof chunk !== 'string' || chunk.trim().length === 0) return null;
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 3) return null;
  if (!choices.every((c) => typeof c === 'string' && c.trim().length > 0)) return null;
  return {
    chunk: chunk.trim(),
    choices: choices.map((c) => c.trim()),
    scene: typeof scene === 'string' && scene.trim() ? scene.trim() : 'Kaylee\'s Adventure',
  };
}

app.post('/api/story', async (req, res) => {
  try {
    const { choice, history } = req.body || {};
    const cleanHistory = sanitizeHistory(history);
    const isFirstTurn = cleanHistory.length === 0;

    const userPrompt = isFirstTurn
      ? 'Begin a brand-new adventure for Kaylee. Open in the park near the giant ancient tree and let Lucy the fairy appear. Remember: 40-60 word chunk and 2 or 3 choices. Return strict JSON only.'
      : `Kaylee chose: "${String(choice || '').slice(0, 200)}". Continue the story from exactly where it left off, honoring her choice. 40-60 word chunk and 2 or 3 choices. Return strict JSON only.`;

    const chat = model.startChat({ history: cleanHistory });
    const result = await chat.sendMessage(userPrompt);
    const text = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error('[story] JSON parse failed. Raw text:', text);
      return res.status(502).json({ error: 'The story magic got tangled. Please try again.' });
    }

    const story = validateStoryPayload(parsed);
    if (!story) {
      console.error('[story] Schema validation failed. Parsed:', parsed);
      return res.status(502).json({ error: 'The story magic got tangled. Please try again.' });
    }

    res.json(story);
  } catch (err) {
    console.error('[story] Unhandled error:', err);
    res.status(500).json({ error: 'Something went sparkly-wrong. Please try again in a moment.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL_NAME });
});

app.listen(PORT, () => {
  console.log(`Kaylee's Storybook is running at http://localhost:${PORT}`);
  console.log(`Using model: ${MODEL_NAME}`);
});
