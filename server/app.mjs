import express from 'express'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { registerOAuthRoutes, createContext, webdevRouter, router, publicPlatformConfig } from './webdev-adapter.mjs'

export function createGameApp(gameRouter, { leaderboard } = {}) {
  const app = express()
  app.disable('x-powered-by')
  if (leaderboard) app.use(leaderboard.middleware)
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/auth/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(publicPlatformConfig())
  })
  registerOAuthRoutes(app)
  // Browser mutations use Webdev's JSON tRPC transport. Keep requests same-origin
  // and JSON-only while the game remains free and account-safe.
  app.use('/api/trpc', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: 'json_required' })
      return
    }
    next()
  }, createExpressMiddleware({
    router: router({ webdev: webdevRouter, game: gameRouter }),
    createContext,
  }))
  return app
}
