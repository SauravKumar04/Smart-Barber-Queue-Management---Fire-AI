import bcrypt from 'bcrypt'
import { Owner } from '../models/Owner.js'
import { authenticateOwner, emailAddress, endSession, HttpError, startSession } from '../middleware/http.js'

function credentials(body) {
  const email = emailAddress(body?.email)
  const password = body?.password
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new HttpError(400, 'Use a password of at least 8 characters and at most 72 bytes.')
  }
  return { email, password }
}

export async function register(req, res) {
  const { email, password } = credentials(req.body)
  let owner
  try {
    owner = await Owner.create({ email, passwordHash: await bcrypt.hash(password, 12) })
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'An account already uses this email.')
    throw error
  }
  startSession(res, owner)
  res.status(201).json({ email: owner.email })
}

export async function login(req, res) {
  const { email, password } = credentials(req.body)
  const owner = await authenticateOwner(email, password)
  startSession(res, owner)
  res.json({ email: owner.email })
}

export function logout(req, res) {
  endSession(res)
  res.sendStatus(204)
}

export function currentOwner(req, res) {
  res.json({ email: req.owner.email })
}
