// index.js
import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import rawBody from 'raw-body';
import Airtable from 'airtable';
import botLogic from './bot‑logic.js';  // ваш файл с регистрацией хендлеров

// --- Настройка Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- Инициализация бота в режиме webhook ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Устанавливаем вебхук на URL Render-а
// В .env: RENDER_EXTERNAL_URL=https://<your‑service>.onrender.com
const WEBHOOK_URL = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
await bot.setWebHook(WEBHOOK_URL);

// --- Подключаем логику бота (inline‑команды, onText, onMessage) ---
botLogic(bot, base);

// --- Запускаем Express ---
const app = express();

// нужно отключить встроенный парсер JSON для /webhook, чтобы бот мог прочитать сырое тело:
app.post('/webhook', async (req, res) => {
  try {
    const buf = await rawBody(req);
    const update = JSON.parse(buf.toString());
    await bot.processUpdate(update);
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error', e);
    res.sendStatus(500);
  }
});

// просто для проверки доступности
app.get('/', (req, res) => {
  res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
