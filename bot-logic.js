// bot-logic.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Airtable    = require('airtable');

// --- Настройка Airtable ---
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// --- Мультиязычная поддержка ---
const MESSAGES = {
  uk: {
    chooseLang:   'Оберіть мову / Выберите язык:',
    menuTitle:    'Меню:',
    createReport: '🆕 Створити звіт',
    attachFiles:  'Додайте фото чи документ звіту. Коли все — натисніть "✅ Готово".',
    done:         '✅ Готово',
    addFile:      'Файл додано. Можете додати ще або натиснути "✅ Готово".',
    noFiles:      'Спочатку додайте файли.',
    selectChannels: 'Оберіть канали:',
    confirm:      '🚀 Підтвердити',
    chooseAtLeast:'Оберіть хоча б один канал.',
    reportSaved:  '✅ Звіт збережено!',
    errorSave:    '❌ Помилка збереження.'
  },
  ru: {
    chooseLang:   'Выберите язык / Оберіть мову:',
    menuTitle:    'Меню:',
    createReport: '🆕 Создать отчёт',
    attachFiles:  'Прикрепите фото или документ отчёта. Можно несколько. Когда всё — нажмите "✅ Готово".',
    done:         '✅ Готово',
    addFile:      'Файл добавлен. Можно ещё или нажать "✅ Готово".',
    noFiles:      'Сначала добавьте файлы.',
    selectChannels: 'Выберите каналы:',
    confirm:      '🚀 Подтвердить',
    chooseAtLeast:'Выберите хотя бы один канал.',
    reportSaved:  '✅ Отчёт сохранён!',
    errorSave:    '❌ Ошибка сохранения.'
  }
};

// --- Состояние пользователей ---
const pending = {};   // pending[chatId] = { lang, files:[], username, selectedChannels }
const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

// --- Функция retry для записи в Airtable ---
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

// --- Клавиатуры ---
function makeLangKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [ { text: '🇺🇦 Українська', callback_data: 'lang:uk' } ],
        [ { text: '🇷🇺 Русский',   callback_data: 'lang:ru' } ]
      ]
    }
  };
}

function makeMainMenu(lang) {
  return {
    reply_markup: {
      keyboard: [ [ MESSAGES[lang].createReport ] ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function makeChannelsKeyboard(selected = [], lang) {
  const buttons = CHANNELS.map(ch => ({
    text: (selected.includes(ch) ? '✅ ' : '') + ch,
    callback_data: 'ch:' + ch
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([ { text: MESSAGES[lang].confirm, callback_data: 'submit' } ]);
  return { reply_markup: { inline_keyboard: rows } };
}

// --- Инициализация бота (webhook mode) ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Устанавливаем webhook на Vercel endpoint
bot.setWebHook(`${process.env.WEBHOOK_URL}/api/index`)
   .then(() => console.log('Webhook set to', `${process.env.WEBHOOK_URL}/api/index`))
   .catch(err => console.error('Error setting webhook:', err.message));

// --- Обработчики ---
// Старт: выбираем язык
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  pending[chatId] = { lang: null, files: [], username: msg.from.username || msg.from.first_name };
  bot.sendMessage(chatId, MESSAGES.uk.chooseLang, makeLangKeyboard());
});

// Inline callbacks: выбор языка, каналов, подтверждение
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data   = query.data;
  const state  = pending[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  // выбор языка
  if (data.startsWith('lang:')) {
    const lang = data.split(':')[1];
    state.lang = lang;
    // показываем главное меню
    await bot.editMessageText(MESSAGES[lang].menuTitle, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
    return bot.sendMessage(chatId, MESSAGES[lang].menuTitle, makeMainMenu(lang));
  }

  // дальше пока не выбран язык
  if (!state.lang) return bot.answerCallbackQuery(query.id);

  // переключаем каналы
  if (data.startsWith('ch:')) {
    const ch = data.slice(3);
    const sel = state.selectedChannels;
    state.selectedChannels = sel.includes(ch) ? sel.filter(x => x !== ch) : [...sel, ch];
    return bot.editMessageReplyMarkup(
      makeChannelsKeyboard(state.selectedChannels, state.lang).reply_markup,
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }

  // подтверждение
  if (data === 'submit') {
    if (!state.selectedChannels.length) {
      return bot.answerCallbackQuery(query.id, { text: MESSAGES[state.lang].chooseAtLeast });
    }
    const attachments = state.files.map(f => ({ url: f.url }));
    const comment = state.files.map((f, i) => `Файл${i+1}: ${f.caption}`).join('\n');
    const fields = {
      Employee: state.username,
      Channel:  state.selectedChannels,
      Comment:  comment,
      Attachment: attachments
    };
    try {
      await createRecordWithRetry(fields);
      await bot.editMessageText(MESSAGES[state.lang].reportSaved, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    } catch (e) {
      console.error(e);
      await bot.editMessageText(MESSAGES[state.lang].errorSave, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    }
    delete pending[chatId];
  }
});

// Обработка текстовых сообщений: создание отчёта и загрузка файлов
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const state  = pending[chatId];
  if (!state || !state.lang) return;
  const lang = state.lang;

  // команда создать отчет
  if (msg.text === MESSAGES[lang].createReport) {
    return bot.sendMessage(chatId, MESSAGES[lang].attachFiles, {
      reply_markup: { keyboard: [[MESSAGES[lang].done]], resize_keyboard: true }
    });
  }
  // готово
  if (msg.text === MESSAGES[lang].done) {
    if (!state.files.length) return bot.sendMessage(chatId, MESSAGES[lang].noFiles);
    state.selectedChannels = [];
    return bot.sendMessage(chatId, MESSAGES[lang].selectChannels, makeChannelsKeyboard([], lang));
  }
  // загрузка фото или документа
  if (msg.photo || msg.document) {
    const fileId = msg.photo ? msg.photo.pop().file_id : msg.document.file_id;
    const url    = await bot.getFileLink(fileId);
    state.files.push({ url, caption: msg.caption || '' });
    return bot.sendMessage(chatId, MESSAGES[lang].addFile);
  }
});

// --- Экспорт бота для webhook-функции ---
module.exports = bot;
