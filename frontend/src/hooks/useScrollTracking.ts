import { useEffect, useRef } from 'react'
import { useEvents } from '@/contexts/EventContext'

const THROTTLE_MS = 500

/**
 * Tracks scroll position changes (throttled to 500ms).
 * Emits SCROLL events with:
 * - scrollY, scrollPercent, maxScrollPercent, pageHeight
 */
export function useScrollTracking(): void {
  const { trackEvent } = useEvents()
  const maxScrollPercent = useRef(0)
  const lastEmit = useRef(0)

  useEffect(() => {
    const handleScroll = () => {
      const now = Date.now()
      if (now - lastEmit.current < THROTTLE_MS) return
      lastEmit.current = now

      const scrollY = window.scrollY
      const pageHeight = document.documentElement.scrollHeight
      const viewportHeight = window.innerHeight
      const scrollable = pageHeight - viewportHeight
      const scrollPercent = scrollable > 0 ? Math.round((scrollY / scrollable) * 100) : 0

      if (scrollPercent > maxScrollPercent.current) {
        maxScrollPercent.current = scrollPercent
      }

      trackEvent('SCROLL', undefined, {
        payload: {
          scrollY,
          scrollPercent,
          maxScrollPercent: maxScrollPercent.current,
          pageHeight,
        },
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      maxScrollPercent.current = 0
    }
  }, [trackEvent])
}
