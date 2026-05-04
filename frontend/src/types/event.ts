// ============================================================
// Event Types for User Study Logging
// ============================================================

// --- Session ---
// SESSION_START: fired on session creation with environment info
// SESSION_END: fired on beforeunload

// --- Page Navigation ---
// NAVIGATION: route change (from → to with dwell time)
// PAGE_LOAD: initial page render
// PAGE_EXIT: leaving a page (beforeunload or route change)

// --- Video Meta ---
// VIDEO_META_CAPTURED: video metadata snapshot on watch page load

// --- Playback ---
// VIDEO_PLAY: play event (includes currentTime, duration, playbackRate)
// VIDEO_PAUSE: pause event (includes currentTime, watchedDuration)
// VIDEO_SEEK: seek/skip (from, to, seekDistance)
// VIDEO_ENDED: natural end (watchedSegments, completionRate)
// VIDEO_PROGRESS: periodic progress snapshot (every 5s)
// VIDEO_WATCHED_1S: fires once per play when playback crosses 1 second watched
// VIDEO_WATCHED_5S: fires once per play when playback crosses 5 seconds watched
// VIDEO_BUFFERING: buffering start

// --- Player Controls ---
// PLAYBACK_RATE_CHANGE: speed change (newRate)
// VOLUME_CHANGE: volume/mute change
// FULLSCREEN_CHANGE: enter/exit fullscreen

// --- Impressions ---
// HOME_FEED: full video list shown on home feed load
// RECOMMENDATIONS: related videos shown on watch page
// IMPRESSION: single video entered viewport (existing, kept for backward compat)

// --- User Interactions ---
// FEED_CLICK: click on feed video (existing)
// LIKE: like a video (existing)
// DISLIKE: dislike a video (existing)
// VIDEO_CLICK: click on related/recommended video
// THUMBNAIL_HOVER: hover on a thumbnail with duration
// KEYBOARD_SHORTCUT: keyboard shortcut used in player

// --- Mouse / Scroll / Viewport ---
// MOUSE_MOVEMENT: sampled mouse positions
// SCROLL: scroll position snapshot
// VIEWPORT_VISIBILITY: visible items in viewport

// --- Tab / Window State ---
// VISIBILITY_CHANGE: tab visibility change
// WINDOW_FOCUS: window gained focus
// WINDOW_BLUR: window lost focus

export type EventType =
  // Session
  | 'SESSION_START'
  | 'SESSION_END'
  // Page navigation
  | 'NAVIGATION'
  | 'PAGE_LOAD'
  | 'PAGE_EXIT'
  // Video meta
  | 'VIDEO_META_CAPTURED'
  // Playback
  | 'VIDEO_PLAY'
  | 'VIDEO_PAUSE'
  | 'VIDEO_SEEK'
  | 'VIDEO_ENDED'
  | 'VIDEO_PROGRESS'
  | 'VIDEO_WATCHED_1S'
  | 'VIDEO_WATCHED_5S'
  | 'VIDEO_BUFFERING'
  // Player controls
  | 'PLAYBACK_RATE_CHANGE'
  | 'VOLUME_CHANGE'
  | 'FULLSCREEN_CHANGE'
  // Impressions
  | 'HOME_FEED'
  | 'RECOMMENDATIONS'
  | 'IMPRESSION'
  // User interactions (legacy names kept)
  | 'FEED_CLICK'
  | 'LIKE'
  | 'DISLIKE'
  | 'VIDEO_CLICK'
  | 'THUMBNAIL_HOVER'
  | 'KEYBOARD_SHORTCUT'
  // High-frequency
  | 'MOUSE_MOVEMENT'
  | 'SCROLL'
  | 'VIEWPORT_VISIBILITY'
  // Tab/window state
  | 'VISIBILITY_CHANGE'
  | 'WINDOW_FOCUS'
  | 'WINDOW_BLUR'
  // Layout
  | 'LAYOUT_CHANGE'

// Backward compat aliases
export type LegacyEventType = 'VIDEO_START' | 'VIDEO_END'

export interface EventCreate {
  event_type: EventType | LegacyEventType | string
  video_id?: string
  timestamp: string
  // Structured fields (kept for backward compat with existing events table columns)
  watch_ratio?: number
  watch_duration?: number
  position_in_feed?: number
  // All additional event data goes here
  payload?: Record<string, unknown>
}

export interface EventBatchCreate {
  session_id: string
  events: EventCreate[]
}

export interface EventBatchResponse {
  received: number
}

export interface SessionCreate {
  session_id: string
  user_agent: string
}

export interface SessionResponse {
  session_id: string
}

// --- Payload type helpers (not enforced at runtime, for dev guidance) ---

export interface EnvironmentInfo {
  viewport: { width: number; height: number }
  screen: { width: number; height: number; pixelRatio: number }
  userAgent: string
  language: string
  platform: string
  timezone: string
  connection?: { effectiveType?: string; downlink?: number }
}

export interface VideoImpressionItem {
  position: number
  videoId: string
  title: string
  channelName?: string
  duration?: number
  viewCount?: number
  thumbnailUrl?: string
}

// Generic tracking data for trackEvent
export interface EventTrackingData {
  watch_ratio?: number
  watch_duration?: number
  position_in_feed?: number
  video_position?: number
  [key: string]: unknown
}
