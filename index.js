// index.js
require('dotenv').config();
const express     = require('express');
const TelegramBot = require('node-telegram-bot-api');
const Airtable    = require('airtable');

// --- 1) Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- 2) Telegram Bot в режиме WebHook ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
const WEBHOOK_PATH = '/webhook';
// В ENV: WEBHOOK_URL = https://<your-service>.onrender.com
bot.setWebHook(`${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`);

// --- 3) Загрузка логики ---
const registerHandlers = require('./bot-logic');
registerHandlers(bot, base);

// --- 4) Express ---
const app = express();
// Telegram шлёт JSON, парсим его обычным json‑парсером
app.use(express.json());

// --- 5) Webhook endpoint ---
app.post(WEBHOOK_PATH, async (req, res) => {
  try {
    // запускаем обработчик update
    await bot.processUpdate(req.body);
    res.send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.sendStatus(500);
  }
});

// --- 6) Health check ---
app.get('/', (_req, res) => res.send('OK'));

// --- 7) Запуск ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
