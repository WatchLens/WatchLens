import { useCallback, useState } from 'react'
import { useEvents } from '@/contexts/EventContext'

export type LikeState = 'like' | 'dislike' | null

export interface UseLikesOptions {
  /** Initial like count from the video record. Used for optimistic display. */
  initialCount?: number
}

export interface UseLikesResult {
  /** Current local like state (resets per mount; not server-persisted). */
  liked: LikeState
  isLiked: boolean
  isDisliked: boolean
  /** Optimistic count = initialCount + (1 if currently liked, else 0). */
  count: number
  like: () => void
  dislike: () => void
}

/**
 * Local like/dislike state with automatic LIKE / DISLIKE event emission.
 *
 * The like endpoint on the backend is a no-op acknowledgment — the source of
 * truth for downstream analysis is the LIKE / DISLIKE event in the events
 * table. This hook fires those events on each transition into the active
 * state and lets the surface stay free of bookkeeping.
 */
export function useLikes(
  videoId: string | undefined,
  opts: UseLikesOptions = {},
): UseLikesResult {
  const { trackEvent } = useEvents()
  const [liked, setLiked] = useState<LikeState>(null)

  const like = useCallback(() => {
    if (!videoId) return
    setLiked((prev) => {
      if (prev === 'like') return null
      trackEvent('LIKE', videoId, { payload: { videoId } })
      return 'like'
    })
  }, [videoId, trackEvent])

  const dislike = useCallback(() => {
    if (!videoId) return
    setLiked((prev) => {
      if (prev === 'dislike') return null
      trackEvent('DISLIKE', videoId, { payload: { videoId } })
      return 'dislike'
    })
  }, [videoId, trackEvent])

  const base = opts.initialCount ?? 0
  const count = base + (liked === 'like' ? 1 : 0)

  return {
    liked,
    isLiked: liked === 'like',
    isDisliked: liked === 'dislike',
    count,
    like,
    dislike,
  }
}
