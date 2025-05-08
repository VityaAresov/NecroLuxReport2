// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';

// --- Configure Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- Initialize Telegram Bot in webhook mode ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Set webhook URL (ensure you have set WEBHOOK_URL in Vercel env)
bot.setWebHook(process.env.WEBHOOK_URL).then(() => {
  console.log('Webhook set to', process.env.WEBHOOK_URL);
}).catch(err => console.error('Error setting webhook:', err.message));

// --- In-memory storage and helper functions ---
const pending = {};  // { [chatId]: { files: [], username, selectedChannels } }
const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

async function createRecordWithRetry(fields, retries = 2) {
  try {
    return await base(process.env.AIRTABLE_TABLE_NAME).create([{ fields }]);
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return createRecordWithRetry(fields, retries - 1);
    }
    throw err;
  }
}

function makeChannelsKeyboard(selected = []) {
  const buttons = CHANNELS.map(ch => ({
    text: (selected.includes(ch) ? '✅ ' : '') + ch,
    callback_data: 'ch:' + ch
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([{ text: '🚀 Подтвердить', callback_data: 'submit' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

// --- Telegram handlers ---
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Привет! Нажмите «🆕 Создать отчёт»', {
    reply_markup: { keyboard: [['🆕 Создать отчёт']], resize_keyboard: true }
  });
});

bot.on('message', msg => {
  const chatId = msg.chat.id;
  if (msg.text === '🆕 Создать отчёт') {
    pending[chatId] = { files: [], username: msg.from.username || msg.from.first_name };
    bot.sendMessage(chatId, 'Прикрепите файлы отчёта. Когда всё готово, нажмите «✅ Готово».', {
      reply_markup: { keyboard: [['✅ Готово']], resize_keyboard: true }
    });
  }
});

bot.on('photo', async msg => {
  const chatId = msg.chat.id;
  if (!pending[chatId]) return;
  const fileId = msg.photo.pop().file_id;
  const url = await bot.getFileLink(fileId);
  pending[chatId].files.push({ url, caption: msg.caption || '' });
  bot.sendMessage(chatId, 'Файл добавлен. Можно ещё или нажать «✅ Готово».');
});

bot.on('document', async msg => {
  const chatId = msg.chat.id;
  if (!pending[chatId]) return;
  const url = await bot.getFileLink(msg.document.file_id);
  pending[chatId].files.push({ url, caption: msg.caption || '' });
  bot.sendMessage(chatId, 'Файл добавлен. Можно ещё или нажать «✅ Готово».');
});

bot.onText(/✅ Готово/, msg => {
  const chatId = msg.chat.id;
  const entry = pending[chatId];
  if (!entry || !entry.files.length) return bot.sendMessage(chatId, 'Сначала отправьте файлы.');
  entry.selectedChannels = [];
  bot.sendMessage(chatId, 'Выберите каналы:', makeChannelsKeyboard());
});

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const entry = pending[chatId];
  if (!entry) return bot.answerCallbackQuery(query.id, { text: 'Сначала создайте отчёт.' });

  if (data.startsWith('ch:')) {
    const ch = data.slice(3);
    const sel = entry.selectedChannels;
    entry.selectedChannels = sel.includes(ch) ? sel.filter(x => x !== ch) : [...sel, ch];
    return bot.editMessageReplyMarkup(makeChannelsKeyboard(entry.selectedChannels).reply_markup, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }

  if (data === 'submit') {
    if (!entry.selectedChannels.length) return bot.answerCallbackQuery(query.id, { text: 'Выберите хотя бы один канал.' });
    const attachments = entry.files.map(f => ({ url: f.url }));
    const comment = entry.files.map((f, i) => `Файл${i+1}: ${f.caption}`).join('\n');
    const fields = { Employee: entry.username, Channel: entry.selectedChannels, Comment: comment, Attachment: attachments };
    try {
      await createRecordWithRetry(fields);
      bot.editMessageText('✅ Отчёт сохранён!', { chat_id: chatId, message_id: query.message.message_id });
    } catch (e) {
      console.error(e);
      bot.editMessageText('❌ Ошибка сохранения.', { chat_id: chatId, message_id: query.message.message_id });
    }
    delete pending[chatId];
  }
});

// --- Vercel handler ---
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const buf = await rawBody(req);
    const update = JSON.parse(buf.toString());
    await bot.processUpdate(update);
    res.status(200).send('OK');
  } else {
    res.status(200).send('OK');
  }
}
