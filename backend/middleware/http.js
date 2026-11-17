import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { Owner } from '../models/Owner.js'

const cookieName = 'queueless_session'
const cookieOptions = { httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/' }
const emailPattern = /^[^\s@<>(),:;\\"]+@[^\s@<>(),:;\\"]+\.[^\s@<>(),:;\\"]+$/

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function requiredText(value, label, limit) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || /[\x00-\x1f\x7f]/.test(value)) {
    throw new HttpError(400, `${label} must be between 1 and ${limit} characters.`)
  }
  return value.trim()
}

export function emailAddress(value) {
  const email = requiredText(value, 'Email', 254).toLowerCase()
  if (!emailPattern.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  return email
}

export function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}.`)
  }
  return value
}

export function enforceOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && req.headers.origin !== config.appUrl)) {
    throw new HttpError(403, 'This request came from an unrecognized site.')
  }
  next()
}

export function startSession(res, owner) {
  const token = jwt.sign({}, config.jwtSecret, {
    subject: String(owner.id), audience: 'queueless-owner', expiresIn: '7d', algorithm: 'HS256',
  })
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
}

export function endSession(res) {
  res.clearCookie(cookieName, cookieOptions)
}

export async function requireOwner(req, res, next) {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`))
  let payload
  try {
    payload = jwt.verify(cookie?.slice(cookieName.length + 1), config.jwtSecret, {
      audience: 'queueless-owner', algorithms: ['HS256'],
    })
  } catch {
    throw new HttpError(401, 'Log in to continue.')
  }
  req.owner = await Owner.findById(payload.sub).select('email')
  if (!req.owner) throw new HttpError(401, 'Log in to continue.')
  next()
}

const loginFallbackHash = bcrypt.hash('queueless-invalid-owner', 12)
export async function authenticateOwner(email, password) {
  const owner = await Owner.findOne({ email }).select('+passwordHash')
  const valid = await bcrypt.compare(password, owner?.passwordHash || await loginFallbackHash)
  if (!owner || !valid) throw new HttpError(401, 'Email or password is incorrect.')
  return owner
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message })
  if (error.code === 11000) return res.status(409).json({ message: 'This record already exists. Refresh and try again.' })
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request body.' })
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' })
  console.error('Request failed:', error.name, error.code || '')
  res.status(500).json({ message: 'Something went wrong. Please try again.' })
}
