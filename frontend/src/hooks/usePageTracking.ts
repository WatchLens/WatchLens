import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useEvents, getPageType } from '@/contexts/EventContext'

/**
 * Tracks page navigation events:
 * - PAGE_LOAD: initial render of a page
 * - NAVIGATION: route change (from → to with dwell time)
 * - PAGE_EXIT: leaving a page (fired as NAVIGATION's "from" side)
 */
export function usePageTracking(): void {
  const { trackEvent } = useEvents()
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)
  const pageEnterTimeRef = useRef(Date.now())

  useEffect(() => {
    const currentPath = location.pathname
    const now = Date.now()

    if (prevPathRef.current === null) {
      // First page load
      trackEvent('PAGE_LOAD', undefined, {
        payload: {
          url: currentPath,
          pageType: getPageType(currentPath),
        },
      })
    } else if (prevPathRef.current !== currentPath) {
      // Route change
      const dwellTimeMs = now - pageEnterTimeRef.current
      trackEvent('NAVIGATION', undefined, {
        payload: {
          from: prevPathRef.current,
          to: currentPath,
          pageType: getPageType(currentPath),
          dwellTimeMs,
          dwellTimeSec: Math.round(dwellTimeMs / 1000),
        },
      })
    }

    prevPathRef.current = currentPath
    pageEnterTimeRef.current = now
  }, [location.pathname, trackEvent])

  // PAGE_EXIT on unmount
  useEffect(() => {
    return () => {
      const dwellTimeMs = Date.now() - pageEnterTimeRef.current
      trackEvent('PAGE_EXIT', undefined, {
        payload: {
          url: prevPathRef.current,
          pageType: getPageType(prevPathRef.current || '/'),
          dwellTimeMs,
          dwellTimeSec: Math.round(dwellTimeMs / 1000),
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
