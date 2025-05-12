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
      start:      '🎉 Ласкаво просимо! Використайте меню нижче.',
      create:     '🆕 Створити звіт',
      attach:     '📎 Додайте файли звіту. Коли готові — натисніть "✅ Готово".',
      done:       '✅ Готово',
      add:        '✅ Файл додано.',
      noFiles:    '⚠️ Спочатку додайте файли.',
      select:     '📡 Оберіть канали:',
      submit:     '🚀 Підтвердити',
      needOne:    '❗️ Оберіть хоча б один канал.',
      saved:      '✅ Звіт збережено!',
      error:      '❌ Помилка збереження.',
      handbook: '📘 Довідник',
      contact:  '📞 Звʼязатися з менеджером',
      handbookLink: 'Ознайомтесь з довідником за посиланням:',
      contactLink:  'Для звʼязку з менеджером перейдіть за посиланням:'
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
      error:      '❌ Ошибка сохранения.',
      handbook: '📘 Справочник',
      contact:  '📞 Связаться с Менеджером',
      handbookLink: 'Ознакомьтесь со справочником по ссылке:',
      contactLink:  'Для связи с менеджером перейдите по ссылке:'
    }
  };

  // Хранилище состояния по chatId
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
          [{ text: 'Українська', callback_data: 'lang:uk' }],
          [{ text: 'Русский',    callback_data: 'lang:ru' }]
        ]
      }
    };
  }

  // обычная keyboard главного меню
  function mainKeyboard(lang) {
    return {
      reply_markup: {
        keyboard: [
        [ M[lang].create ],
        [ M[lang].handbook ],
        [ M[lang].contact ]
      ],
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
    rows.push([{ text: M[lang].submit, callback_data: 'submit' }]);
    return { inline_keyboard: rows };
  }

  // 1) /start — выбираем язык
  bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    pending[chatId] = {
      lang:     null,
      files:    [],
      channels: [],
      username: msg.from.username || msg.from.first_name
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
      state.lang = data.split(':')[1];
      await bot.deleteMessage(chatId, query.message.message_id);
      return bot.sendMessage(chatId, M[state.lang].start, mainKeyboard(state.lang));
    }

    if (!state.lang) {
      return bot.answerCallbackQuery(query.id, 'Сначала выберите язык.');
    }

    // -- выбор каналов --
    if (data.startsWith('ch:')) {
      const ch = data.slice(3);
      const idx = state.channels.indexOf(ch);
      if (idx > -1) state.channels.splice(idx, 1);
      else state.channels.push(ch);
      return bot.editMessageReplyMarkup(
        { inline_keyboard: channelsKeyboard(state.channels, state.lang) },
        { chat_id: chatId, message_id: query.message.message_id }
      );
    }

    // -- подтверждение отправки --
    if (data === 'submit') {
      if (state.channels.length === 0) {
        return bot.answerCallbackQuery(query.id, M[state.lang].needOne);
      }
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
      // Очищаем файлы и каналы, но сохраняем язык
      state.files = [];
      state.channels = [];
      // Предлагаем создать новый отчёт
      return bot.sendMessage(chatId, 'Что хотите сделать дальше?', mainKeyboard(state.lang));
    }
  });

  // 3) Обработка сообщений: создание отчёта и приём файлов
  bot.on('message', msg => {
    const chatId = msg.chat.id;
    const state  = pending[chatId];
    if (!state || !state.lang) return;

    const text = msg.text;
    const lang = state.lang;

    // а) Создать отчёт
    if (text === M[lang].create) {
      return bot.sendMessage(chatId, M[lang].attach, {
        reply_markup: {
          keyboard: [[ M[lang].done ]],
          resize_keyboard: true
        }
      });
    }
    // б) Готово — убрать клавиатуру и показать inline‑каналы
    if (text === M[lang].done) {
      if (state.files.length === 0) {
        return bot.sendMessage(chatId, M[lang].noFiles);
      }
      return bot.sendMessage(chatId, M[lang].select, {
        reply_markup: {
          inline_keyboard: channelsKeyboard([], lang),
          remove_keyboard: true
        }
      });
    }
    // в) Файлы
    if (msg.photo || msg.document) {
      const fileId = msg.photo ? msg.photo.pop().file_id : msg.document.file_id;
      bot.getFileLink(fileId).then(url => {
        state.files.push({ url, caption: msg.caption || '' });
        bot.sendMessage(chatId, M[lang].add);
       });
     }
// г) Дополнительные команды
if (text === M[lang].handbook) {
  return bot.sendMessage(chatId, `${M[lang].handbookLink}\nhttps://docs.google.com/document/d/1wHTaZDPRmG-1JmZqK2yHzK6F6KavJsodOEqnts3FXws/view`);
}
if (text === M[lang].contact) {
  return bot.sendMessage(chatId, `${M[lang].contactLink}\nhttps://t.me/vitya_aresov`);
}
  });
};
