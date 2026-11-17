import { readFile } from 'node:fs/promises'
import { parse } from 'csv-parse/sync'

function toMinutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export async function readFieldwork() {
  const csv = await readFile(new URL('../../data.csv', import.meta.url), 'utf8')
  return summarizeFieldwork(csv)
}

export function summarizeFieldwork(csv) {
  const rows = parse(csv, {
    columns: true, bom: true, trim: true, skip_empty_lines: true,
    skip_records_with_error: true, relax_column_count: true,
  })
  let count = 0
  let approximateCount = 0
  let waitingTotal = 0
  let serviceTotal = 0

  for (const row of rows) {
    if (!['recorded', 'recorded_approximate_arrival'].includes(row.status)) continue
    const arrival = toMinutes(row.arrival_time)
    const start = toMinutes(row.service_start_time)
    const end = toMinutes(row.completion_time)
    if (arrival === null || start === null || end === null || arrival > start || end <= start) continue
    count++
    if (row.status === 'recorded_approximate_arrival') approximateCount++
    waitingTotal += start - arrival
    serviceTotal += end - start
  }
  return {
    count, approximateCount,
    averageWaitingMinutes: count ? Math.round(waitingTotal / count * 10) / 10 : null,
    averageServiceMinutes: count ? Math.round(serviceTotal / count * 10) / 10 : null,
  }
}
