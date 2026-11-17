import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'

process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { checkCustomerEntry, customerEntryId, customerKey } = await import('../utils/customerLink.js')

test('private link resolves only for its signed entry ID', () => {
  const id = '0123456789abcdef01234567'
  const key = customerKey(id)
  assert.equal(customerEntryId(key), id)
  assert.throws(() => customerEntryId('f' + key.slice(1)), { status: 404 })
  assert.throws(() => customerEntryId(key + '!'), { status: 404 })
  assert.throws(() => customerEntryId(id), { status: 404 })
})

test('missing and expired queue entries return distinct errors', () => {
  assert.throws(() => checkCustomerEntry(null), { status: 404 })
  assert.throws(() => checkCustomerEntry({ linkExpiresAt: new Date(0) }), { status: 410 })
  assert.doesNotThrow(() => checkCustomerEntry({ linkExpiresAt: new Date(Date.now() + 60000) }))
})
