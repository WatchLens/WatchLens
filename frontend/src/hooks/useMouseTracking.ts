import { useEffect, useRef } from 'react'
import { useEvents } from '@/contexts/EventContext'

const SAMPLING_INTERVAL_MS = 100  // sample every 100ms
const BATCH_DURATION_MS = 2000    // emit batch every 2s

interface MousePosition {
  x: number
  y: number
  timestamp: number
}

/**
 * Tracks mouse movement positions sampled at 100ms intervals.
 * Batches positions and emits MOUSE_MOVEMENT events every 2 seconds.
 *
 * @param context - current page context ('HOME' | 'WATCH')
 */
export function useMouseTracking(context: string): void {
  const { trackEvent } = useEvents()
  const positions = useRef<MousePosition[]>([])
  const lastSampleTime = useRef(0)
  const contextRef = useRef(context)
  contextRef.current = context

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastSampleTime.current < SAMPLING_INTERVAL_MS) return
      lastSampleTime.current = now

      positions.current.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: now,
      })
    }

    const flushInterval = setInterval(() => {
      if (positions.current.length === 0) return

      const batch = [...positions.current]
      positions.current = []

      const startTime = batch[0].timestamp
      const endTime = batch[batch.length - 1].timestamp

      trackEvent('MOUSE_MOVEMENT', undefined, {
        payload: {
          positions: batch,
          samplingIntervalMs: SAMPLING_INTERVAL_MS,
          context: contextRef.current,
          duration: endTime - startTime,
        },
      })
    }, BATCH_DURATION_MS)

    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearInterval(flushInterval)
      positions.current = []
    }
  }, [trackEvent])
}
