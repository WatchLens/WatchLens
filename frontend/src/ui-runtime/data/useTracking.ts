import { useEvents } from '@/contexts/EventContext'
import type { EventTrackingData, EventType } from '@/types'

export interface UseTrackingResult {
  /**
   * Manual event emit. Surface primitives cover the standard schema; reach
   * for this only when a bespoke UI needs to log something the surfaces
   * don't already produce. Prefer adding the event to a surface so every
   * UI variant logs it the same way.
   */
  trackEvent: (
    eventType: EventType | string,
    videoId?: string,
    data?: EventTrackingData,
  ) => void
  flushEvents: () => Promise<void>
  sessionId: string | null
}

export function useTracking(): UseTrackingResult {
  const { trackEvent, flushEvents, sessionId } = useEvents()
  return { trackEvent, flushEvents, sessionId }
}
