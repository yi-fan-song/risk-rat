import { column as c, createMigration } from 'remix/data-table/migrations'

export default createMigration({
  async up({ schema }) {
    await schema.alterTable('boards', (table) => {
      table.addColumn('is_template', c.boolean().notNull().default(false))
    })
    await schema.createIndex('boards', 'is_template')
  },

  async down({ schema }) {
    await schema.alterTable('boards', (table) => {
      table.dropColumn('is_template', { ifExists: true })
    })
  },
})
