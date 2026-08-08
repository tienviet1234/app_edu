import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDB(): Promise<void> {
  mongoose.connection.on('error', (err) => console.error('[MongoDB]', err))
  mongoose.connection.once('open', () => console.log('[MongoDB] Connected'))
  await mongoose.connect(env.MONGO_URI)
}
