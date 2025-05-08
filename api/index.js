// api/index.js
export default function handler(req, res) {
  if (req.method === 'POST') {
    res.status(200).send('OK');          // просто «OK» на POST
  } else {
    res.status(200).send('GET works');   // «GET works» на GET
  }
}

export const config = { api: { bodyParser: false } };

  // GET-запросы для «health check»
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('OK');
}
