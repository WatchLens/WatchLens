/**
 * Public data hooks for both UI tracks (code track + editor track).
 *
 * These are the only sanctioned way for a custom UI to read platform data.
 * Bypassing them — calling axios or the API client directly — breaks the
 * paper's measurement contract because some hooks emit events as a side
 * effect (LIKE, DISLIKE) and bypassing them silently drops those events.
 *
 * Code track imports as `@watchlens/data` (rewritten by the in-browser
 * compiler at runtime); the bundled UI presets import from this path.
 */

export { useFeed } from './useFeed'
export type { UseFeedOptions, UseFeedResult } from './useFeed'

export { useVideo } from './useVideo'
export type { UseVideoResult } from './useVideo'

export { useRelated } from './useRelated'
export type { UseRelatedOptions, UseRelatedResult } from './useRelated'

export { useComments, useReplies } from './useComments'
export type {
  UseCommentsOptions,
  UseCommentsResult,
  UseRepliesOptions,
  UseRepliesResult,
} from './useComments'

export { useLikes } from './useLikes'
export type { LikeState, UseLikesOptions, UseLikesResult } from './useLikes'

export { useUser } from './useUser'
export type { UseUserResult } from './useUser'

export { useTracking } from './useTracking'
export type { UseTrackingResult } from './useTracking'

export { MockDataContext, MockDataProvider, useMockData } from './mockContext'
export type { MockData } from './mockContext'
