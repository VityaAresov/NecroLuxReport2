// api/index.js
export const config = {
  api: { bodyParser: false }
};

export default function handler(req, res) {
  if (req.method === 'POST') {
    // Telegram будет ждать ответ «200 OK»
    return res.status(200).send('OK');
  }

  // на GET отдаём простой текст, чтобы проверить «живо ли»:
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send('GET works');
}
