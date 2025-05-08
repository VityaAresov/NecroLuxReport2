// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Airtable   = require('airtable');

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
bot.on('polling_error', err => console.error('Polling error:', err));
process.on('unhandledRejection', (reason, promise) => console.error('Unhandled Rejection at:', promise, 'reason:', reason));

// Настройка Airtable
Airtable.configure({ endpointUrl: 'https://api.airtable.com', apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// Хранилище состояния
const pending = {};  // pending[chatId] = { files: [...], username, selectedChannels }
const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

// Retry для Airtable
async function createRecordWithRetry(fields, retries = 2) {
  try { return await base(process.env.AIRTABLE_TABLE_NAME).create([{ fields }]); }
  catch (err) { if (retries>0) { await new Promise(r=>setTimeout(r,1000)); return createRecordWithRetry(fields,retries-1);} throw err; }
}

// Inline‑клавиатура для выбора каналов
function makeChannelsKeyboard(selected=[]) {
  const buttons = CHANNELS.map(ch=>({ text:(selected.includes(ch)?'✅ ':'')+ch, callback_data:'ch:'+ch }));
  const rows = [];
  for(let i=0;i<buttons.length;i+=2) rows.push(buttons.slice(i,i+2));
  rows.push([{ text:'🚀 Подтвердить', callback_data:'submit' }]);
  return { reply_markup:{ inline_keyboard: rows }};
}

// Клавиатура меню
const mainMenu = {
  reply_markup: {
    keyboard: [ [ '🆕 Создать отчёт' ] ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

// /start — показываем меню
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Меню:', mainMenu);
});

// Текстовое меню — «Создать отчёт»
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (text === '🆕 Создать отчёт') {
    pending[chatId] = { files: [], username: msg.from.username||msg.from.first_name };
    bot.sendMessage(chatId, 'Прикрепите фото или документ отчёта. Можно несколько. Когда всё, нажмите «Готово».', {
      reply_markup: { keyboard: [ ['✅ Готово'] ], resize_keyboard: true, one_time_keyboard: true }
    });
  }
});

// Приём файлов
async function handleFile(msg, fileId) {
  const chatId = msg.chat.id;
  if (!pending[chatId]) return;
  const url = await bot.getFileLink(fileId);
  pending[chatId].files.push({ url, caption: msg.caption||'' });
  bot.sendMessage(chatId, 'Добавлено. Можно ещё или нажать «Готово».');
}
bot.on('photo', async msg => handleFile(msg, msg.photo.pop().file_id));
bot.on('document', async msg => handleFile(msg, msg.document.file_id));

// Завершение файла — кнопка ✅ Готово
bot.onText(/✅ Готово/, msg => {
  const chatId = msg.chat.id;
  const entry = pending[chatId];
  if (!entry || !entry.files.length) {
    return bot.sendMessage(chatId, 'Сначала добавьте файлы.');
  }
  entry.selectedChannels = [];
  bot.sendMessage(chatId, 'Выберите каналы:', makeChannelsKeyboard());
});

// Обработка inline-кнопок
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const entry = pending[chatId];
  if (!entry) return bot.answerCallbackQuery(query.id, { text:'Начните отчёт сначала через меню.' });

  if (data.startsWith('ch:')) {
    const ch = data.slice(3);
    const sel = entry.selectedChannels;
    entry.selectedChannels = sel.includes(ch)? sel.filter(x=>x!==ch): [...sel, ch];
    return bot.editMessageReplyMarkup(makeChannelsKeyboard(entry.selectedChannels).reply_markup, { chat_id:chatId, message_id:query.message.message_id });
  }

  if (data === 'submit') {
    if (!entry.selectedChannels.length) return bot.answerCallbackQuery(query.id, { text:'Отметьте хотя бы один канал.' });
    const attachments = entry.files.map(f=>({ url:f.url }));
    const comment = entry.files.map((f,i)=>`Файл${i+1}: ${f.caption}`).join('\n');
    const fields = { Employee: entry.username, Channel: entry.selectedChannels, Comment: comment, Attachment: attachments };
    try {
      await createRecordWithRetry(fields);
      bot.editMessageText('✅ Отчёт сохранён!', { chat_id:chatId, message_id:query.message.message_id });
    } catch (e) {
      console.error(e);
      bot.editMessageText('❌ Ошибка сохранения.', { chat_id:chatId, message_id:query.message.message_id });
    }
    delete pending[chatId];
  }
});

// Остальные
bot.on('message', msg => {
  const txt = msg.text || '';
  if (!txt.startsWith('/') && txt !== '🆕 Создать отчёт' && txt !== '✅ Готово' && !msg.photo && !msg.document) {
    bot.sendMessage(msg.chat.id, 'Выберите действие в меню: /start');
  }
});
