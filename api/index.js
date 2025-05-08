// api/index.js
import 'dotenv/config';
import rawBody from 'raw-body';
// Импорт логики бота
import bot from '../bot-logic.js';

// Отключаем парсер, используем rawBody
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const buf = await rawBody(req);
      const update = JSON.parse(buf.toString());
      await bot.processUpdate(update);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook processing failed:', err);
      return res.status(500).send('Error');
    }
  }
  // GET для проверки статуса
  res.status(200).send('OK');
}
