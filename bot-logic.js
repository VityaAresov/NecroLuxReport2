// bot-logic.js
/**
 * Регистрирует все хендлеры Telegram‑бота.
 * @param {import('node-telegram-bot-api')} bot
 * @param {import('airtable').Base} base
 */
module.exports = function registerBotHandlers(bot, base) {
  // --- i18n ---
  const M = {
    uk: {
      chooseLang: '❓ Оберіть мову:',
      start:      '🎉 Ласкаво просимо! Скористайтеся меню нижче.',
      create:     '🆕 Створити звіт',
      attach:     '📎 Додайте файли звіту. Коли готові — натисніть "✅ Готово".',
      done:       '✅ Готово',
      add:        '✅ Файл додано.',
      noFiles:    '⚠️ Спочатку додайте файли.',
      select:     '📡 Оберіть канали:',
      submit:     '🚀 Підтвердити',
      needOne:    '❗️ Оберіть хоча б один канал.',
      saved:      '✅ Звіт збережено!',
      error:      '❌ Помилка збереження.'
    },
    ru: {
      chooseLang: '❓ Выберите язык:',
      start:      '🎉 Привет! Используйте меню ниже.',
      create:     '🆕 Создать отчёт',
      attach:     '📎 Прикрепите файлы отчёта. Когда готовы — нажмите "✅ Готово".',
      done:       '✅ Готово',
      add:        '✅ Файл добавлен.',
      noFiles:    '⚠️ Сначала добавьте файлы.',
      select:     '📡 Выберите каналы:',
      submit:     '🚀 Подтвердить',
      needOne:    '❗️ Выберите хотя бы один канал.',
      saved:      '✅ Отчёт сохранён!',
      error:      '❌ Ошибка сохранения.'
    }
  };

  // Временное хранилище состояний чатов
  const pending = {};
  // Доступные каналы
  const CHANNELS = ['Telegram','Facebook','WhatsApp','Viber'];

  // retry‑запись в Airtable
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

  // inline‑клавиатура выбора языка
  function langKeyboard() {
    return {
      reply_markup: {
        inline_keyboard: [
          [ { text: 'Українська', callback_data: 'lang:uk' } ],
          [ { text: 'Русский',    callback_data: 'lang:ru' } ]
        ]
      }
    };
  }

  // обычная keyboard главного меню
  function mainKeyboard(lang) {
    return {
      reply_markup: {
        keyboard: [[ M[lang].create ]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  }

  // inline‑клавиатура выбора каналов
  function channelsKeyboard(selected, lang) {
    const rows = [];
    CHANNELS.forEach((ch, i) => {
      const btn = {
        text: (selected.includes(ch) ? '✅ ' : '') + ch,
        callback_data: 'ch:' + ch
      };
      if (i % 2 === 0) rows.push([btn]);
      else rows[rows.length - 1].push(btn);
    });
    // кнопка «🚀 Подтвердить»
    rows.push([ { text: M[lang].submit, callback_data: 'submit' } ]);
    return { reply_markup: { inline_keyboard: rows } };
  }

  // 1) /start — выбираем язык
  bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    pending[chatId] = {
      lang:      null,
      files:     [],
      channels:  [],
      username:  msg.from.username || msg.from.first_name
    };
    bot.sendMessage(chatId, M.uk.chooseLang, langKeyboard());
  });

  // 2) Обработка inline‑кнопок
  bot.on('callback_query', async query => {
    const chatId = query.message.chat.id;
    const data   = query.data;
    const state  = pending[chatId];
    if (!state) {
      return bot.answerCallbackQuery(query.id, 'Сначала отправьте /start');
    }

    // -- выбор языка --
    if (data.startsWith('lang:')) {
      // сохраняем язык
      state.lang = data.split(':')[1];
      // удаляем старую клавиатуру
      await bot.deleteMessage(chatId, query.message.message_id);
      // приветствуем и показываем главное меню
      return bot.sendMessage(chatId, M[state.lang].start, mainKeyboard(state.lang));
    }

    // дальше только если язык уже выбран
    if (!state.lang) {
      return bot.answerCallbackQuery(query.id, 'Сначала выберите язык.');
    }

    // -- переключаем каналы --
    if (data.startsWith('ch:')) {
      const ch = data.slice(3);
      const idx = state.channels.indexOf(ch);
      if (idx > -1) state.channels.splice(idx, 1);
      else state.channels.push(ch);
      return bot.editMessageReplyMarkup(
        channelsKeyboard(state.channels, state.lang).reply_markup,
        { chat_id: chatId, message_id: query.message.message_id }
      );
    }

    // -- подтверждаем отправку --
    if (data === 'submit') {
      if (state.channels.length === 0) {
        return bot.answerCallbackQuery(query.id, M[state.lang].needOne);
      }

      // готовим запись для Airtable
      const attachments = state.files.map(f => ({ url: f.url }));
      const comment     = state.files.map((f,i) => `File${i+1}: ${f.caption}`).join('\n');
      const fields      = {
        Employee:   state.username,
        Channel:    state.channels,
        Comment:    comment,
        Attachment: attachments
      };

      try {
        await createRecord(fields);
        await bot.editMessageText(M[state.lang].saved, {
          chat_id: chatId,
          message_id: query.message.message_id
        });
      } catch (err) {
        console.error(err);
        await bot.editMessageText(M[state.lang].error, {
          chat_id: chatId,
          message_id: query.message.message_id
        });
      }

      // Очищаем накопленные файлы/каналы (но не язык)
      state.files = [];
      state.channels = [];

      // Предлагаем заново создать отчёт
      return bot.sendMessage(
        chatId,
        'Что хотите сделать дальше?',
        mainKeyboard(state.lang)
      );
    }
  });

  // 3) Обработка обычных сообщений: создание отчёта и приём файлов
  bot.on('message', msg => {
    const chatId = msg.chat.id;
    const state  = pending[chatId];
    if (!state || !state.lang) return;

    const text = msg.text;
    const lang = state.lang;

    // а) нажали кнопку "🆕 Создать отчёт"
    if (text === M[lang].create) {
      return bot.sendMessage(
        chatId,
        M[lang].attach,
        { reply_markup: { keyboard: [[ M[lang].done ]], resize_keyboard: true } }
      );
    }

    // б) нажали кнопку "✅ Готово"
    if (text === M[lang].done) {
      if (state.files.length === 0) {
        return bot.sendMessage(chatId, M[lang].noFiles);
      }
      // запускаем выбор каналов
      return bot.sendMessage(
        chatId,
        M[lang].select,
        channelsKeyboard([], lang)
      );
    }

    // в) пришёл файл (фото или документ)
    if (msg.photo || msg.document) {
      const fileId = msg.photo
        ? msg.photo[msg.photo.length - 1].file_id
        : msg.document.file_id;
      bot.getFileLink(fileId).then(url => {
        state.files.push({ url, caption: msg.caption || '' });
        bot.sendMessage(chatId, M[lang].add);
      });
    }
  });
};
