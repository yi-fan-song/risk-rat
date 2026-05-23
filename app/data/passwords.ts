import { argon2 as _argon2, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// node:crypto.argon2 landed in Node 24 but the @types/node bundled with this
// project doesn't expose it yet. Declare the runtime shape we use and adopt
// the typed-Promise version of the function.
interface Argon2Params {
  message: Buffer | string
  nonce: Buffer
  passes: number
  memory: number
  parallelism: number
  tagLength: number
}
type Argon2Algorithm = 'argon2id' | 'argon2i' | 'argon2d'
type RawArgon2 = (
  algorithm: Argon2Algorithm,
  parameters: Argon2Params,
  callback: (err: Error | null, result: Buffer) => void,
) => void

const argon2 = promisify(_argon2 as unknown as RawArgon2) as (
  algorithm: Argon2Algorithm,
  parameters: Argon2Params,
) => Promise<Buffer>

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

// Current argon2id cost. Changing these only affects newly-hashed passwords;
// existing stored hashes encode their own params and verify against them.
const ARGON2 = {
  memory: 65_536, // KiB → 64 MiB
  passes: 3,
  parallelism: 1,
  tagLength: 32,
  saltLength: 16,
} as const

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(ARGON2.saltLength)
  const tag = await argon2('argon2id', {
    message: password,
    nonce: salt,
    passes: ARGON2.passes,
    memory: ARGON2.memory,
    parallelism: ARGON2.parallelism,
    tagLength: ARGON2.tagLength,
  })
  return [
    'argon2id',
    `m=${ARGON2.memory},t=${ARGON2.passes},p=${ARGON2.parallelism}`,
    salt.toString('hex'),
    tag.toString('hex'),
  ].join('$')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const scheme = hash.split('$', 1)[0]
  if (scheme === 'argon2id') return verifyArgon2id(password, hash)
  if (scheme === 'scrypt') return verifyScrypt(password, hash)
  return false
}

/**
 * Returns true when the stored hash should be re-hashed with current params
 * on next successful login. Callers can use this to opportunistically migrate
 * scrypt → argon2id and to bump cost parameters over time.
 */
export function needsRehash(hash: string): boolean {
  const parts = hash.split('$')
  if (parts[0] !== 'argon2id') return true
  if (parts.length !== 4) return true
  const params = parseParams(parts[1])
  if (!params) return true
  return (
    params.m !== ARGON2.memory ||
    params.t !== ARGON2.passes ||
    params.p !== ARGON2.parallelism
  )
}

async function verifyArgon2id(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('$')
  if (parts.length !== 4) return false
  const params = parseParams(parts[1])
  if (!params) return false
  const salt = Buffer.from(parts[2], 'hex')
  const expected = Buffer.from(parts[3], 'hex')
  if (!salt.length || !expected.length) return false
  const actual = await argon2('argon2id', {
    message: password,
    nonce: salt,
    passes: params.t,
    memory: params.m,
    parallelism: params.p,
    tagLength: expected.length,
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

async function verifyScrypt(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('$')
  if (parts.length !== 3) return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  if (!salt.length || !expected.length) return false
  const actual = await scryptAsync(password, salt, expected.length)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

function parseParams(s: string): { m: number; t: number; p: number } | null {
  const out: Record<string, number> = {}
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=')
    const n = Number(v)
    if (!k || !Number.isFinite(n) || n <= 0) return null
    out[k] = n
  }
  if (!out.m || !out.t || !out.p) return null
  return { m: out.m, t: out.t, p: out.p }
}
