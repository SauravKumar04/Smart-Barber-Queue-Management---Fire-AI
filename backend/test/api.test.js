import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

const mongoUri = process.env.TEST_MONGO_URI

test('QueueLess REST APIs, MongoDB concurrency and SMTP failure', {
  skip: mongoUri ? false : 'Set TEST_MONGO_URI to a test MongoDB server.',
  timeout: 45000,
}, async t => {
  let smtpConnections = 0
  const failingSMTP = createServer(socket => {
    smtpConnections++
    socket.end('421 Test server unavailable\r\n')
  })
  failingSMTP.listen(0, '127.0.0.1')
  await once(failingSMTP, 'listening')
  t.after(() => new Promise(resolve => failingSMTP.close(resolve)))

  const database = 'queueless_test_' + randomUUID().replaceAll('-', '')
  const uri = mongoUri.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/)
  assert.ok(uri, 'Use a MongoDB connection URI for TEST_MONGO_URI.')
  process.env.MONGO_URI = `${uri[1]}/${database}${uri[2] || ''}`
  process.env.NODE_ENV = 'test'
  process.env.PUBLIC_APP_URL = 'http://localhost:5173'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(failingSMTP.address().port)
  process.env.SMTP_USER = 'smtp-test@example.invalid'
  process.env.SMTP_PASS = 'non-production-fixture'
  process.env.EMAIL_FROM = process.env.SMTP_USER
  process.env.TRUST_PROXY_HOPS = '0'

  const { default: mongoose } = await import('mongoose')
  const { connectDatabase, createApp } = await import('../server.js')
  const { QueueEntry } = await import('../models/QueueEntry.js')
  const { shopDay } = await import('../config/env.js')
  const { startMailer } = await import('../utils/mailer.js')
  t.after(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
    }
  })
  await connectDatabase()
  const app = createApp().listen(0, '127.0.0.1')
  await once(app, 'listening')
  t.after(() => new Promise(resolve => app.close(resolve)))
  const base = `http://127.0.0.1:${app.address().port}`

  async function request(path, { method = 'GET', body, cookie, status = 200, origin } = {}) {
    const response = await fetch(base + '/api' + path, {
      method,
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(cookie && { Cookie: cookie }),
        ...(origin && { Origin: origin }),
      },
      body: body && JSON.stringify(body),
    })
    assert.equal(response.status, status, `${method} ${path}`)
    const type = response.headers.get('content-type')
    const data = type?.startsWith('application/json') ? await response.json() : await response.arrayBuffer()
    return { response, data }
  }

  await request('/owner/dashboard', { status: 401 })
  await request('/auth/me', { status: 401 })
  await request('/missing', { status: 404 })
  await request('/auth/logout', { method: 'POST', status: 403, origin: 'https://elsewhere.example' })
  const password = 'test owner password'
  const ownerA = { email: 'owner-a@example.invalid', password }
  const ownerB = { email: 'owner-b@example.invalid', password }
  const register = body => request('/auth/register', { method: 'POST', body, status: 201 })
  const firstAccount = await register(ownerA)
  const secondAccount = await register(ownerB)
  const setCookie = firstAccount.response.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  const cookieA = setCookie.split(';')[0]
  const cookieB = secondAccount.response.headers.get('set-cookie').split(';')[0]
  assert.deepEqual((await request('/auth/me', { cookie: cookieA })).data, { email: ownerA.email })
  await request('/auth/register', { method: 'POST', body: ownerA, status: 409 })
  await request('/auth/login', { method: 'POST', body: { ...ownerA, password: 'wrong password' }, status: 401 })
  const login = await request('/auth/login', { method: 'POST', body: ownerA })
  assert.ok(login.response.headers.get('set-cookie'))
  const logout = await request('/auth/logout', { method: 'POST', cookie: cookieA, status: 204 })
  assert.match(logout.response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i)
  assert.deepEqual((await request('/owner/dashboard', { cookie: cookieA })).data, { shop: null })

  const createShop = (cookie, name, chairs) => request('/owner/shop', {
    method: 'POST', cookie, body: { name, chairs }, status: 201,
  })
  const { data: shopA } = await createShop(cookieA, 'Test Shop A', 2)
  const { data: shopB } = await createShop(cookieB, 'Test Shop B', 1)
  assert.notEqual(shopA.id, shopB.id)
  assert.deepEqual(shopA.services.map(service => service.name),
    ['Haircut', 'Beard Shaving', 'Hair + Beard', 'Hair Colour'])
  await request('/owner/shop', { method: 'POST', cookie: cookieA, body: { name: 'Other' }, status: 409 })

  const qrA = await request('/owner/shop/qr?download=1', { cookie: cookieA })
  const qrB = await request('/owner/shop/qr', { cookie: cookieB })
  assert.match(qrA.response.headers.get('content-type'), /image\/png/)
  assert.match(qrA.response.headers.get('content-disposition'), /attachment/)
  assert.deepEqual([...new Uint8Array(qrA.data).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.notDeepEqual(Buffer.from(qrA.data), Buffer.from(qrB.data))
  await request('/owner/shop/qr', { status: 401 })

  const timing = (await request('/owner/fieldwork', { cookie: cookieA })).data
  assert.deepEqual(timing, { count: 3, approximateCount: 1, averageWaitingMinutes: 28.3, averageServiceMinutes: 26.7 })

  const shopPath = shop => `/shops/${shop.id}/queue`
  const join = async (shop, name, serviceId = 'haircut', status = 201) => (await request(shopPath(shop), {
    method: 'POST', status, body: { name, email: 'customer@example.invalid', serviceId },
  })).data
  await request('/shops/invalid/queue', { status: 404 })
  await join(shopA, 'Wrong service', 'unknown', 400)

  const [first, second, third, fourth] = (await Promise.all([
    join(shopA, 'Test Customer One'), join(shopA, 'Test Customer Two'),
    join(shopA, 'Test Customer Three', 'beard'), join(shopA, 'Test Customer Four', 'combo'),
  ])).sort((a, b) => a.token - b.token)
  assert.deepEqual([first.token, second.token, third.token, fourth.token], [1, 2, 3, 4])
  assert.equal((await join(shopB, 'Test Customer Five')).token, 1)

  const publicQueue = (await request(shopPath(shopA))).data
  assert.equal(publicQueue.waitingCount, 4)
  assert.equal(publicQueue.servingCount, 0)
  assert.doesNotMatch(JSON.stringify(publicQueue), /Test Customer|@example.invalid/)
  const statusOf = async entry => (await request(entry.statusPath)).data
  const before = await statusOf(third)
  assert.equal(before.position, 3)
  assert.equal(before.ahead, 2)
  assert.ok(before.estimatedWaitMinutes > 0)
  assert.doesNotMatch(JSON.stringify(before), /Test Customer|@example.invalid/)

  const view = async cookie => (await request('/owner/dashboard', { cookie })).data
  const queue = await view(cookieA)
  assert.equal(queue.link, `http://localhost:5173/join/${shopA.id}`)
  assert.deepEqual(queue.waiting.map(entry => entry.token), [1, 2, 3, 4])
  assert.equal((await view(cookieB)).waiting.length, 1)
  const [one, two, three, four] = queue.waiting
  const action = (entry, name, status = 204, cookie = cookieA) =>
    request(`/owner/queue/${entry._id}/${name}`, { method: 'POST', status, cookie })
  const rawAction = (entry, name) => fetch(`${base}/api/owner/queue/${entry._id}/${name}`, {
    method: 'POST', headers: { Cookie: cookieA },
  })

  await action(one, 'start', 404, cookieB)
  await action(two, 'start', 409)
  await action(one, 'complete', 409)
  const starts = await Promise.all([rawAction(one, 'start'), rawAction(one, 'start')])
  assert.deepEqual(starts.map(response => response.status).sort(), [204, 409])
  await action(two, 'start')
  await action(three, 'start', 409)
  assert.equal((await view(cookieA)).serving.length, 2)
  assert.equal((await statusOf(first)).status, 'serving')
  await request(first.statusPath + '/cancel', { method: 'POST', status: 409 })

  const update = (body, status = 200) => request('/owner/shop', { method: 'PUT', body, status, cookie: cookieA })
  await update({ ...shopA, chairs: 1 }, 409)
  const services = shopA.services.map(service => ({ ...service, minutes: 40 }))
  services.push({ name: 'Test wash', minutes: 12 })
  const changed = (await update({ name: 'Renamed Shop', chairs: 2, services })).data
  assert.equal(changed.services.find(service => service.id === 'haircut').minutes, 40)
  assert.ok(changed.services.find(service => service.name === 'Test wash').id)
  assert.equal((await statusOf(third)).shopName, 'Renamed Shop')

  const completions = await Promise.all([rawAction(one, 'complete'), rawAction(one, 'complete')])
  assert.deepEqual(completions.map(response => response.status).sort(), [204, 409])
  assert.equal((await statusOf(first)).status, 'completed')
  assert.equal((await view(cookieA)).stats.completedToday, 1)
  await request(third.statusPath + '/cancel', { method: 'POST', status: 204 })
  await request(third.statusPath + '/cancel', { method: 'POST', status: 204 })
  assert.equal((await statusOf(third)).status, 'cancelled')
  assert.equal((await statusOf(fourth)).position, 1)
  await action(two, 'cancel')
  assert.equal((await statusOf(second)).status, 'cancelled')
  await action(two, 'cancel', 409)

  await request('/status/invalid', { status: 404 })
  const lastCharacter = fourth.statusPath.at(-1)
  await request(fourth.statusPath.slice(0, -1) + (lastCharacter === 'A' ? 'B' : 'A'), { status: 404 })
  await QueueEntry.updateOne({ _id: four._id }, { $set: { linkExpiresAt: new Date(0) } })
  await request(fourth.statusPath, { status: 410 })
  await request(fourth.statusPath + '/cancel', { method: 'POST', status: 410 })

  // Simulate the previous shop day without changing the system clock.
  const olderDay = '2000-01-01'
  await QueueEntry.updateMany({ shop: shopA.id, day: shopDay() }, { $set: { day: olderDay } })
  const newDay = await join(shopA, 'Test Customer New Day', 'haircut')
  assert.equal(newDay.token, 1)
  assert.equal((await statusOf(newDay)).position, 2)
  assert.equal((await QueueEntry.findById(newDay.statusPath.split('/').at(-1).split('.')[0])).serviceMinutes, 40)
  await action(four, 'cancel')
  assert.equal((await statusOf(newDay)).position, 1)

  const stopMailer = startMailer()
  t.after(stopMailer)
  let settled
  for (let i = 0; i < 40; i++) {
    settled = await QueueEntry.findOne({ shop: shopA.id, day: shopDay(), token: 1 })
    if (settled.emails.confirmation === 'failed' && settled.emails.approaching === 'failed') break
    await delay(150)
  }
  assert.equal(settled.emails.confirmation, 'failed')
  assert.equal(settled.emails.approaching, 'failed')
  assert.equal((await statusOf(newDay)).status, 'waiting')
  const previousConnections = smtpConnections
  await delay(5500)
  assert.equal(smtpConnections, previousConnections)
  await request(newDay.statusPath + '/cancel', { method: 'POST', status: 204 })
})
