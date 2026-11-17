import mongoose from 'mongoose'
import { HttpError } from '../middleware/http.js'
import { QueueEntry } from '../models/QueueEntry.js'
import { Shop } from '../models/Shop.js'

let useTransactions = true
let localQueue = Promise.resolve()

export function configureQueueSessions(transactionsSupported) {
  useTransactions = transactionsSupported
}

export function withQueueSession(work, options) {
  if (useTransactions) return mongoose.connection.transaction(work, options)

  // A single development process serializes queue operations on standalone MongoDB.
  const result = localQueue.then(() => work(null))
  localQueue = result.catch(() => {})
  return result
}

export function activeQueue(shop, session) {
  return QueueEntry.find({ shop, status: { $in: ['waiting', 'serving'] } })
    .sort({ day: 1, token: 1 }).session(session || null)
    .select('name serviceName serviceMinutes token day status joinedAt startedAt').lean()
}

// Every mutation writes the same shop first. MongoDB retries write conflicts
// so token allocation, settings and service transitions see one consistent queue.
export function changeQueue(shopFilter, change) {
  return withQueueSession(async session => {
    const shop = session
      ? await Shop.findOneAndUpdate(shopFilter, { $inc: { version: 1 } }, {
        session, returnDocument: 'after', timestamps: false,
      })
      : await Shop.findOne(shopFilter)
    if (!shop) throw new HttpError(404, 'Shop not found.')
    return change(shop, session)
  })
}

export async function flagApproaching(shop, session) {
  const serving = await QueueEntry.countDocuments({ shop: shop.id, status: 'serving' }).session(session)
  const upcoming = await QueueEntry.find({ shop: shop.id, status: 'waiting' })
    .sort({ day: 1, token: 1 }).limit(Math.max(1, shop.chairs - serving))
    .session(session).select('_id').lean()

  await QueueEntry.updateMany(
    { _id: { $in: upcoming.map(entry => entry._id) }, 'emails.approaching': { $exists: false } },
    { $set: { 'emails.approaching': 'pending' } }, { session },
  )
}

export function publicShop(shop) {
  return { id: String(shop._id), name: shop.name, chairs: shop.chairs, services: shop.services }
}
