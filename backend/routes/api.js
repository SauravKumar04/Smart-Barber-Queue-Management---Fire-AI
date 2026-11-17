import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { currentOwner, login, logout, register } from '../controllers/auth.js'
import {
  changeSettings, createShop, customerCancel, customerStatus, dashboard,
  fieldwork, joinQueue, ownerAction, shopQr, shopQueue,
} from '../controllers/queue.js'
import { requireOwner } from '../middleware/http.js'

const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in a few minutes.' },
})
const joinLimit = rateLimit({
  windowMs: 5 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many queue requests. Try again in a few minutes.' },
})

export const routes = Router()
routes.post('/auth/register', authLimit, register)
routes.post('/auth/login', authLimit, login)
routes.post('/auth/logout', logout)
routes.get('/auth/me', requireOwner, currentOwner)
routes.get('/owner/dashboard', requireOwner, dashboard)
routes.get('/owner/fieldwork', requireOwner, fieldwork)
routes.post('/owner/shop', requireOwner, createShop)
routes.put('/owner/shop', requireOwner, changeSettings)
routes.get('/owner/shop/qr', requireOwner, shopQr)
routes.post('/owner/queue/:entryId/:action', requireOwner, ownerAction)
routes.get('/shops/:shopId/queue', shopQueue)
routes.post('/shops/:shopId/queue', joinLimit, joinQueue)
routes.get('/status/:key', customerStatus)
routes.post('/status/:key/cancel', customerCancel)
