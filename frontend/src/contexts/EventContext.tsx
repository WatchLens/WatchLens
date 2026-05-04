import { createContext, useContext, useRef, useEffect, useCallback, ReactNode, MutableRefObject } from 'react'
import { sendEventBatch, createSession } from '@/api/events'
import { useAuth } from './AuthContext'
import type { EventCreate, EventType, EventTrackingData, EnvironmentInfo } from '@/types'

// High-frequency event types that use a separate buffer with faster flushing
const HIGH_FREQ_EVENTS: Set<string> = new Set([
  'MOUSE_MOVEMENT',
  'SCROLL',
  'VIEWPORT_VISIBILITY',
  'VIDEO_PROGRESS',
])

// Events that must flush immediately (no buffering)
const IMMEDIATE_EVENTS: Set<string> = new Set([
  'VIDEO_ENDED',
  'LIKE',
  'DISLIKE',
  'SESSION_END',
  'PAGE_EXIT',
])

interface EventContextType {
  trackEvent: (eventType: EventType | string, videoId: string | undefined, data?: EventTrackingData) => void
  flushEvents: () => Promise<void>
  sessionId: string | null
}

const EventContext = createContext<EventContextType | null>(null)

// Fallback UUID generator for non-secure contexts (HTTP)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return (([1e7] as unknown as string) + -1e3 + -4e3 + -8e3 + -1e11).replace(
      /[018]/g,
      (c: string) =>
        (
          Number(c) ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
        ).toString(16)
    )
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function collectEnvironment(): EnvironmentInfo {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio || 1 },
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    connection: nav.connection
      ? { effectiveType: nav.connection.effectiveType, downlink: nav.connection.downlink }
      : undefined,
  }
}

// Batching config
const BATCH_SIZE = 20
const BATCH_INTERVAL = 5000       // 5 seconds for normal events
const HF_BATCH_INTERVAL = 2000   // 2 seconds for high-frequency events
const HF_BATCH_SIZE = 50         // larger buffer for high-frequency

interface EventProviderProps {
  children: ReactNode
}

export function EventProvider({ children }: EventProviderProps): JSX.Element {
  const { user } = useAuth()
  const eventBuffer: MutableRefObject<EventCreate[]> = useRef([])
  const hfEventBuffer: MutableRefObject<EventCreate[]> = useRef([])
  const lastSendTime: MutableRefObject<number> = useRef(Date.now())
  const lastHfSendTime: MutableRefObject<number> = useRef(Date.now())
  const sessionId: MutableRefObject<string | null> = useRef(null)
  const sessionStartFired: MutableRefObject<boolean> = useRef(false)

  // Flush a given buffer
  const flushBuffer = useCallback(async (
    buffer: MutableRefObject<EventCreate[]>,
    lastTime: MutableRefObject<number>,
  ): Promise<void> => {
    if (buffer.current.length === 0 || !sessionId.current) return

    const eventsToSend = [...buffer.current]
    buffer.current = []

    try {
      await sendEventBatch({
        session_id: sessionId.current,
        events: eventsToSend,
      })
      lastTime.current = Date.now()
    } catch (error) {
      // 4xx means the batch is permanently unacceptable (stale session →
      // 403, schema mismatch → 422). Re-queuing grew the buffer forever and
      // eventually tripped the server-side max_length cap, so we drop.
      // Network / 5xx errors stay retryable.
      const status = (error as { response?: { status?: number } } | undefined)?.response?.status
      if (status && status >= 400 && status < 500) {
        if (import.meta.env.DEV) {
          console.error('Dropping event batch (client error):', status)
        }
        return
      }
      buffer.current = [...eventsToSend, ...buffer.current]
      if (import.meta.env.DEV) {
        console.error('Failed to send events:', error)
      }
    }
  }, [])

  const flushEvents = useCallback(async (): Promise<void> => {
    await Promise.all([
      flushBuffer(eventBuffer, lastSendTime),
      flushBuffer(hfEventBuffer, lastHfSendTime),
    ])
  }, [flushBuffer])

  const trackEvent = useCallback(
    (eventType: EventType | string, videoId: string | undefined, data: EventTrackingData = {}): void => {
      if (!sessionId.current) return

      const event: EventCreate = {
        event_type: eventType,
        video_id: videoId,
        timestamp: new Date().toISOString(),
        ...data,
      }

      // Route to appropriate buffer
      if (HIGH_FREQ_EVENTS.has(eventType)) {
        hfEventBuffer.current.push(event)
        if (hfEventBuffer.current.length >= HF_BATCH_SIZE) {
          flushBuffer(hfEventBuffer, lastHfSendTime)
        }
      } else {
        eventBuffer.current.push(event)

        // Flush immediately for important events
        if (IMMEDIATE_EVENTS.has(eventType)) {
          flushBuffer(eventBuffer, lastSendTime)
          return
        }

        // Flush if buffer is full
        if (eventBuffer.current.length >= BATCH_SIZE) {
          flushBuffer(eventBuffer, lastSendTime)
        }
      }
    },
    [flushBuffer]
  )

  // Initialize or get session ID + fire SESSION_START
  useEffect(() => {
    if (!user) return

    // If the stored session_id belongs to a different user (e.g., a previous
    // admin login in the same tab), discard it. Otherwise we'd POST events
    // with a foreign session_id and trigger 403 loops.
    // user.id is typed as number in User type but backend returns UUID string;
    // stringify both sides for a robust equality check.
    const currentUserKey = String(user.id)
    const storedUser = sessionStorage.getItem('session_user_id')
    // Wipe whenever the stored owner doesn't match — includes the case where
    // the session predates this tracking key (storedUser === null) which
    // happens for any sessionStorage set by an older frontend build.
    if (storedUser !== currentUserKey) {
      sessionStorage.removeItem('session_id')
      sessionStartFired.current = false
      eventBuffer.current = []
      hfEventBuffer.current = []
    }

    let existingSession = sessionStorage.getItem('session_id')

    if (!existingSession) {
      existingSession = generateUUID()
      sessionStorage.setItem('session_id', existingSession)

      // Register session with backend
      createSession({
        session_id: existingSession,
        user_agent: navigator.userAgent,
      }).catch((err) => {
        if (import.meta.env.DEV) {
          console.error('createSession failed:', err)
        }
      })
    }

    sessionStorage.setItem('session_user_id', currentUserKey)
    sessionId.current = existingSession

    // Fire SESSION_START once per mount
    if (!sessionStartFired.current) {
      sessionStartFired.current = true
      const env = collectEnvironment()
      trackEvent('SESSION_START', undefined, {
        payload: {
          sessionId: existingSession,
          startTime: new Date().toISOString(),
          referrer: document.referrer || '',
          initialUrl: window.location.href,
          initialPageType: getPageType(window.location.pathname),
          environment: env,
        },
      })
    }
  }, [user, trackEvent])

  // Periodic flush - normal events
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastSendTime.current >= BATCH_INTERVAL) {
        flushBuffer(eventBuffer, lastSendTime)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [flushBuffer])

  // Periodic flush - high-frequency events
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastHfSendTime.current >= HF_BATCH_INTERVAL) {
        flushBuffer(hfEventBuffer, lastHfSendTime)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [flushBuffer])

  // Flush on page unload + fire SESSION_END
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (!sessionId.current) return

      // Add SESSION_END event to buffer before sending
      const sessionEndEvent: EventCreate = {
        event_type: 'SESSION_END',
        timestamp: new Date().toISOString(),
        payload: { sessionId: sessionId.current },
      }

      const allEvents = [
        ...eventBuffer.current,
        ...hfEventBuffer.current,
        sessionEndEvent,
      ]

      if (allEvents.length > 0) {
        const data = JSON.stringify({
          session_id: sessionId.current,
          events: allEvents,
        })
        const blob = new Blob([data], { type: 'application/json' })
        navigator.sendBeacon('/api/v1/events/batch', blob)
      }

      eventBuffer.current = []
      hfEventBuffer.current = []
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return (
    <EventContext.Provider value={{ trackEvent, flushEvents, sessionId: sessionId.current }}>
      {children}
    </EventContext.Provider>
  )
}

export function useEvents(): EventContextType {
  const context = useContext(EventContext)
  if (!context) {
    throw new Error('useEvents must be used within an EventProvider')
  }
  return context
}

// Helper to derive page type from pathname
function getPageType(pathname: string): string {
  if (pathname === '/' || pathname === '/feed') return 'HOME'
  if (pathname.startsWith('/watch/')) return 'WATCH'
  if (pathname === '/login') return 'LOGIN'
  return 'OTHER'
}

export { getPageType }
