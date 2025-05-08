// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
import TelegramBot from 'node-telegram-bot-api';
import Airtable from 'airtable';

// 0) Отключаем встроенный bodyParser Vercel, чтобы читать raw-тело
export const config = { api: { bodyParser: false } };

// 1) Настройка Airtable
Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// 2) Тексты для двух языков
const MESSAGES = {
  uk: {
    chooseLang:   'Оберіть мову:',
    start:        'Ласкаво просимо! Використовуйте меню.',
    createReport: '🆕 Створити звіт',
    attach:       'Додайте фото чи документ. Коли готові — натисніть "✅ Готово".',
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
    chooseLang:   'Выберите язык:',
    start:        'Привет! Используйте меню.',
    createReport: '🆕 Создать отчёт',
    attach:       'Прикрепите фото или документ. Когда всё — нажмите "✅ Готово".',
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

// 3) Инициализация бота в webhook-режиме
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
// Устанавливаем webhook (ENV WEBHOOK_URL должен быть без "/api/index")
bot.setWebHook(process.env.WEBHOOK_URL + '/api/index');

// 4) Хранилище состояния
const pending = {};
const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

// 5) Запись в Airtable с retry
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

// 6) Клавиатуры
function langKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Українська', callback_data: 'lang:uk' }],
        [{ text: 'Русский',   callback_data: 'lang:ru' }]
      ]
    }
  };
}

function mainMenuKeyboard(lang) {
  return {
    reply_markup: {
      keyboard: [[MESSAGES[lang].createReport]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function channelsKeyboard(selected, lang) {
  const buttons = CHANNELS.map(ch => ({
    text: (selected.includes(ch) ? '✅ ' : '') + ch,
    callback_data: 'ch:' + ch
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([{ text: MESSAGES[lang].confirm, callback_data: 'submit' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

// 7) Handlers
// /start — выбор языка
bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  pending[id] = { lang: null, files: [], username: msg.from.username || msg.from.first_name };
  bot.sendMessage(id, MESSAGES.uk.chooseLang, langKeyboard());
});

// inline: выбор языка, каналов, отправка
bot.on('callback_query', async query => {
  const id = query.message.chat.id;
  const state = pending[id];
  const data = query.data;
  if (!state) return bot.answerCallbackQuery(query.id, { text: 'Сначала /start' });

  if (data.startsWith('lang:')) {
    state.lang = data.split(':')[1];
    await bot.editMessageText(
      MESSAGES[state.lang].start,
      { chat_id: id, message_id: query.message.message_id, reply_markup: mainMenuKeyboard(state.lang).reply_markup }
    );
    return;
  }
  if (!state.lang) return bot.answerCallbackQuery(query.id, { text: 'Сначала выберите язык.' });

  if (data.startsWith('ch:')) {
    const ch = data.slice(3);
    state.selectedChannels = state.selectedChannels || [];
    if (state.selectedChannels.includes(ch)) {
      state.selectedChannels = state.selectedChannels.filter(x => x !== ch);
    } else {
      state.selectedChannels.push(ch);
    }
    return bot.editMessageReplyMarkup(
      channelsKeyboard(state.selectedChannels, state.lang).reply_markup,
      { chat_id: id, message_id: query.message.message_id }
    );
  }

  if (data === 'submit') {
    if (!state.selectedChannels || !state.selectedChannels.length) {
      return bot.answerCallbackQuery(query.id, { text: MESSAGES[state.lang].chooseAtLeast });
    }
    const attachments = state.files.map(f => ({ url: f.url }));
    const comment = state.files.map((f, i) => `File${i+1}: ${f.caption}`).join('\n');
    const fields = { Employee: state.username, Channel: state.selectedChannels, Comment: comment, Attachment: attachments };
    try {
      await createRecord(fields);
      await bot.editMessageText(MESSAGES[state.lang].reportSaved, { chat_id: id, message_id: query.message.message_id });
    } catch (err) {
      console.error(err);
      await bot.editMessageText(MESSAGES[state.lang].errorSave, { chat_id: id, message_id: query.message.message_id });
    }
    delete pending[id];
  }
});

// message: создание отчёта, загрузка файлов
bot.on('message', msg => {
  const id = msg.chat.id;
  const state = pending[id];
  if (!state || !state.lang) return;
  const text = msg.text;
  const lang = state.lang;

  if (text === MESSAGES[lang].createReport) {
    return bot.sendMessage(id, MESSAGES[lang].attach, { reply_markup: { keyboard: [[MESSAGES[lang].done]], resize_keyboard: true } });
  }
  if (text === MESSAGES[lang].done) {
    if (!state.files.length) return bot.sendMessage(id, MESSAGES[lang].noFiles);
    state.selectedChannels = [];
    return bot.sendMessage(id, MESSAGES[lang].selectChannels, channelsKeyboard([], lang));
  }
  if (msg.photo || msg.document) {
    const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
    bot.getFileLink(fileId).then(url => {
      state.files.push({ url, caption: msg.caption || '' });
      bot.sendMessage(id, MESSAGES[lang].addFile);
    });
  }
});

// 8) HTTP-handler for Vercel
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const buf = await rawBody(req);
      const update = JSON.parse(buf.toString());
      await bot.processUpdate(update);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook handler error:', err);
      return res.status(500).send('Error');
    }
  }
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send('GET works');
}
