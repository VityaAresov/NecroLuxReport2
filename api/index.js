// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
// Импортируем готовый бот с навешанными хендлерами
import bot from '../bot-logic.js';

// Отключаем дефолтный bodyParser Vercel, чтобы читать сырой JSON от Telegram
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Читаем весь буфер тела
      const buf = await rawBody(req);
      const update = JSON.parse(buf.toString());
      // Передаём update в экземпляр бота
      await bot.processUpdate(update);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('❌ Webhook handler error:', err);
      return res.status(500).send('Error');
    }
  }
  // GET-запросы для «health check»
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('OK');
}
