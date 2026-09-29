import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { dataDir } from '@/lib/env'
import * as schema from './schema'

type Db = BetterSQLite3Database<typeof schema>
const g = globalThis as unknown as { __podcastDb?: Db }

/** The app's SQLite database (data/podcast.db), migrated on first use. */
export function db(): Db {
  if (!g.__podcastDb) {
    mkdirSync(dataDir(), { recursive: true })
    const sqlite = new Database(join(dataDir(), 'podcast.db'))
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('busy_timeout = 5000')
    sqlite.pragma('foreign_keys = ON')
    const d = drizzle(sqlite, { schema })
    migrate(d, { migrationsFolder: join(process.cwd(), 'drizzle') })
    g.__podcastDb = d
  }
  return g.__podcastDb
}

export * from './schema'
