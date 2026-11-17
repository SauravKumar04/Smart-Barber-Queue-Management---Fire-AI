import nodemailer from 'nodemailer'
import { config } from '../config/env.js'
import { QueueEntry } from '../models/QueueEntry.js'
import { Shop } from '../models/Shop.js'
import { customerPath } from './customerLink.js'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env

function openTransport() {
  const port = Number(SMTP_PORT || 465)
  return nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

async function sendEvent(transport, event) {
  const state = `emails.${event}`
  const now = new Date()
  if (event === 'approaching') {
    await QueueEntry.updateMany(
      { [state]: 'pending', status: { $ne: 'waiting' } },
      { $set: { [state]: 'skipped' } },
    )
  }
  await QueueEntry.updateMany(
    { [state]: 'pending', linkExpiresAt: { $lte: now } },
    { $set: { [state]: 'skipped' } },
  )
  // Claim before SMTP so a retry, another instance or a restart cannot send the event twice.
  const filter = { [state]: 'pending', linkExpiresAt: { $gt: now } }
  if (event === 'approaching') {
    filter.status = 'waiting'
    filter['emails.confirmation'] = { $in: ['sent', 'failed', 'claimed'] }
  }
  const entry = await QueueEntry.findOneAndUpdate(filter, { $set: { [state]: 'claimed' } }, {
    sort: { joinedAt: 1 }, returnDocument: 'after',
  })
  if (!entry) return false

  let result = 'sent'
  try {
    const shop = await Shop.findById(entry.shop).select('name').lean()
    if (!shop) throw new Error('Shop unavailable')
    const confirmation = event === 'confirmation'
    const link = config.appUrl + customerPath(entry.id)
    const message = confirmation ? `You joined the queue at ${shop.name}.`
      : `Your turn at ${shop.name} is approaching. Please head back to the shop.`
    await transport.sendMail({
      from: EMAIL_FROM || SMTP_USER,
      to: { address: entry.email, name: '' },
      subject: confirmation ? `You're in the queue · Token #${entry.token}` : `Your turn is approaching · Token #${entry.token}`,
      text: `Hi ${entry.name},\n\n${message}\n\nToken: #${entry.token}\nService: ${entry.serviceName}\n\nCheck your place or cancel with this private link (valid for 7 days):\n${link}\n\nQueueLess`,
    })
  } catch (error) {
    result = 'failed'
    console.warn('Queue email failed:', event, error.code || error.name)
  }
  await QueueEntry.updateOne({ _id: entry._id, [state]: 'claimed' }, { $set: { [state]: result } })
  return true
}

export function startMailer() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.info('SMTP credentials are unset. Email delivery is paused.')
    return () => {}
  }
  const transport = openTransport()
  let processing = false

  async function processMail() {
    if (processing) return
    processing = true
    try {
      for (let i = 0; i < 10; i++) {
        const confirmation = await sendEvent(transport, 'confirmation')
        const approaching = await sendEvent(transport, 'approaching')
        if (!confirmation && !approaching) break
      }
    } catch (error) {
      console.warn('Email worker failed:', error.code || error.name)
    } finally {
      processing = false
    }
  }

  const interval = setInterval(processMail, 5000)
  interval.unref()
  void processMail()
  return () => {
    clearInterval(interval)
    transport.close()
  }
}
