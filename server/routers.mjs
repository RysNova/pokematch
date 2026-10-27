import { router, publicProcedure, protectedProcedure } from './webdev-adapter.mjs'

import { leaderboard } from './leaderboard.mjs'
import { createLeaderboardRouter } from './leaderboard/router.mjs'

export const gameRouter = router({
  leaderboard: createLeaderboardRouter({ router, publicProcedure, protectedProcedure }, leaderboard),
  // Add any future account-bound gameplay writes as protectedProcedure mutations.
  // Derive the save owner from ctx.user, never from browser input.
  player: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id, name: ctx.user.name })),
})
