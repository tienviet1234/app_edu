import { app } from './app.js'
import { connectDB } from './config/db.js'
import { env } from './config/env.js'

async function bootstrap(): Promise<void> {
  await connectDB()

  app.listen(env.PORT, () => {
    console.log(`LMS auth server listening on http://localhost:${env.PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
