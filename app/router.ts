import {
  createRouter,
  type AnyParams,
  type MiddlewareContext,
  type WithParams,
} from 'remix/fetch-router'
import { compression } from 'remix/compression-middleware'
import { formData } from 'remix/form-data-middleware'
import { logger } from 'remix/logger-middleware'
import { methodOverride } from 'remix/method-override-middleware'
import { asyncContext } from 'remix/async-context-middleware'

import { assets } from './assets.ts'
import { fileStorage, newFileKey } from './data/file-storage.ts'
import { loadAuth } from './middleware/auth.ts'
import { loadDatabase } from './middleware/db.ts'
import { sessionMiddleware } from './middleware/session.ts'
import { routes } from './routes.ts'

import { auth } from './controllers/auth.tsx'
import { boards } from './controllers/boards.tsx'
import { files } from './controllers/files.tsx'
import { games } from './controllers/games.tsx'
import { home } from './controllers/home.tsx'
import { share } from './controllers/share.tsx'
import { templates } from './controllers/templates.tsx'

const middleware = []

if (process.env.NODE_ENV !== 'production') {
  middleware.push(logger())
}

middleware.push(
  compression({
    // SSE responses must not be buffered/compressed — frames need to flush in real time.
    filterMediaType(mediaType) {
      const base = mediaType.split(';')[0].trim().toLowerCase()
      if (base === 'text/event-stream') return false
      return /^(text\/|application\/(json|javascript|xml|xhtml\+xml|x-yaml|x-www-form-urlencoded|wasm)|image\/svg\+xml)/.test(
        base,
      )
    },
  }),
)
middleware.push(
  formData({
    async uploadHandler(upload) {
      if (!upload.name) return null
      const key = newFileKey()
      await fileStorage.set(key, upload)
      return key
    },
  }),
)
middleware.push(methodOverride())
middleware.push(sessionMiddleware())
middleware.push(asyncContext())
middleware.push(loadDatabase())
middleware.push(loadAuth())

type RootMiddleware = [
  ReturnType<typeof formData>,
  ReturnType<typeof sessionMiddleware>,
  ReturnType<typeof loadDatabase>,
  ReturnType<typeof loadAuth>,
]

export type AppContext<params extends AnyParams = AnyParams> = WithParams<
  MiddlewareContext<RootMiddleware>,
  params
>

export const router = createRouter({ middleware })

router.get(routes.assets, async ({ request }) => {
  const response = await assets.fetch(request)
  return response ?? new Response('Not Found', { status: 404 })
})

router.map(routes.home, home)
router.map(routes.auth, auth)
router.map(routes.boards, boards)
router.map(routes.share, share)
router.map(routes.templates, templates)
router.map(routes.games, games)
router.map(routes.files, files)
