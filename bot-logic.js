require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Airtable   = require('airtable');

// Настройка Airtable (как было)
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// Создаём бота **без** polling
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);

// Ваша существующая логика:
// bot.onText(/\/start/, ...)
// bot.on('message', ...)
// bot.on('callback_query', ...)
// …и т.д.

module.exports = bot;
