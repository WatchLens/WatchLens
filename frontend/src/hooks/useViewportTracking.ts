import { useEffect, useRef, useCallback } from 'react'
import { useEvents } from '@/contexts/EventContext'

interface VisibleItem {
  videoId: string
  position: number
  visibilityRatio: number
  enterTime: number
  exitTime?: number
}

const REPORT_INTERVAL_MS = 3000  // report every 3 seconds

/**
 * Tracks which video items are visible in the viewport using IntersectionObserver.
 * Emits VIEWPORT_VISIBILITY events periodically with currently visible items.
 *
 * Returns a ref callback to attach to each video card element.
 *
 * @param context - current page context ('HOME' | 'WATCH')
 */
export function useViewportTracking(context: string) {
  const { trackEvent } = useEvents()
  const visibleItems = useRef<Map<string, VisibleItem>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const contextRef = useRef(context)
  contextRef.current = context

  // Report visible items periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const items = Array.from(visibleItems.current.values())
      if (items.length === 0) return

      trackEvent('VIEWPORT_VISIBILITY', undefined, {
        payload: {
          visibleItems: items,
          context: contextRef.current,
        },
      })
    }, REPORT_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [trackEvent])

  // Create observer once
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement
          const videoId = el.dataset.videoId
          const position = parseInt(el.dataset.position || '0', 10)
          if (!videoId) return

          if (entry.isIntersecting) {
            visibleItems.current.set(videoId, {
              videoId,
              position,
              visibilityRatio: Math.round(entry.intersectionRatio * 100) / 100,
              enterTime: Date.now(),
            })
          } else {
            const existing = visibleItems.current.get(videoId)
            if (existing) {
              existing.exitTime = Date.now()
              // Keep briefly for the next report, then remove
              setTimeout(() => visibleItems.current.delete(videoId), REPORT_INTERVAL_MS + 500)
            }
          }
        })
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    )

    return () => {
      observerRef.current?.disconnect()
      visibleItems.current.clear()
    }
  }, [])

  const observeElement = useCallback((el: HTMLElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el)
    }
  }, [])

  return { observeElement }
}
