import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT || 1234);

// Гарантировать наличие папки ./db независимо от cwd
const dataDir = path.resolve(process.cwd(), 'db');
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'hocuspocus-dev.sqlite');

const server = new Server({
  port,
  extensions: [new SQLite({ database: dbFile })],
  onListen() {
    // eslint-disable-next-line no-console
    console.log(`[hocuspocus] listening on ws://localhost:${port}`);
    console.log(`[hocuspocus] sqlite file: ${dbFile}`);
  },
});

server.listen();
