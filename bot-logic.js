// bot-logic.js
/**
 * Экспортируем функцию, которая получает готовый bot и готовый airtable-base.
 * В ней мы просто регистрируем хендлеры.
 */
export default function registerBotHandlers(bot, base) {
  // --- i18n ---
  const MESSAGES = {
    uk: {
      chooseLang: 'Обери мову / Выберите язык',
      start:      'Ласкаво просимо! Скористайтеся меню для створення звіту.',
      createReport: '🆕 Створити звіт',
      attach:     'Додайте файли звіту. Коли готові, натисніть "✅ Готово".',
      done:       '✅ Готово',
      addFile:    'Файл додано. Можете додати ще або натиснути "✅ Готово".',
      noFiles:    'Спочатку додайте файли.',
      selectChannels: 'Оберіть канали:',
      confirm:    '🚀 Підтвердити',
      chooseAtLeast: 'Оберіть хоча б один канал.',
      reportSaved:   '✅ Звіт збережено!',
      errorSave:     '❌ Помилка збереження.'
    },
    ru: {
      chooseLang: 'Выберите язык / Оберіть мову',
      start:      'Привет! Используйте меню для создания отчёта.',
      createReport: '🆕 Создать отчёт',
      attach:     'Прикрепите файлы отчёта. Когда готовы, нажмите "✅ Готово".',
      done:       '✅ Готово',
      addFile:    'Файл добавлен. Можно ещё или нажать "✅ Готово".',
      noFiles:    'Сначала прикрепите файлы.',
      selectChannels: 'Выберите каналы:',
      confirm:    '🚀 Подтвердить',
      chooseAtLeast: 'Выберите хотя бы один канал.',
      reportSaved:   '✅ Отчёт сохранён!',
      errorSave:     '❌ Ошибка сохранения.'
    }
  };

  // Временное хранилище состояний чатов
  const pending = {};
  const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

  // Retry–запись в Airtable
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

  // Клавиатуры
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
        keyboard: [[ MESSAGES[lang].createReport ]],
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

  // --- Обработчики Telegram ---
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

  bot.on('callback_query', async query => {
    const id = query.message.chat.id;
    const data = query.data;
    const state = pending[id];
    if (!state) {
      return bot.answerCallbackQuery(query.id, { text: 'Сначала /start' });
    }

    // 1) выбор языка
    if (data.startsWith('lang:')) {
      state.lang = data.split(':')[1];
      return bot.editMessageText(MESSAGES[state.lang].start, {
        chat_id: id,
        message_id: query.message.message_id,
        reply_markup: mainMenuKeyboard(state.lang).reply_markup
      });
    }
    if (!state.lang) {
      return bot.answerCallbackQuery(query.id, { text: 'Сначала выберите язык.' });
    }

    // 2) переключение каналов
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

    // 3) подтверждение
    if (data === 'submit') {
      if (!state.selectedChannels.length) {
        return bot.answerCallbackQuery(query.id, { text: MESSAGES[state.lang].chooseAtLeast });
      }
      const attachments = state.files.map(f => ({ url: f.url }));
      const comment = state.files.map((f,i)=>`File${i+1}: ${f.caption}`).join('\n');
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
      } catch (err) {
        console.error(err);
        await bot.editMessageText(MESSAGES[state.lang].errorSave, {
          chat_id: id,
          message_id: query.message.message_id
        });
      }
      delete pending[id];
    }
  });

  bot.on('message', async msg => {
    const id = msg.chat.id;
    const state = pending[id];
    if (!state || !state.lang) return;

    const text = msg.text;

    // «Создать отчёт»
    if (text === MESSAGES[state.lang].createReport) {
      return bot.sendMessage(id, MESSAGES[state.lang].attach, {
        reply_markup: { keyboard: [[ MESSAGES[state.lang].done ]], resize_keyboard: true }
      });
    }
    // «✅ Готово»
    if (text === MESSAGES[state.lang].done) {
      if (!state.files.length) {
        return bot.sendMessage(id, MESSAGES[state.lang].noFiles);
      }
      state.selectedChannels = [];
      return bot.sendMessage(id, MESSAGES[state.lang].selectChannels,
        channelsKeyboard([], state.lang)
      );
    }
    // загрузка фото/документа
    if (msg.photo || msg.document) {
      const fileId = msg.photo ? msg.photo[msg.photo.length-1].file_id : msg.document.file_id;
      const url = await bot.getFileLink(fileId);
      state.files.push({ url, caption: msg.caption || '' });
      return bot.sendMessage(id, MESSAGES[state.lang].addFile);
    }
  });
}
