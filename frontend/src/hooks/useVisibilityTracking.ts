import { useEffect, useRef } from 'react'
import { useEvents } from '@/contexts/EventContext'

/**
 * Tracks tab/window visibility changes:
 * - VISIBILITY_CHANGE: tab hidden/visible
 * - WINDOW_FOCUS: window gained focus
 * - WINDOW_BLUR: window lost focus
 *
 * @param videoId - current video ID if on a watch page (for correlating with playback)
 */
export function useVisibilityTracking(videoId?: string): void {
  const { trackEvent } = useEvents()
  const videoIdRef = useRef(videoId)
  videoIdRef.current = videoId

  useEffect(() => {
    const handleVisibilityChange = () => {
      trackEvent('VISIBILITY_CHANGE', videoIdRef.current, {
        payload: {
          visible: !document.hidden,
          visibilityState: document.visibilityState,
        },
      })
    }

    const handleFocus = () => {
      trackEvent('WINDOW_FOCUS', videoIdRef.current, { payload: {} })
    }

    const handleBlur = () => {
      trackEvent('WINDOW_BLUR', videoIdRef.current, { payload: {} })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [trackEvent])
}
