import mongoose from 'mongoose'

const mailState = { type: String, enum: ['pending', 'claimed', 'sent', 'failed', 'skipped'] }
const schema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  serviceName: { type: String, required: true },
  serviceMinutes: { type: Number, required: true },
  token: { type: Number, required: true },
  day: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'serving', 'completed', 'cancelled'], default: 'waiting' },
  joinedAt: { type: Date, required: true },
  startedAt: Date,
  completedAt: Date,
  completedDay: String,
  linkExpiresAt: { type: Date, required: true },
  emails: {
    confirmation: { ...mailState, default: 'pending' },
    approaching: mailState,
  },
})

schema.index({ shop: 1, day: 1, token: 1 }, { unique: true })
schema.index({ shop: 1, status: 1, day: 1, token: 1 })
schema.index({ shop: 1, completedDay: 1 })
schema.index({ 'emails.confirmation': 1, joinedAt: 1 }, {
  partialFilterExpression: { 'emails.confirmation': 'pending' },
})
schema.index({ 'emails.approaching': 1, joinedAt: 1 }, {
  partialFilterExpression: { 'emails.approaching': 'pending' },
})

export const QueueEntry = mongoose.model('QueueEntry', schema)
