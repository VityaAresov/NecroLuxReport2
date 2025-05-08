// bot-logic.js
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';
import 'dotenv/config';

// --- Конфигурация Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- i18n ---
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

// --- Создание экземпляра бота в режиме webhook ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
bot.setWebHook(process.env.WEBHOOK_URL);

// --- Временное хранилище ---
const pending = {};
const CHANNELS = ['Telegram', 'Facebook', 'WhatsApp', 'Viber'];

// Создание записи в Airtable с повтором
async function createRecord(fields, retries = 2) {
  try {
    await base(process.env.AIRTABLE_TABLE_NAME).create([{ fields }]);
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return createRecord(fields, retries - 1);
    }
    throw err;
  }
}

// Клавиатура выбора каналов
function getChannelsKeyboard(selected = [], lang = 'uk') {
  const buttons = CHANNELS.map(ch => ({ text: (selected.includes(ch) ? '✅ ' : '') + ch, callback_data: 'ch:' + ch }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: MESSAGES[lang].confirm, callback_data: 'submit' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

// Клавиатура выбора языка
function getLangKeyboard() {
  return { reply_markup: { inline_keyboard: [
    [{ text: 'Українська', callback_data: 'lang:uk' }],
    [{ text: 'Русский', callback_data: 'lang:ru' }]
  ] } };
}

// Обработчики Telegram
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  pending[chatId] = { lang: null, files: [], username: msg.from.username || msg.from.first_name };
  bot.sendMessage(chatId, MESSAGES.uk.chooseLang, getLangKeyboard());
});

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = pending[chatId];
  if (!state) return;

  // выбор языка
  if (data.startsWith('lang:')) {
    state.lang = data.split(':')[1];
    return bot.editMessageText(MESSAGES[state.lang].start, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { keyboard: [[MESSAGES[state.lang].createReport]], resize_keyboard: true }
    });
  }
  if (!state.lang) return;

  // выбор каналов
  if (data.startsWith('ch:')) {
    const ch = data.slice(3);
    state.selectedChannels = state.selectedChannels || [];
    state.selectedChannels = state.selectedChannels.includes(ch)
      ? state.selectedChannels.filter(c => c !== ch)
      : [...state.selectedChannels, ch];
    return bot.editMessageReplyMarkup(getChannelsKeyboard(state.selectedChannels, state.lang).reply_markup, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }

  // подтверждение
  if (data === 'submit') {
    if (!state.selectedChannels || !state.selectedChannels.length) {
      return bot.answerCallbackQuery(query.id, { text: MESSAGES[state.lang].chooseAtLeast });
    }
    const attachments = state.files.map(f => ({ url: f.url }));
    const comment = state.files.map((f, i) => `File${i + 1}: ${f.caption}`).join('\n');
    const fields = { Employee: state.username, Channel: state.selectedChannels, Comment: comment, Attachment: attachments };
    try {
      await createRecord(fields);
      await bot.editMessageText(MESSAGES[state.lang].reportSaved, { chat_id: chatId, message_id: query.message.message_id });
    } catch (e) {
      console.error(e);
      await bot.editMessageText(MESSAGES[state.lang].errorSave, { chat_id: chatId, message_id: query.message.message_id });
    }
    delete pending[chatId];
  }
});

bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const state = pending[chatId];
  if (!state || !state.lang) return;
  const text = msg.text;

  if (text === MESSAGES[state.lang].createReport) {
    return bot.sendMessage(chatId, MESSAGES[state.lang].attach, { reply_markup: { keyboard: [[MESSAGES[state.lang].done]], resize_keyboard: true } });
  }
  if (text === MESSAGES[state.lang].done) {
    if (!state.files.length) {
      return bot.sendMessage(chatId, MESSAGES[state.lang].noFiles);
    }
    state.selectedChannels = [];
    return bot.sendMessage(chatId, MESSAGES[state.lang].selectChannels, getChannelsKeyboard([], state.lang));
  }

  if (msg.photo || msg.document) {
    const fileId = msg.photo ? msg.photo.pop().file_id : msg.document.file_id;
    const url = await bot.getFileLink(fileId);
    state.files.push({ url, caption: msg.caption || '' });
    return bot.sendMessage(chatId, MESSAGES[state.lang].addFile);
  }
});

// Экспорт экземпляра бота
export default bot;
