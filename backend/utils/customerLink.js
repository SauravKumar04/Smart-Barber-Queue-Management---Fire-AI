import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config/env.js'
import { HttpError } from '../middleware/http.js'

export function customerKey(id) {
  const signature = createHmac('sha256', config.jwtSecret).update(`customer-status:${id}`).digest('base64url')
  return `${id}.${signature}`
}

export function customerPath(id) {
  return `/status/${customerKey(id)}`
}

export function customerEntryId(key) {
  if (!/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(key)) {
    throw new HttpError(404, 'This queue link is invalid.')
  }
  const id = key.split('.')[0]
  if (!timingSafeEqual(Buffer.from(key), Buffer.from(customerKey(id)))) {
    throw new HttpError(404, 'This queue link is invalid.')
  }
  return id
}

export function checkCustomerEntry(entry) {
  if (!entry) throw new HttpError(404, 'This queue link is invalid.')
  if (entry.linkExpiresAt <= new Date()) throw new HttpError(410, 'This queue link has expired.')
}
