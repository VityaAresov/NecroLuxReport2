// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const Airtable = require('airtable');

// 1) Настройка Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// 2) Инициализация бота в webhook-режиме
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });

// Путь, на котором Render будет слушать запросы от Telegram
const WEBHOOK_PATH = '/webhook';

// Убедитесь, что в настройках Render переменная WEBHOOK_URL равна вашему домену,
// например: https://<your-service>.onrender.com
bot.setWebHook(`${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`);

// 3) Подключаем логику бота
const registerHandlers = require('./bot-logic');
registerHandlers(bot, base);

// 4) Запускаем Express
const app = express();

// 5) На webhook-пути принимаем «сырое» тело (raw) для передачи в processUpdate
app.use(
  WEBHOOK_PATH,
  express.raw({
    type: 'application/json'
  })
);

// 6) Обработка POST от Telegram
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body)
    .then(() => res.sendStatus(200))
    .catch(err => {
      console.error('❌ Webhook processing error:', err);
      res.sendStatus(500);
    });
});

// 7) Простая страница для проверки, что сервис запущен
app.get('/', (req, res) => {
  res.send('OK');
});

// 8) Старт HTTPS-сервера
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
