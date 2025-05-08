// bot-logic.js
module.exports = function registerBotHandlers(bot, base) {
  // --- i18n ---
  const M = {
    uk: {
      chooseLang: 'Обери мову:',
      start: 'Ласкаво просимо! Використайте меню.',
      create: '🆕 Створити звіт',
      attach: 'Додайте файли. Коли готові — натисніть "✅ Готово".',
      done: '✅ Готово',
      add: 'Файл додано.',
      noFiles: 'Спочатку додайте файли.',
      select: 'Оберіть канали:',
      submit: '🚀 Підтвердити',
      needOne: 'Оберіть хоча б один канал.',
      saved: '✅ Звіт збережено!',
      error: '❌ Помилка збереження.'
    },
    ru: {
      chooseLang: 'Выберите язык:',
      start: 'Привет! Используйте меню.',
      create: '🆕 Создать отчёт',
      attach: 'Прикрепите файлы. Когда готовы — нажмите "✅ Готово".',
      done: '✅ Готово',
      add: 'Файл добавлен.',
      noFiles: 'Сначала добавьте файлы.',
      select: 'Выберите каналы:',
      submit: '🚀 Подтвердить',
      needOne: 'Выберите хотя бы один канал.',
      saved: '✅ Отчёт сохранён!',
      error: '❌ Ошибка сохранения.'
    }
  };

  const pending = {};
  const CH = ['Telegram','Facebook','WhatsApp','Viber'];

  async function createRecord(fields, retries = 2) {
    try {
      await base(process.env.AIRTABLE_TABLE_NAME).create([{ fields }]);
    } catch (e) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r,1000));
        return createRecord(fields, retries-1);
      }
      throw e;
    }
  }

  function langKb() {
    return { reply_markup: { inline_keyboard: [
      [{ text: 'Українська', callback_data: 'lang:uk' }],
      [{ text: 'Русский',    callback_data: 'lang:ru' }]
    ] } };
  }

  function mainKb(lang) {
    return { reply_markup: {
      keyboard: [[ M[lang].create ]],
      resize_keyboard: true,
      one_time_keyboard: true
    } };
  }

  function channelsKb(sel, lang) {
    const rows = [];
    CH.forEach((ch,i) => {
      const txt = (sel.includes(ch)?'✅ ':'')+ch;
      if (i%2===0) rows.push([ { text: txt, callback_data: 'ch:'+ch } ]);
      else rows[rows.length-1].push({ text: txt, callback_data:'ch:'+ch });
    });
    rows.push([ { text: M[lang].submit, callback_data:'submit' } ]);
    return { reply_markup:{ inline_keyboard: rows } };
  }

  // /start
  bot.onText(/\/start/, msg => {
    const c = msg.chat.id;
    pending[c] = { lang:null, files:[], ch:[], user: msg.from.username||msg.from.first_name };
    bot.sendMessage(c, M.uk.chooseLang, langKb());
  });

  bot.on('callback_query', async q => {
    const c = q.message.chat.id;
    const st = pending[c];
    const d = q.data;
    if (!st) return bot.answerCallbackQuery(q.id,'Сначала /start');
    // язык
    if (d.startsWith('lang:')) {
      st.lang = d.split(':')[1];
      return bot.editMessageText(M[st.lang].start, {
        chat_id:c, message_id:q.message.message_id,
        reply_markup: mainKb(st.lang).reply_markup
      });
    }
    if (!st.lang) return bot.answerCallbackQuery(q.id,'Сначала выберите язык.');

    // выбор каналов
    if (d.startsWith('ch:')) {
      const cho = d.slice(3);
      st.ch = st.ch.includes(cho) ? st.ch.filter(x=>x!==cho) : [...st.ch,cho];
      return bot.editMessageReplyMarkup(channelsKb(st.ch, st.lang).reply_markup,{
        chat_id:c, message_id:q.message.message_id
      });
    }

    // submit
    if (d==='submit') {
      if (!st.ch.length) return bot.answerCallbackQuery(q.id, M[st.lang].needOne);
      const attach = st.files.map((f,i)=>({ url:f.url }));
      const comment = st.files.map((f,i)=>`File${i+1}: ${f.caption}`).join('\n');
      const fields = { Employee:st.user, Channel:st.ch, Comment:comment, Attachment:attach };
      try {
        await createRecord(fields);
        await bot.editMessageText(M[st.lang].saved,{ chat_id:c, message_id:q.message.message_id });
      } catch(e){
        console.error(e);
        await bot.editMessageText(M[st.lang].error,{ chat_id:c, message_id:q.message.message_id });
      }
      delete pending[c];
    }
  });

  bot.on('message', msg => {
    const c = msg.chat.id;
    const st = pending[c];
    if (!st || !st.lang) return;
    const txt = msg.text;
    const L = st.lang;

    // «Создать отчёт»
    if (txt===M[L].create) {
      return bot.sendMessage(c, M[L].attach,{
        reply_markup:{ keyboard:[[ M[L].done ]], resize_keyboard:true }
      });
    }
    // «Готово»
    if (txt===M[L].done) {
      if (!st.files.length) {
        return bot.sendMessage(c, M[L].noFiles);
      }
      st.ch = [];
      return bot.sendMessage(c, M[L].select, channelsKb([],L));
    }
    // файлы
    if (msg.photo||msg.document) {
      const fid = msg.photo ? msg.photo.pop().file_id : msg.document.file_id;
      bot.getFileLink(fid).then(url=>{
        st.files.push({ url, caption: msg.caption||'' });
        bot.sendMessage(c, M[L].add);
      });
    }
  });
};
