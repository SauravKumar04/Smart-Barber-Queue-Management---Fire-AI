import mongoose from 'mongoose'

const ownerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true })

export const Owner = mongoose.model('Owner', ownerSchema)
