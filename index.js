// index.js
import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';
import botLogic from './bot-logic.js'; // ваш файл с регистрацией хендлеров

// 1. Настроить Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// 2. Создать экземпляр бота (webhook mode)
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
// например: https://<ваш‑сервис>.onrender.com
bot.setWebHook(`${WEBHOOK_URL}/webhook`);

// 3. Подключить вашу логику
//    В bot-logic.js экспортируйте default function(bot, base){ /* reg handlers */ }
botLogic(bot, base);

// 4. Запустить Express
const app = express();
// Telegram присылает JSON
app.use(express.json());

// Health‑check
app.get('/', (req, res) => {
  res.send('OK');
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    await bot.processUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Error handling update:', err);
    res.sendStatus(500);
  }
});

// Старт
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
