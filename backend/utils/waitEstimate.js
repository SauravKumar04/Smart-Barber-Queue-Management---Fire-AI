export function waitEstimates(queue, chairCount, now = Date.now()) {
  const available = queue.filter(entry => entry.status === 'serving').map(entry =>
    Math.max(0, entry.serviceMinutes - (now - Number(entry.startedAt)) / 60000))
  while (available.length < chairCount) available.push(0)

  const estimates = new Map()
  for (const entry of queue) {
    if (entry.status !== 'waiting') continue
    const firstChair = available.indexOf(Math.min(...available))
    estimates.set(String(entry._id), Math.ceil(available[firstChair]))
    available[firstChair] += entry.serviceMinutes
  }
  estimates.set('new', Math.ceil(Math.min(...available)))
  return estimates
}
