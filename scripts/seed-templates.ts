/**
 * Seed the database with public template boards owned by a system user.
 * Idempotent — running it multiple times will not create duplicates.
 *
 *   npm run db:seed
 */
import 'dotenv/config'

import {
  boards as boardsTable,
  categories as categoriesTable,
  clues as cluesTable,
  users as usersTable,
} from '../app/data/schema.ts'
import { db, pool } from '../app/data/db.ts'

interface TemplateClue {
  prompt: string
  response: string
}

interface TemplateCategory {
  title: string
  /** One entry per row, in order. Length must match rowValues. */
  clues: TemplateClue[]
}

interface TemplateBoard {
  title: string
  rowValues: number[]
  categories: TemplateCategory[]
}

const ROW_VALUES = [200, 400, 600, 800, 1000]

const TEMPLATES: TemplateBoard[] = [
  {
    title: 'General Knowledge',
    rowValues: ROW_VALUES,
    categories: [
      {
        title: 'WORLD CAPITALS',
        clues: [
          { prompt: 'Capital of France.', response: 'Paris' },
          { prompt: 'Capital of Australia.', response: 'Canberra' },
          { prompt: 'Capital of Brazil.', response: 'Brasília' },
          { prompt: 'Capital of New Zealand.', response: 'Wellington' },
          { prompt: 'Capital of Kazakhstan (renamed in 2019).', response: 'Astana' },
        ],
      },
      {
        title: 'SCIENCE',
        clues: [
          { prompt: 'The common name for H₂O.', response: 'Water' },
          { prompt: 'The only planet famous for its prominent rings.', response: 'Saturn' },
          { prompt: 'The element with the chemical symbol Au.', response: 'Gold' },
          { prompt: 'The smallest unit of an element that retains its properties.', response: 'Atom' },
          { prompt: 'The physicist who developed the theory of special relativity.', response: 'Albert Einstein' },
        ],
      },
      {
        title: 'MOVIES',
        clues: [
          { prompt: 'The AI antagonist in 2001: A Space Odyssey.', response: 'HAL 9000' },
          { prompt: 'Lead actor in both Forrest Gump and Cast Away.', response: 'Tom Hanks' },
          { prompt: '1999 sci-fi film where the hero chooses between a red and a blue pill.', response: 'The Matrix' },
          { prompt: 'Highest-grossing film released in 2009.', response: 'Avatar' },
          { prompt: 'Composer of the Star Wars main theme.', response: 'John Williams' },
        ],
      },
      {
        title: 'MATH',
        clues: [
          { prompt: '7 × 8.', response: '56' },
          { prompt: 'The square root of 144.', response: '12' },
          { prompt: 'Pi rounded to two decimal places.', response: '3.14' },
          { prompt: 'The sum of the interior angles of any triangle.', response: '180 degrees' },
          { prompt: "Euler's number e, to two decimals.", response: '2.72' },
        ],
      },
      {
        title: 'HISTORY',
        clues: [
          { prompt: 'The year World War II ended.', response: '1945' },
          { prompt: 'The first president of the United States.', response: 'George Washington' },
          { prompt: 'The empire whose Western half fell in 476 CE.', response: 'The Roman Empire' },
          { prompt: 'Italian explorer who reached the Americas in 1492.', response: 'Christopher Columbus' },
          { prompt: 'British queen who reigned from 1837 to 1901.', response: 'Queen Victoria' },
        ],
      },
      {
        title: 'ANIMALS',
        clues: [
          { prompt: 'The largest land animal alive today.', response: 'The African elephant' },
          { prompt: 'The only mammal capable of true sustained flight.', response: 'The bat' },
          { prompt: 'A flightless bird native to Antarctica.', response: 'The penguin' },
          { prompt: 'The fastest land animal over short distances.', response: 'The cheetah' },
          { prompt: 'The longest-lived land animal, often surpassing 150 years.', response: 'The tortoise' },
        ],
      },
    ],
  },
  {
    title: 'Pop Culture (2020s)',
    rowValues: ROW_VALUES,
    categories: [
      {
        title: 'MUSIC',
        clues: [
          { prompt: 'Singer of "Anti-Hero" from the album Midnights.', response: 'Taylor Swift' },
          { prompt: "Rapper behind 2018's \"God's Plan.\"", response: 'Drake' },
          { prompt: 'Seven-member K-pop group whose 2021 hit "Butter" topped the Billboard Hot 100.', response: 'BTS' },
          { prompt: "Artist of the 2021 single \"Bad Habits.\"", response: 'Ed Sheeran' },
          { prompt: 'Country where Bad Bunny was born.', response: 'Puerto Rico' },
        ],
      },
      {
        title: 'MOVIES & TV',
        clues: [
          { prompt: '2022 sequel reuniting Maverick and the Top Gun pilots.', response: 'Top Gun: Maverick' },
          { prompt: 'Korean Netflix hit from 2021 about deadly childhood games.', response: 'Squid Game' },
          { prompt: 'HBO Game of Thrones prequel about the Targaryen civil war.', response: 'House of the Dragon' },
          { prompt: '2023 Best Picture Oscar winner about a multiverse-hopping laundromat owner.', response: 'Everything Everywhere All at Once' },
          { prompt: 'Marvel film that opened the MCU\'s Phase 4 in 2021.', response: 'Black Widow' },
        ],
      },
      {
        title: 'SOCIAL MEDIA',
        clues: [
          { prompt: 'Short-form video app owned by ByteDance.', response: 'TikTok' },
          { prompt: "Twitter's new name after Elon Musk's rebrand.", response: 'X' },
          { prompt: 'The parent company Mark Zuckerberg renamed Facebook to in 2021.', response: 'Meta' },
          { prompt: 'App known for photo messages that disappear after viewing.', response: 'Snapchat' },
          { prompt: 'Visual discovery app launched in 2010 centered on "pinning."', response: 'Pinterest' },
        ],
      },
      {
        title: 'GAMES',
        clues: [
          { prompt: 'The blocky sandbox game owned by Microsoft.', response: 'Minecraft' },
          { prompt: 'Battle-royale game whose in-game currency is called V-Bucks.', response: 'Fortnite' },
          { prompt: '2023 Zelda sequel set above and below Hyrule.', response: 'Tears of the Kingdom' },
          { prompt: 'Among Us role the crewmates are trying to identify.', response: 'The Impostor' },
          { prompt: "Rockstar's Miami-inspired city in the GTA series.", response: 'Vice City' },
        ],
      },
      {
        title: 'SPORTS',
        clues: [
          { prompt: "Lionel Messi's national team.", response: 'Argentina' },
          { prompt: 'NBA team that won the 2020 championship inside the Bubble.', response: 'The Los Angeles Lakers' },
          { prompt: 'Country that hosted the 2022 FIFA World Cup.', response: 'Qatar' },
          { prompt: 'Host city of the 2024 Summer Olympics.', response: 'Paris' },
          { prompt: 'NFL team Tom Brady finished his career with.', response: 'The Tampa Bay Buccaneers' },
        ],
      },
      {
        title: 'TECH',
        clues: [
          { prompt: 'Company that released ChatGPT in late 2022.', response: 'OpenAI' },
          { prompt: 'Person who bought Twitter for $44 billion in 2022.', response: 'Elon Musk' },
          { prompt: "Apple's mixed-reality headset launched in 2024.", response: 'Apple Vision Pro' },
          { prompt: 'Programming language with the file extension .ts.', response: 'TypeScript' },
          { prompt: "Anthropic's family of large language models.", response: 'Claude' },
        ],
      },
    ],
  },
]

/**
 * The system user owns templates. Its password hash is intentionally a fixed
 * non-scrypt string so login attempts always fail.
 */
const SYSTEM_USERNAME = 'system'
const UNLOGINABLE_HASH = 'system-account-not-loginable'

async function findOrCreateSystemUser(): Promise<string> {
  const existing = await db.findOne(usersTable, {
    where: { username: SYSTEM_USERNAME },
  })
  if (existing) return existing.id

  const created = await db.create(
    usersTable,
    { username: SYSTEM_USERNAME, password_hash: UNLOGINABLE_HASH },
    { returnRow: true },
  )
  return created.id
}

async function seedTemplate(systemUserId: string, template: TemplateBoard): Promise<'created' | 'skipped'> {
  const existing = await db.findOne(boardsTable, {
    where: { owner_id: systemUserId, title: template.title, is_template: true },
  })
  if (existing) return 'skipped'

  await db.transaction(async (tx) => {
    const board = await tx.create(
      boardsTable,
      {
        owner_id: systemUserId,
        title: template.title,
        row_values: { values: template.rowValues } as never,
        is_template: true,
      },
      { returnRow: true },
    )

    for (let col = 0; col < template.categories.length; col++) {
      const tplCat = template.categories[col]
      const category = await tx.create(
        categoriesTable,
        { board_id: board.id, position: col, title: tplCat.title },
        { returnRow: true },
      )
      for (let row = 0; row < template.rowValues.length; row++) {
        const tplClue = tplCat.clues[row]
        await tx.create(cluesTable, {
          category_id: category.id,
          row_position: row,
          value: template.rowValues[row],
          prompt: tplClue?.prompt ?? null,
          response: tplClue?.response ?? null,
          payload: null,
        })
      }
    }
  })

  return 'created'
}

async function main() {
  const systemUserId = await findOrCreateSystemUser()
  let created = 0
  let skipped = 0
  for (const template of TEMPLATES) {
    const result = await seedTemplate(systemUserId, template)
    console.log(`${result.padEnd(8)} ${template.title}`)
    if (result === 'created') created++
    else skipped++
  }
  console.log(`\nDone. ${created} created, ${skipped} already present.`)
  await pool.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
