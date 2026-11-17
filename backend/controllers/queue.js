import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { config, shopDay } from '../config/env.js'
import { QueueEntry } from '../models/QueueEntry.js'
import { Shop } from '../models/Shop.js'
import { emailAddress, HttpError, integer, requiredText } from '../middleware/http.js'
import { checkCustomerEntry, customerEntryId, customerPath } from '../utils/customerLink.js'
import { readFieldwork } from '../utils/fieldwork.js'
import { activeQueue, changeQueue, flagApproaching, publicShop, withQueueSession } from '../utils/queue.js'
import { waitEstimates } from '../utils/waitEstimate.js'

function objectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(404, 'Record not found.')
  return value
}

async function getShop(filter, session) {
  const shop = await Shop.findOne(filter).session(session || null)
  if (!shop) throw new HttpError(404, 'Shop not found.')
  return shop
}

const queueUrl = shop => `${config.appUrl}/join/${shop.id}`
const ownerFilter = req => ({ owner: req.owner.id })
const shopFilter = req => ({ _id: objectId(req.params.shopId) })

export async function createShop(req, res) {
  const name = requiredText(req.body?.name, 'Shop name', 80)
  const chairs = integer(req.body?.chairs ?? 1, 'Active chairs', 1, 20)
  try {
    const shop = await Shop.create({ owner: req.owner.id, name, chairs })
    res.status(201).json(publicShop(shop))
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'You already have a shop.')
    throw error
  }
}

export async function changeSettings(req, res) {
  const name = requiredText(req.body?.name, 'Shop name', 80)
  const chairs = integer(req.body?.chairs, 'Active chairs', 1, 20)
  const services = req.body?.services
  if (!Array.isArray(services) || services.length < 1 || services.length > 12) {
    throw new HttpError(400, 'Add between 1 and 12 services.')
  }

  const validated = services.map(service => ({
    id: service?.id ? requiredText(service.id, 'Service ID', 60) : randomUUID(),
    name: requiredText(service?.name, 'Service name', 60),
    minutes: integer(service?.minutes, 'Service duration', 1, 240),
  }))
  if (new Set(validated.map(service => service.name.toLowerCase())).size !== validated.length ||
      new Set(validated.map(service => service.id)).size !== validated.length) {
    throw new HttpError(400, 'Each service must have a unique name and ID.')
  }

  const result = await changeQueue(ownerFilter(req), async (shop, session) => {
    const serving = await QueueEntry.countDocuments({ shop: shop.id, status: 'serving' }).session(session)
    if (chairs < serving) throw new HttpError(409, 'Finish or cancel an active service before reducing chairs.')
    shop.set({ name, chairs, services: validated })
    await shop.save({ session })
    await flagApproaching(shop, session)
    return publicShop(shop)
  })
  res.json(result)
}

export async function dashboard(req, res) {
  const result = await withQueueSession(async session => {
    const shop = await Shop.findOne(ownerFilter(req)).session(session)
    if (!shop) return { shop: null }
    const queue = await activeQueue(shop.id, session)
    const [today] = await QueueEntry.aggregate([
      { $match: { shop: shop._id, completedDay: shopDay(), status: 'completed' } },
      { $group: {
        _id: null, count: { $sum: 1 },
        waiting: { $avg: { $subtract: ['$startedAt', '$joinedAt'] } },
        duration: { $avg: { $subtract: ['$completedAt', '$startedAt'] } },
      } },
    ]).session(session)

    return {
      shop: publicShop(shop),
      link: queueUrl(shop),
      timeZone: config.timeZone,
      waiting: queue.filter(entry => entry.status === 'waiting'),
      serving: queue.filter(entry => entry.status === 'serving'),
      stats: {
        completedToday: today?.count ?? 0,
        averageWaitingMinutes: today ? Math.round(today.waiting / 6000) / 10 : null,
        averageServiceMinutes: today ? Math.round(today.duration / 6000) / 10 : null,
      },
    }
  }, { readConcern: { level: 'snapshot' } })
  res.json(result)
}

export async function fieldwork(req, res) {
  res.json(await readFieldwork())
}

export async function shopQr(req, res) {
  const shop = await getShop(ownerFilter(req))
  const png = await QRCode.toBuffer(queueUrl(shop), { width: 480, margin: 3, errorCorrectionLevel: 'M' })
  if (req.query.download === '1') res.attachment('queueless-shop-qr.png')
  res.type('png').send(png)
}

export async function shopQueue(req, res) {
  const result = await withQueueSession(async session => {
    const shop = await getShop(shopFilter(req), session)
    const queue = await activeQueue(shop.id, session)
    return {
      shop: publicShop(shop),
      waitingCount: queue.filter(entry => entry.status === 'waiting').length,
      servingCount: queue.filter(entry => entry.status === 'serving').length,
      estimatedWaitMinutes: waitEstimates(queue, shop.chairs).get('new'),
    }
  }, { readConcern: { level: 'snapshot' } })
  res.json(result)
}

export async function joinQueue(req, res) {
  const name = requiredText(req.body?.name, 'Name', 80)
  const email = emailAddress(req.body?.email)
  const serviceId = requiredText(req.body?.serviceId, 'Service', 60)
  const result = await changeQueue(shopFilter(req), async (shop, session) => {
    const service = shop.services.find(item => item.id === serviceId)
    if (!service) throw new HttpError(400, 'Choose a service currently offered by this shop.')

    const joinedAt = new Date()
    const day = shopDay(joinedAt)
    const previous = await QueueEntry.findOne({ shop: shop.id, day })
      .sort({ token: -1 }).select('token').session(session)
    const token = (previous?.token ?? 0) + 1

    const entry = new QueueEntry({
      shop: shop.id, name, email, serviceName: service.name, serviceMinutes: service.minutes,
      token, day, joinedAt,
      linkExpiresAt: new Date(+joinedAt + 7 * 86400000),
    })
    await entry.save({ session })
    await flagApproaching(shop, session)
    return { token: entry.token, statusPath: customerPath(entry.id) }
  })
  res.status(201).json(result)
}

export async function customerStatus(req, res) {
  const id = customerEntryId(req.params.key)
  const result = await withQueueSession(async session => {
    const entry = await QueueEntry.findById(id).session(session)
    checkCustomerEntry(entry)
    const shop = await getShop({ _id: entry.shop }, session)

    let position = null
    let ahead = null
    let estimatedWaitMinutes = null
    if (entry.status === 'waiting') {
      const queue = await activeQueue(shop.id, session)
      const waiting = queue.filter(item => item.status === 'waiting')
      ahead = waiting.findIndex(item => String(item._id) === id)
      position = ahead + 1
      estimatedWaitMinutes = waitEstimates(queue, shop.chairs).get(id)
    }

    return {
      shopName: shop.name, token: entry.token, service: entry.serviceName,
      status: entry.status, position, ahead, estimatedWaitMinutes,
    }
  }, { readConcern: { level: 'snapshot' } })
  res.json(result)
}

export async function customerCancel(req, res) {
  const id = customerEntryId(req.params.key)
  const existing = await QueueEntry.findById(id).select('shop linkExpiresAt')
  checkCustomerEntry(existing)
  await changeQueue({ _id: existing.shop }, async (shop, session) => {
    const entry = await QueueEntry.findOne({ _id: id, shop: shop.id }).session(session)
    checkCustomerEntry(entry)
    if (entry.status === 'cancelled') return
    if (entry.status !== 'waiting') throw new HttpError(409, 'Only waiting entries can be cancelled here.')
    entry.status = 'cancelled'
    await entry.save({ session })
    await flagApproaching(shop, session)
  })
  res.sendStatus(204)
}

export async function ownerAction(req, res) {
  const id = objectId(req.params.entryId)
  const action = req.params.action
  if (!['start', 'complete', 'cancel'].includes(action)) throw new HttpError(404, 'Action not found.')
  await changeQueue(ownerFilter(req), async (shop, session) => {
    const entry = await QueueEntry.findOne({ _id: id, shop: shop.id }).session(session)
    if (!entry) throw new HttpError(404, 'Queue entry not found.')

    if (action === 'start') {
      if (entry.status !== 'waiting') throw new HttpError(409, 'This customer is no longer waiting.')
      const serving = await QueueEntry.countDocuments({ shop: shop.id, status: 'serving' }).session(session)
      if (serving >= shop.chairs) throw new HttpError(409, 'All chairs are in use.')
      const next = await QueueEntry.findOne({ shop: shop.id, status: 'waiting' })
        .sort({ day: 1, token: 1 }).session(session).select('_id')
      if (next.id !== entry.id) throw new HttpError(409, 'Start the first waiting customer.')
      entry.set({ status: 'serving', startedAt: new Date() })
    } else if (action === 'complete') {
      if (entry.status !== 'serving') throw new HttpError(409, 'This service is no longer in progress.')
      const completedAt = new Date()
      entry.set({ status: 'completed', completedAt, completedDay: shopDay(completedAt) })
    } else {
      if (!['waiting', 'serving'].includes(entry.status)) {
        throw new HttpError(409, 'This entry is no longer active.')
      }
      entry.status = 'cancelled'
    }

    await entry.save({ session })
    await flagApproaching(shop, session)
  })
  res.sendStatus(204)
}
