import type { Controller } from 'remix/fetch-router'

import { fileStorage } from '../data/file-storage.ts'
import { routes } from '../routes.ts'

export const files = {
  actions: {
    async show({ params }) {
      const file = await fileStorage.get(params.key)
      if (!file) return new Response('Not Found', { status: 404 })
      return new Response(file.stream(), {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Length': String(file.size),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    },
  },
} satisfies Controller<typeof routes.files>
