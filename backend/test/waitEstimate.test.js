import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { shopDay } from '../config/env.js'
import { waitEstimates } from '../utils/waitEstimate.js'

test('estimates use elapsed service time and service-specific durations across chairs', () => {
  const now = Date.now()
  const queue = [
    { _id: 'serving', status: 'serving', serviceMinutes: 25, startedAt: new Date(now - 10 * 60000) },
    { _id: 'first', status: 'waiting', serviceMinutes: 20 },
    { _id: 'second', status: 'waiting', serviceMinutes: 15 },
    { _id: 'third', status: 'waiting', serviceMinutes: 30 },
  ]
  const estimates = waitEstimates(queue, 2, now)
  assert.deepEqual([...estimates], [['first', 0], ['second', 15], ['third', 20], ['new', 30]])
  assert.equal(waitEstimates(queue, 1, now).get('third'), 50)
})

test('an empty queue and an overdue service never produce negative waits', () => {
  const now = Date.now()
  assert.equal(waitEstimates([], 1, now).get('new'), 0)
  assert.equal(waitEstimates([
    { status: 'serving', serviceMinutes: 10, startedAt: new Date(now - 20 * 60000) },
  ], 1, now).get('new'), 0)
})

test('shop dates follow the configured time zone at midnight', () => {
  const zone = process.env.SHOP_TIME_ZONE || 'Asia/Kolkata'
  if (zone === 'Asia/Kolkata') {
    assert.equal(shopDay(new Date('2026-11-17T18:29:59Z')), '2026-11-17')
    assert.equal(shopDay(new Date('2026-11-17T18:30:00Z')), '2026-11-18')
  } else {
    assert.equal(shopDay(new Date('2026-11-17T12:00:00Z')),
      new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date('2026-11-17T12:00:00Z')))
  }
})

test('standalone MongoDB queue operations run in order and recover after errors', async t => {
  const { configureQueueSessions, withQueueSession } = await import('../utils/queue.js')
  configureQueueSessions(false)
  t.after(() => configureQueueSessions(true))
  const steps = []
  const first = withQueueSession(async session => {
    assert.equal(session, null)
    steps.push('start')
    await delay(5)
    steps.push('finish')
    throw new Error('Example failed operation')
  })
  const second = withQueueSession(() => steps.push('next'))
  await assert.rejects(first, /Example failed operation/)
  await second
  assert.deepEqual(steps, ['start', 'finish', 'next'])
})
