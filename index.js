// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const Airtable   = require('airtable');

// 1) Настройка Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// 2) Инициализация Telegram‑бота в режиме webhook
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
const WEBHOOK_PATH = '/webhook';
// в переменной WEBHOOK_URL должно быть: https://<your-service>.onrender.com
bot.setWebHook(`${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`);

// 3) Подключаем логику из bot-logic.js
const registerHandlers = require('./bot-logic');
registerHandlers(bot, base);

// 4) Поднимаем Express
const app = express();
// парсим тело JSON (Telegram шлёт application/json)
app.use(express.json());

// 5) Обработка POST от Telegram
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body)
    .then(() => res.send('OK'))
    .catch(err => {
      console.error('❌ processUpdate error:', err);
      res.sendStatus(500);
    });
});

// 6) Простая «здоровая» страница
app.get('/', (_req, res) => res.send('OK'));

// 7) Старт порта
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
