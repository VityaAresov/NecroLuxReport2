// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';

// 1) Отключаем bodyParser Vercel
export const config = { api: { bodyParser: false } };

// 2) Инициализируем бот в webhook‑режиме
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Здесь мы просто один раз регистрируем вебхук на ваш endpoint:
bot.setWebHook(process.env.WEBHOOK_URL);

// 3) Простейшая логика для теста
bot.onText(/\/start/, msg => {
  bot.sendMessage(
    msg.chat.id,
    'Привет! Нажми кнопку ниже →',
    {
      reply_markup: {
        inline_keyboard: [
          [ { text: 'Українська', callback_data: 'lang:uk' } ],
          [ { text: 'Русский',    callback_data: 'lang:ru' } ]
        ]
      }
    }
  );
});

bot.on('callback_query', query => {
  const lang = query.data.split(':')[1];
  const texts = { uk: 'Ви вибрали українську!', ru: 'Вы выбрали русский!' };
  // редактируем сообщение:
  bot.editMessageText(
    texts[lang],
    {
      chat_id:   query.message.chat.id,
      message_id: query.message.message_id
    }
  );
});

// 4) Vercel handler
export default async function handler(req, res) {
  if (req.method === 'POST') {
    // читаем «сырое» тело
    const buf = await rawBody(req);
    const update = JSON.parse(buf.toString());
    await bot.processUpdate(update);
    return res.status(200).send('OK');
  }
  // health‑check по GET
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('GET works');
}
