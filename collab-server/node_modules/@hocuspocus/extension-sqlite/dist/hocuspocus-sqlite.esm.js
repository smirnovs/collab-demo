import { Database } from '@hocuspocus/extension-database';
import sqlite3 from 'sqlite3';
import kleur from 'kleur';

const schema = `CREATE TABLE IF NOT EXISTS "documents" (
  "name" varchar(255) NOT NULL,
  "data" blob NOT NULL,
  UNIQUE(name)
)`;
const selectQuery = `
  SELECT data FROM "documents" WHERE name = $name ORDER BY rowid DESC
`;
const upsertQuery = `
  INSERT INTO "documents" ("name", "data") VALUES ($name, $data)
    ON CONFLICT(name) DO UPDATE SET data = $data
`;
const SQLITE_INMEMORY = ":memory:";
class SQLite extends Database {
    constructor(configuration) {
        super({});
        this.configuration = {
            database: SQLITE_INMEMORY,
            schema,
            fetch: async ({ documentName }) => {
                return new Promise((resolve, reject) => {
                    var _a;
                    (_a = this.db) === null || _a === void 0 ? void 0 : _a.get(selectQuery, {
                        $name: documentName,
                    }, (error, row) => {
                        if (error) {
                            reject(error);
                        }
                        resolve(row === null || row === void 0 ? void 0 : row.data);
                    });
                });
            },
            store: async ({ documentName, state }) => {
                var _a;
                (_a = this.db) === null || _a === void 0 ? void 0 : _a.run(upsertQuery, {
                    $name: documentName,
                    $data: state,
                });
            },
        };
        this.configuration = {
            ...this.configuration,
            ...configuration,
        };
    }
    async onConfigure() {
        this.db = new sqlite3.Database(this.configuration.database);
        this.db.run(this.configuration.schema);
    }
    async onListen() {
        if (this.configuration.database === SQLITE_INMEMORY) {
            console.warn(`  ${kleur.yellow("The SQLite extension is configured as an in-memory database. All changes will be lost on restart!")}`);
            console.log();
        }
    }
}

export { SQLite, schema, selectQuery, upsertQuery };
//# sourceMappingURL=hocuspocus-sqlite.esm.js.map
