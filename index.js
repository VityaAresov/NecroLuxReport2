// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const Airtable   = require('airtable');

// 1) Настраиваем Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// 2) Инициализируем бота в webhook‑режиме
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// WEBHOOK_URL должен быть https://<ваш‑домен>.onrender.com
const WEBHOOK_PATH = '/webhook';
bot.setWebHook(process.env.WEBHOOK_URL + WEBHOOK_PATH);

// 3) Подключаем логику бота (создайте файл bot-logic.js рядом с этим)
const registerHandlers = require('./bot-logic');
registerHandlers(bot, base);

// 4) Подключаем Express
const app = express();
// нужен raw body, чтобы TelegramBot.processUpdate мог разобрать JSON
app.use(WEBHOOK_PATH, express.raw({ type: 'application/json' }));

// 5) Обрабатываем POST от Telegram
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body)
    .then(() => res.sendStatus(200))
    .catch(err => {
      console.error('Webhook error:', err);
      res.sendStatus(500);
    });
});

// 6) Простая проверка здоровья
app.get('/', (req, res) => res.send('OK'));

// 7) Запуск
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
