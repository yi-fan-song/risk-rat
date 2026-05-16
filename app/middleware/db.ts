import type { Middleware } from 'remix/fetch-router'
import { Database } from 'remix/data-table'

import { db } from '../data/db.ts'

export function loadDatabase(): Middleware {
  return async (context, next) => {
    context.set(Database, db)
    return next()
  }
}
