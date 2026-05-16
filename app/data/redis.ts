import Redis from 'ioredis'

const url = process.env.REDIS_URL
if (!url) {
  throw new Error('REDIS_URL is required')
}

export const redis = new Redis(url, { lazyConnect: false })

export function createSubscriber(): Redis {
  return new Redis(url!, { lazyConnect: false })
}

export function gameChannel(joinCode: string): string {
  return `game:${joinCode}`
}

export async function publishGameEvent(joinCode: string, event: unknown): Promise<void> {
  await redis.publish(gameChannel(joinCode), JSON.stringify(event))
}
