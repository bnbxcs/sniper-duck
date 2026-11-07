import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8899);
const host = process.env.HOST ?? '127.0.0.1';
const { server, scenarios } = createApp({ dbPath: process.env.DB_PATH });

server.listen(port, host, () => {
  console.log(`Sniper Duck: http://${host}:${port} (${scenarios.length} scenarios)`);
});
