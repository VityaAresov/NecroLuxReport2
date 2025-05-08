// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';

// --- Configure Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- i18n strings ---
const MESSAGES = {
  uk: {
    chooseLang: 'Обери мову / Выберите язык',
    start: 'Ласкаво просимо! Скористайтеся меню для створення звіту.',
    createReport: '🆕 Створити звіт',
    attach: 'Додайте файли звіту. Коли готові, натисніть "✅ Готово".',
    done: '✅ Готово',
    addFile: 'Файл додано. Можете додати ще або натиснути "✅ Готово".',
    noFiles: 'Спочатку додайте файли.',
    selectChannels: 'Оберіть канали:',
    confirm: '🚀 Підтвердити',
    chooseAtLeast: 'Оберіть хоча б один канал.',
    reportSaved: '✅ Звіт збережено!',
    errorSave: '❌ Помилка збереження.',
  },
  ru: {
    chooseLang: 'Выберите язык / Оберіть мову',
    start: 'Привет! Используйте меню для создания отчёта.',
    createReport: '🆕 Создать отчёт',
    attach: 'Прикрепите файлы отчёта. Когда готовы, нажмите "✅ Готово".',
    done: '✅ Готово',
    addFile: 'Файл добавлен. Можно ещё или нажать "✅ Готово".',
    noFiles: 'Сначала прикрепите файлы.',
    selectChannels: 'Выберите каналы:',
    confirm: '🚀 Подтвердить',
    chooseAtLeast: 'Выберите хотя бы один канал.',
    reportSaved: '✅ Отчёт сохранён!',
    errorSave: '❌ Ошибка сохранения.',
  }
};

// --- Initialize Telegram Bot in webhook mode ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
bot.setWebHook(process.env.WEBHOOK_URL);

// --- In-memory storage and helper functions ---
const pending = {}; // pending[chatId] = { lang, files:[], username, selectedChannels }
const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

async function createRecordWithRetry(fields, retries = 2) {
  try { return await base(process.env.AIRTABLE_TABLE_NAME).create([{ fields }]); }
  catch (err) { if (retries>0) { await new Promise(r=>setTimeout(r,1000)); return createRecordWithRetry(fields, retries-1);} throw err; }
}

function makeChannelsKeyboard(selected = [], lang='uk') {
  const buttons = CHANNELS.map(ch => ({ text: (selected.includes(ch)? '✅ ':'') + ch, callback_data: 'ch:'+ch }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i+2));
  rows.push([{ text: MESSAGES[lang].confirm, callback_data: 'submit' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function makeLangKeyboard() {
  return { reply_markup: { inline_keyboard: [
    [{ text: 'Українська', callback_data: 'lang:uk' }],
    [{ text: 'Русский', callback_data: 'lang:ru' }]
  ] } };
}

// --- Telegram handlers ---
bot.onText(/\/start/, msg => {
  pending[msg.chat.id] = { lang: null, files: [], username: msg.from.username || msg.from.first_name };
  bot.sendMessage(msg.chat.id, MESSAGES.uk.chooseLang, makeLangKeyboard());
});

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = pending[chatId];
  if (data.startsWith('lang:')) {
    const lang = data.split(':')[1];
    state.lang = lang;
    bot.editMessageText(MESSAGES[lang].start, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { keyboard: [[MESSAGES[lang].createReport]], resize_keyboard: true }
    });
    return;
  }
  if (!state.lang) return bot.answerCallbackQuery(query.id);

  if (data.startsWith('ch:')) {
    const ch = data.slice(3);
    const sel = state.selectedChannels;
    state.selectedChannels = sel.includes(ch)? sel.filter(x=>x!==ch): [...sel, ch];
    return bot.editMessageReplyMarkup(
      makeChannelsKeyboard(state.selectedChannels, state.lang).reply_markup,
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }
  if (data === 'submit') {
    if (!state.selectedChannels.length) return bot.answerCallbackQuery(query.id, { text: MESSAGES[state.lang].chooseAtLeast });
    const attachments = state.files.map(f=>({ url: f.url }));
    const comment = state.files.map((f,i)=>`File${i+1}: ${f.caption}`).join('\n');
    const fields = { Employee: state.username, Channel: state.selectedChannels, Comment: comment, Attachment: attachments };
    try {
      await createRecordWithRetry(fields);
      bot.editMessageText(MESSAGES[state.lang].reportSaved, { chat_id: chatId, message_id: query.message.message_id });
    } catch (e) {
      console.error(e);
      bot.editMessageText(MESSAGES[state.lang].errorSave, { chat_id: chatId, message_id: query.message.message_id });
    }
    delete pending[chatId];
  }
});

bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const state = pending[chatId];
  if (!state || !state.lang) return;
  const text = msg.text;
  const lang = state.lang;
  if (text === MESSAGES[lang].createReport) {
    bot.sendMessage(chatId, MESSAGES[lang].attach, { reply_markup: { keyboard: [[MESSAGES[lang].done]], resize_keyboard: true } });
    return;
  }
  if (text === MESSAGES[lang].done) {
    if (!state.files.length) return bot.sendMessage(chatId, MESSAGES[lang].noFiles);
    state.selectedChannels = [];
    bot.sendMessage(chatId, MESSAGES[lang].selectChannels, makeChannelsKeyboard([], lang));
    return;
  }
  if (msg.photo || msg.document) {
    const fileId = msg.photo ? msg.photo.pop().file_id : msg.document.file_id;
    const url = await bot.getFileLink(fileId);
    state.files.push({ url, caption: msg.caption || '' });
    return bot.sendMessage(chatId, MESSAGES[lang].addFile);
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
