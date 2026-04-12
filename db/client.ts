import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

// 本地开发用 file:./local.db，生产用 Turso 远程 URL
const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
export type DB = typeof db
