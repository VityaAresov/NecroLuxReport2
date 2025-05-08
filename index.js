// index.js
require('dotenv').config();
const express     = require('express');
const TelegramBot = require('node-telegram-bot-api');
const Airtable    = require('airtable');

// 1) Настройка Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// 2) Инициализация бота в режиме webhook
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
const WEBHOOK_PATH = '/webhook';
// В ENV переменной WEBHOOK_URL должно быть: https://<ваш‑домен>.onrender.com
bot.setWebHook(`${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`);

// 3) Подключаем логику бота
const registerHandlers = require('./bot-logic');
registerHandlers(bot, base);

// 4) Поднимаем Express и парсим JSON
const app = express();
app.use(express.json()); // Telegram шлёт JSON

// 5) Обработка WebHook от Telegram
app.post(WEBHOOK_PATH, async (req, res) => {
  try {
    await bot.processUpdate(req.body);
    return res.send('OK');
  } catch (err) {
    console.error('❌ Webhook processing error:', err);
    return res.sendStatus(500);
  }
});

// 6) Health‑check
app.get('/', (_req, res) => res.send('OK'));

// 7) Слушаем порт
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
