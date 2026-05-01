// One-time script: creates a LiveAvatar context and writes its ID into ./.env.
// Run with: npm run setup:context

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const {
  LIVEAVATAR_API_KEY,
  LIVEAVATAR_API_BASE = 'https://api.liveavatar.com',
  LIVEAVATAR_CONTEXT_ID,
} = process.env;

if (!LIVEAVATAR_API_KEY) {
  console.error('Missing LIVEAVATAR_API_KEY in .env');
  process.exit(1);
}

if (LIVEAVATAR_CONTEXT_ID) {
  console.log(`LIVEAVATAR_CONTEXT_ID already set: ${LIVEAVATAR_CONTEXT_ID}`);
  console.log('Delete the line in .env if you want to recreate it.');
  process.exit(0);
}

const payload = {
  name: 'Sandbox Test Agent',
  prompt:
    "You are a friendly assistant demonstrating LiveAvatar's sandbox mode. " +
    'Keep replies short — one or two sentences — and conversational. ' +
    "If asked what you can do, say you can chat, answer questions, and that you're running in sandbox mode for free.",
  opening_text: "Hi! I'm running in LiveAvatar sandbox mode. Ask me anything to test it out.",
};

console.log('Creating context on LiveAvatar...');

const response = await fetch(`${LIVEAVATAR_API_BASE}/v1/contexts`, {
  method: 'POST',
  headers: {
    'X-API-KEY': LIVEAVATAR_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error('Failed to create context:', response.status, body);
  process.exit(1);
}

const contextId = body?.data?.id;
if (!contextId) {
  console.error('Context created but no id returned:', body);
  process.exit(1);
}

console.log(`Context created: ${contextId}`);

// scripts/setup-context.js → repo root /.env
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const envText = await readFile(envPath, 'utf8');
const updated = /^LIVEAVATAR_CONTEXT_ID=.*$/m.test(envText)
  ? envText.replace(/^LIVEAVATAR_CONTEXT_ID=.*$/m, `LIVEAVATAR_CONTEXT_ID=${contextId}`)
  : `${envText.replace(/\s*$/, '')}\nLIVEAVATAR_CONTEXT_ID=${contextId}\n`;
await writeFile(envPath, updated);
console.log('Wrote LIVEAVATAR_CONTEXT_ID to .env');
