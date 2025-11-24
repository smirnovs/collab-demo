import { Server } from '@hocuspocus/server';
import type { onListenPayload } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import sqlite3 from 'sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT || 1234);

// Гарантировать наличие папки ./db независимо от cwd
const dataDir = path.resolve(process.cwd(), 'db');
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'hocuspocus-dev.sqlite');

// Открываем SQLite в том же файле, что и раньше
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbFile);

// Гарантируем такую же схему, как у @hocuspocus/extension-sqlite по умолчанию
// (если таблица уже есть — команда просто ничего не изменит)
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS "documents" (
      "name" varchar(255) NOT NULL,
      "data" blob NOT NULL,
      UNIQUE(name)
    )`
  );
});

const server = new Server({
  port,
  extensions: [
    new Database({
      // Чтение состояния документа из SQLite
      fetch: async ({ documentName }): Promise<Uint8Array | null> =>
        new Promise((resolve, reject) => {
          db.get<{ data: Buffer }>(
            `
              SELECT data
              FROM "documents"
              WHERE name = $name
              ORDER BY rowid DESC
            `,
            { $name: documentName },
            (error, row) => {
              if (error) {
                return reject(error);
              }

              if (!row) {
                return resolve(null);
              }

              // row.data — Buffer, совместим с Uint8Array
              resolve(row.data);
            }
          );
        }),

      // Запись состояния документа в SQLite
      store: async ({ documentName, state }): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(
            `
              INSERT INTO "documents" ("name", "data")
              VALUES ($name, $data)
              ON CONFLICT(name) DO UPDATE SET data = $data
            `,
            {
              $name: documentName,
              $data: state,
            },
            (error) => {
              if (error) {
                return reject(error);
              }

              resolve();
            }
          );
        }),
    }),
  ],
  onListen: async ({ port }: onListenPayload): Promise<void> => {
    console.log(`[hocuspocus] listening on ws://localhost:${port}`);
    console.log(`[hocuspocus] sqlite file: ${dbFile}`);
  },
});

server.listen();

// Закрытие базы при завершении процесса
process.on('SIGINT', () => {
  console.log('\n[hocuspocus] shutting down, closing SQLite connection...');
  db.close(() => {
    process.exit(0);
  });
});
