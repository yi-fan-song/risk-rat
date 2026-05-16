import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { createFsFileStorage } from 'remix/file-storage/fs'

const UPLOAD_DIR = './tmp/uploads'
mkdirSync(UPLOAD_DIR, { recursive: true })

export const fileStorage = createFsFileStorage(UPLOAD_DIR)

export function newFileKey(): string {
  return randomUUID()
}

export const ACCEPTED_MEDIA: Record<string, 'image' | 'audio' | 'video'> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/svg+xml': 'image',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/mp4': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
}

export function mediaKindFor(mime: string): 'image' | 'audio' | 'video' | null {
  return ACCEPTED_MEDIA[mime] ?? null
}
