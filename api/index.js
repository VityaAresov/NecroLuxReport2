// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';

// --- Configure Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- Initialize Telegram Bot (webhook mode) ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Register webhook endpoint; ensure WEBHOOK_URL ends with "/api/index"
bot.setWebHook(process.env.WEBHOOK_URL);

// --- Import bot logic and attach handlers ---
// Create a file `bot-logic.js` in project root that exports a function
// `export default function(bot) { /* register handlers */ }`
import botLogic from '../bot-logic.js';
botLogic(bot, base);

// --- Vercel API handler ---
// Disable default body parser to read raw buffer
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // read raw request body
      const buf = await rawBody(req);
      const update = JSON.parse(buf.toString());
      // pass update to telegram bot
      await bot.processUpdate(update);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook handler error:', err);
      return res.status(500).send('Webhook error');
    }
  }
  // GET can be used for health checks
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('Telegram bot is running');
}
