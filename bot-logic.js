// bot-logic.js

/**
 * Регистрирует все хендлеры Telegram‑бота.
 * @param {import('node-telegram-bot-api')} bot
 * @param {import('airtable').Base} base
 */
module.exports = function registerBotHandlers(bot, base) {
  // --- i18n ---
  const MESSAGES = {
    uk: {
      chooseLang:     'Обери мову / Выберите язык',
      start:          'Ласкаво просимо! Скористайтеся меню для створення звіту.',
      createReport:   '🆕 Створити звіт',
      attach:         'Додайте файли звіту. Коли готові — натисніть "✅ Готово".',
      done:           '✅ Готово',
      addFile:        'Файл додано. Можете додати ще або натиснути "✅ Готово".',
      noFiles:        'Спочатку додайте файли.',
      selectChannels: 'Оберіть канали:',
      confirm:        '🚀 Підтвердити',
      chooseAtLeast:  'Оберіть хоча б один канал.',
      reportSaved:    '✅ Звіт збережено!',
      errorSave:      '❌ Помилка збереження.'
    },
    ru: {
      chooseLang:     'Выберите язык / Оберіть мову',
      start:          'Привет! Используйте меню для создания отчёта.',
      createReport:   '🆕 Создать отчёт',
      attach:         'Прикрепите файлы отчёта. Когда готовы — нажмите "✅ Готово".',
      done:           '✅ Готово',
      addFile:        'Файл добавлен. Можно ещё или нажать "✅ Готово".',
      noFiles:        'Сначала добавьте файлы.',
      selectChannels: 'Выберите каналы:',
      confirm:        '🚀 Подтвердить',
      chooseAtLeast:  'Выберите хотя бы один канал.',
      reportSaved:    '✅ Отчёт сохранён!',
      errorSave:      '❌ Ошибка сохранения.'
    }
  };

  // Временное хранилище состояний чатов
  const pending = {};
  const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

  // Функция с retry для записи в Airtable
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

  // Клавиатура выбора языка
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

  // Главное меню после выбора языка
  function mainMenuKeyboard(lang) {
    return {
      reply_markup: {
        keyboard: [[ MESSAGES[lang].createReport ]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  }

  // Inline‑клавиатура выбора каналов
  function channelsKeyboard(selected, lang) {
    const buttons = CHANNELS.map(ch => ({
      text: (selected.includes(ch) ? '✅ ' : '') + ch,
      callback_data: 'ch:' + ch
    }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    // кнопка "Подтвердить"
    rows.push([{ text: MESSAGES[lang].confirm, callback_data: 'submit' }]);
    return { reply_markup: { inline_keyboard: rows } };
  }

  // 1) /start — выбор языка
  bot.onText(/\/start/, msg => {
    const id = msg.chat.id;
    pending[id] = {
      lang: null,
      files: [],
      selectedChannels: [],
      username: msg.from.username || msg.from.first_name
    };
    bot.sendMessage(id, MESSAGES.uk.chooseLang, langKeyboard());
  });

  // 2) Обработка inline‑кнопок: язык, каналы, submit
  bot.on('callback_query', async query => {
    const id = query.message.chat.id;
    const state = pending[id];
    const data  = query.data;
    if (!state) {
      return bot.answerCallbackQuery(query.id, { text: 'Сначала отправьте /start' });
    }

    // выбор языка
    if (data.startsWith('lang:')) {
      state.lang = data.split(':')[1];
      return bot.editMessageText(MESSAGES[state.lang].start, {
        chat_id: id,
        message_id: query.message.message_id,
        reply_markup: mainMenuKeyboard(state.lang).reply_markup
      });
    }
    // не выбран язык — отдать ошибку
    if (!state.lang) {
      return bot.answerCallbackQuery(query.id, { text: 'Сначала выберите язык.' });
    }

    // переключение каналов
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

    // подтверждение "submit"
    if (data === 'submit') {
      if (!state.selectedChannels.length) {
        return bot.answerCallbackQuery(query.id, { text: MESSAGES[state.lang].chooseAtLeast });
      }
      // готовим запись в Airtable
      const attachments = state.files.map(f => ({ url: f.url }));
      const comment = state.files.map((f,i) => `File${i+1}: ${f.caption}`).join('\n');
      const fields = {
        Employee:   state.username,
        Channel:    state.selectedChannels,
        Comment:    comment,
        Attachment: attachments
      };
      try {
        await createRecord(fields);
        await bot.editMessageText(MESSAGES[state.lang].reportSaved, {
          chat_id: id,
          message_id: query.message.message_id
        });
      } catch (e) {
        console.error(e);
        await bot.editMessageText(MESSAGES[state.lang].errorSave, {
          chat_id: id,
          message_id: query.message.message_id
        });
      }
      delete pending[id];
    }
  });

  // 3) Обработка обычных сообщений: "Создать отчёт", "Готово", загрузка файлов
  bot.on('message', async msg => {
    const id = msg.chat.id;
    const state = pending[id];
    if (!state || !state.lang) return;

    const text = msg.text;
    const lang = state.lang;

    // нажали кнопку "🆕 Создать отчёт"
    if (text === MESSAGES[lang].createReport) {
      return bot.sendMessage(id, MESSAGES[lang].attach, {
        reply_markup: { keyboard: [[ MESSAGES[lang].done ]], resize_keyboard: true }
      });
    }
    // нажали кнопку "✅ Готово"
    if (text === MESSAGES[lang].done) {
      if (!state.files.length) {
        return bot.sendMessage(id, MESSAGES[lang].noFiles);
      }
      state.selectedChannels = [];
      return bot.sendMessage(id, MESSAGES[lang].selectChannels,
        channelsKeyboard([], lang)
      );
    }
    // прислали файл (фото или документ)
    if (msg.photo || msg.document) {
      const fileId = msg.photo
        ? msg.photo[msg.photo.length - 1].file_id
        : msg.document.file_id;
      const url = await bot.getFileLink(fileId);
      state.files.push({ url, caption: msg.caption || '' });
      return bot.sendMessage(id, MESSAGES[lang].addFile);
    }
  });
};
