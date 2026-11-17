import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFieldwork, summarizeFieldwork } from '../utils/fieldwork.js'

test('fieldwork averages come from the assignment CSV', async () => {
  assert.deepEqual(await readFieldwork(), {
    count: 3, approximateCount: 1, averageWaitingMinutes: 28.3, averageServiceMinutes: 26.7,
  })
})

test('fieldwork skips invalid timings and accepts quoted notes with commas', () => {
  const csv = [
    'arrival_time,service_start_time,completion_time,status,notes',
    'bad,12:00,12:05,recorded,invalid',
    '11:50,12:00,11:59,recorded,reversed',
    '11:55,12:00,12:05,recorded,"includes, comma"',
    '11:45,12:00,,recorded,incomplete',
  ].join('\n')
  assert.deepEqual(summarizeFieldwork(csv), {
    count: 1, approximateCount: 0, averageWaitingMinutes: 5, averageServiceMinutes: 5,
  })
})
