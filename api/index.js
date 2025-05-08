// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';

// Отключаем bodyParser для получения raw тела
export const config = { api: { bodyParser: false } };

// Настройка Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// Тексты для двух языков
const MESSAGES = {
  uk: { /* ...как выше...*/ },
  ru: { /* ...как выше...*/ }
};

// Инициализация бота в режиме webhook
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Устанавливаем webhook: WEBHOOK_URL должен быть полным URL до этого handler-а
bot.setWebHook(process.env.WEBHOOK_URL);

// Временное хранилище и утилиты
const pending = {};
const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];
async function createRecord(fields, retries = 2) {
  try {
    await base(process.env.AIRTABLE_TABLE_NAME).create([{ fields }]);
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return createRecord(fields, retries - 1);
    }
    throw e;
  }
}

// Функции генерации клавиатур (langKeyboard, mainMenuKeyboard, channelsKeyboard)
// ... (скопируйте свои определения клавиатур без изменений) ...

// Регистрация обработчиков (onText, callback_query, message)
// ... (скопируйте свои обработчики без изменений) ...

// HTTP-хендлер для Vercel
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const buf = await rawBody(req);
      const update = JSON.parse(buf.toString());
      await bot.processUpdate(update);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook error:', err);
      return res.status(500).send('Error');
    }
  }
  // Health check
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send('GET works');
}
