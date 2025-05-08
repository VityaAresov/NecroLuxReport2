// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';

// --- Configure Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- i18n strings ---
const MESSAGES = {
  uk: { /* ... same translations ... */ },
  ru: { /* ... same translations ... */ }
};

// --- Initialize bot (webhook mode) ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
bot.setWebHook(process.env.WEBHOOK_URL);

// --- Bot logic imported from bot-logic.js ---
import botLogic from '../bot-logic'; // assumes bot-logic exports configured bot
botLogic(bot);

// --- Vercel handler ---
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const buf = await rawBody(req);
      const update = JSON.parse(buf.toString());
      await bot.processUpdate(update);
      res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook handler error:', err);
      res.status(500).send('Error');
    }
  } else {
    res.status(200).send('No websocket here');
  }
}
