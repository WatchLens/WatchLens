import { useState, useRef, useEffect, useCallback } from 'react'

// --- Callback payload types ---

export interface PlayEvent {
  currentTime: number
  duration: number
  playbackRate: number
}

export interface PauseEvent {
  currentTime: number
  duration: number
  watchedDuration: number
}

export interface SeekEvent {
  from: number
  to: number
  seekDistance: number
  duration: number
}

export interface EndedEvent {
  duration: number
  totalWatchedTime: number
  completionRate: number
}

export interface ProgressEvent {
  currentTime: number
  duration: number
  progress: number
}

export interface BufferingEvent {
  currentTime: number
  readyState: number
  networkState: number
}

export interface PlaybackRateEvent {
  newRate: number
  currentTime: number
}

export interface VolumeEvent {
  volume: number
  previousVolume: number
  muted: boolean
  previousMuted: boolean
}

export interface FullscreenEvent {
  isFullscreen: boolean
}

export interface KeyboardShortcutEvent {
  key: string
  action: string
  currentTime: number
  shiftKey: boolean
  ctrlKey: boolean
}

interface VideoPlayerProps {
  src: string
  poster?: string
  onPlay?: (e: PlayEvent) => void
  onPause?: (e: PauseEvent) => void
  onSeek?: (e: SeekEvent) => void
  onEnded?: (e: EndedEvent) => void
  onProgress?: (e: ProgressEvent) => void
  onWatched1s?: (e: ProgressEvent) => void
  onWatched5s?: (e: ProgressEvent) => void
  onBuffering?: (e: BufferingEvent) => void
  onPlaybackRateChange?: (e: PlaybackRateEvent) => void
  onVolumeChange?: (e: VolumeEvent) => void
  onFullscreenChange?: (e: FullscreenEvent) => void
  onKeyboardShortcut?: (e: KeyboardShortcutEvent) => void
  onVideoReady?: (duration: number) => void
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const PROGRESS_INTERVAL = 5_000 // 5 seconds
const WATCHED_1S_THRESHOLD_SEC = 1
const WATCHED_5S_THRESHOLD_SEC = 5
const CONTROLS_HIDE_DELAY = 3000

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoPlayer({
  src,
  poster,
  onPlay,
  onPause,
  onSeek,
  onEnded,
  onProgress,
  onWatched1s,
  onWatched5s,
  onBuffering,
  onPlaybackRateChange,
  onVolumeChange,
  onFullscreenChange,
  onKeyboardShortcut,
  onVideoReady,
}: VideoPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const volumeBarRef = useRef<HTMLDivElement>(null)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastProgressTimeRef = useRef(0)
  const playStartTimeRef = useRef<number | null>(null)
  const totalWatchedRef = useRef(0)
  const prevVolumeRef = useRef(1)
  const prevMutedRef = useRef(false)
  const seekFromRef = useRef(0)
  const isSeeking = useRef(false)
  const watched1sFiredRef = useRef(false)
  const watched5sFiredRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [showRateMenu, setShowRateMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPos, setHoverPos] = useState(0)
  const [isBuffering, setIsBuffering] = useState(false)

  // --- Controls visibility ---
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    if (playing) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false)
        setShowRateMenu(false)
      }, CONTROLS_HIDE_DELAY)
    }
  }, [playing])

  useEffect(() => {
    resetControlsTimer()
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current) }
  }, [playing, resetControlsTimer])

  // --- Progress reporting (every 5s) ---
  useEffect(() => {
    if (playing) {
      progressTimerRef.current = setInterval(() => {
        const v = videoRef.current
        if (!v) return
        onProgress?.({
          currentTime: v.currentTime,
          duration: v.duration || 0,
          progress: v.duration ? v.currentTime / v.duration : 0,
        })
      }, PROGRESS_INTERVAL)
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current) }
  }, [playing, onProgress])

  // Reset per-video state when the source changes
  useEffect(() => {
    watched1sFiredRef.current = false
    watched5sFiredRef.current = false
  }, [src])

  // --- Fullscreen change listener ---
  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!document.fullscreenElement
      setIsFullscreen(fs)
      onFullscreenChange?.({ isFullscreen: fs })
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [onFullscreenChange])

  // --- Video element event handlers ---
  const handleLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    onVideoReady?.(v.duration)
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || isSeeking.current) return
    setCurrentTime(v.currentTime)

    // Update buffered
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1))
    }

    // Watched-threshold fires (once per src)
    const duration = v.duration || 0
    const ratio = duration > 0 ? v.currentTime / duration : 0
    if (!watched1sFiredRef.current && v.currentTime >= WATCHED_1S_THRESHOLD_SEC) {
      watched1sFiredRef.current = true
      onWatched1s?.({ currentTime: v.currentTime, duration, progress: ratio })
    }
    if (!watched5sFiredRef.current && v.currentTime >= WATCHED_5S_THRESHOLD_SEC) {
      watched5sFiredRef.current = true
      onWatched5s?.({ currentTime: v.currentTime, duration, progress: ratio })
    }
  }

  const handlePlay = () => {
    const v = videoRef.current
    if (!v) return
    setPlaying(true)
    setIsBuffering(false)
    playStartTimeRef.current = v.currentTime
    onPlay?.({
      currentTime: v.currentTime,
      duration: v.duration || 0,
      playbackRate: v.playbackRate,
    })
  }

  const handlePause = () => {
    const v = videoRef.current
    if (!v) return
    setPlaying(false)
    // Accumulate watched time
    if (playStartTimeRef.current !== null) {
      totalWatchedRef.current += Math.abs(v.currentTime - playStartTimeRef.current)
      playStartTimeRef.current = null
    }
    onPause?.({
      currentTime: v.currentTime,
      duration: v.duration || 0,
      watchedDuration: totalWatchedRef.current,
    })
  }

  const handleEnded = () => {
    const v = videoRef.current
    if (!v) return
    setPlaying(false)
    if (playStartTimeRef.current !== null) {
      totalWatchedRef.current += Math.abs(v.currentTime - playStartTimeRef.current)
      playStartTimeRef.current = null
    }
    onEnded?.({
      duration: v.duration || 0,
      totalWatchedTime: totalWatchedRef.current,
      completionRate: v.duration ? Math.min(totalWatchedRef.current / v.duration, 2) : 0,
    })
  }

  const handleWaiting = () => {
    const v = videoRef.current
    if (!v) return
    setIsBuffering(true)
    onBuffering?.({
      currentTime: v.currentTime,
      readyState: v.readyState,
      networkState: v.networkState,
    })
  }

  const handleCanPlay = () => {
    setIsBuffering(false)
  }

  const handleSeeking = () => {
    isSeeking.current = true
  }

  const handleSeeked = () => {
    const v = videoRef.current
    if (!v) return
    const from = seekFromRef.current
    const to = v.currentTime
    isSeeking.current = false
    setCurrentTime(v.currentTime)

    // Only fire seek event if the distance is meaningful (> 0.5s)
    if (Math.abs(to - from) > 0.5) {
      onSeek?.({
        from,
        to,
        seekDistance: to - from,
        duration: v.duration || 0,
      })
    }
  }

  // --- User actions ---
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [])

  const seekBy = useCallback((seconds: number) => {
    const v = videoRef.current
    if (!v) return
    seekFromRef.current = v.currentTime
    v.currentTime = Math.max(0, Math.min(v.currentTime + seconds, v.duration || 0))
  }, [])

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current
    if (!v) return
    seekFromRef.current = v.currentTime
    v.currentTime = Math.max(0, Math.min(time, v.duration || 0))
  }, [])

  const changeVolume = useCallback((newVol: number) => {
    const v = videoRef.current
    if (!v) return
    const prev = v.volume
    const prevM = v.muted
    v.volume = Math.max(0, Math.min(newVol, 1))
    v.muted = false
    setVolume(v.volume)
    setMuted(false)
    onVolumeChange?.({
      volume: v.volume,
      previousVolume: prev,
      muted: false,
      previousMuted: prevM,
    })
    prevVolumeRef.current = v.volume
    prevMutedRef.current = false
  }, [onVolumeChange])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const prev = v.volume
    const prevM = v.muted
    v.muted = !v.muted
    setMuted(v.muted)
    onVolumeChange?.({
      volume: v.volume,
      previousVolume: prev,
      muted: v.muted,
      previousMuted: prevM,
    })
    prevMutedRef.current = v.muted
  }, [onVolumeChange])

  const changeRate = useCallback((rate: number) => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = rate
    setPlaybackRate(rate)
    setShowRateMenu(false)
    onPlaybackRateChange?.({ newRate: rate, currentTime: v.currentTime })
  }, [onPlaybackRateChange])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current.requestFullscreen().catch(() => {})
    }
  }, [])

  // --- Progress bar interaction ---
  const handleProgressBarClick = (e: React.MouseEvent) => {
    if (!progressBarRef.current || !videoRef.current) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    seekTo(ratio * (videoRef.current.duration || 0))
  }

  const handleProgressBarHover = (e: React.MouseEvent) => {
    if (!progressBarRef.current || !duration) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    setHoverTime(ratio * duration)
    setHoverPos(e.clientX - rect.left)
  }

  // --- Volume bar interaction ---
  const handleVolumeBarClick = (e: React.MouseEvent) => {
    if (!volumeBarRef.current) return
    const rect = volumeBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    changeVolume(ratio)
  }

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // Only capture when this player's container or its children are focused, or no specific element is focused
      const active = document.activeElement
      const container = containerRef.current
      if (active && active !== document.body && container && !container.contains(active)) return

      const v = videoRef.current
      if (!v) return

      let action = ''
      switch (e.key.toLowerCase()) {
        case 'k':
        case ' ':
          e.preventDefault()
          togglePlay()
          action = v.paused ? 'PLAY' : 'PAUSE'
          break
        case 'j':
          e.preventDefault()
          seekBy(-10)
          action = 'REWIND_10S'
          break
        case 'l':
          e.preventDefault()
          seekBy(10)
          action = 'FORWARD_10S'
          break
        case 'arrowleft':
          e.preventDefault()
          seekBy(-5)
          action = 'REWIND_5S'
          break
        case 'arrowright':
          e.preventDefault()
          seekBy(5)
          action = 'FORWARD_5S'
          break
        case 'arrowup':
          e.preventDefault()
          changeVolume(v.volume + 0.05)
          action = 'VOLUME_UP'
          break
        case 'arrowdown':
          e.preventDefault()
          changeVolume(v.volume - 0.05)
          action = 'VOLUME_DOWN'
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          action = 'TOGGLE_FULLSCREEN'
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          action = 'TOGGLE_MUTE'
          break
        case ',':
          if (e.shiftKey) {
            e.preventDefault()
            const idx = PLAYBACK_RATES.indexOf(v.playbackRate)
            if (idx > 0) changeRate(PLAYBACK_RATES[idx - 1])
            action = 'SPEED_DOWN'
          }
          break
        case '.':
          if (e.shiftKey) {
            e.preventDefault()
            const idx = PLAYBACK_RATES.indexOf(v.playbackRate)
            if (idx < PLAYBACK_RATES.length - 1) changeRate(PLAYBACK_RATES[idx + 1])
            action = 'SPEED_UP'
          }
          break
        default:
          return
      }

      if (action) {
        resetControlsTimer()
        onKeyboardShortcut?.({
          key: e.key,
          action,
          currentTime: v.currentTime,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, seekBy, changeVolume, toggleMute, toggleFullscreen, changeRate, resetControlsTimer, onKeyboardShortcut])

  // Reset watched time when src changes
  useEffect(() => {
    totalWatchedRef.current = 0
    playStartTimeRef.current = null
    lastProgressTimeRef.current = 0
  }, [src])

  // Volume icon selection
  const volumeIcon = muted || volume === 0
    ? (
      // Muted icon
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    )
    : volume < 0.5
      ? (
        // Low volume icon
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M15.536 8.464a5 5 0 010 7.072" />
      )
      : (
        // High volume icon
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M15.536 8.464a5 5 0 010 7.072 M17.95 6.05a8 8 0 010 11.9" />
      )

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black group select-none"
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => { if (playing) setShowControls(false) }}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onDoubleClick={(e) => { e.preventDefault(); toggleFullscreen() }}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onSeeking={handleSeeking}
        onSeeked={handleSeeked}
        preload="metadata"
        playsInline
        autoPlay
      />

      {/* Buffering spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Large center play button (when paused and controls visible) */}
      {!playing && showControls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress bar */}
        <div className="px-3 pt-8">
          <div
            ref={progressBarRef}
            className="relative h-1 bg-white/30 cursor-pointer group/progress hover:h-1.5 transition-all"
            onClick={handleProgressBarClick}
            onMouseMove={handleProgressBarHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full bg-white/40"
              style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
            />
            {/* Played */}
            <div
              className="absolute top-0 left-0 h-full bg-red-600"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
            {/* Seek handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
            />
            {/* Hover time tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-8 bg-black/90 text-white text-xs px-2 py-1 rounded pointer-events-none"
                style={{ left: `${hoverPos}px`, transform: 'translateX(-50%)' }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-1 px-3 py-2">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="p-1.5 text-white hover:text-white/80" title={playing ? 'Pause (k)' : 'Play (k)'}>
            {playing ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Rewind 10s */}
          <button onClick={() => seekBy(-10)} className="p-1.5 text-white hover:text-white/80" title="Rewind 10s (j)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>

          {/* Forward 10s */}
          <button onClick={() => seekBy(10)} className="p-1.5 text-white hover:text-white/80" title="Forward 10s (l)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
            </svg>
          </button>

          {/* Volume */}
          <div className="flex items-center group/vol">
            <button onClick={toggleMute} className="p-1.5 text-white hover:text-white/80" title="Mute (m)">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {volumeIcon}
              </svg>
            </button>
            <div className="w-0 group-hover/vol:w-20 overflow-hidden transition-all duration-200">
              <div
                ref={volumeBarRef}
                className="relative h-1 bg-white/30 cursor-pointer mx-1 rounded-full"
                onClick={handleVolumeBarClick}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-white rounded-full"
                  style={{ width: `${muted ? 0 : volume * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Time */}
          <div className="text-white text-xs ml-2 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Playback rate */}
          <div className="relative">
            <button
              onClick={() => setShowRateMenu(!showRateMenu)}
              className="px-2 py-1 text-white text-xs hover:text-white/80 font-medium"
              title="Playback speed"
            >
              {playbackRate === 1 ? '1x' : `${playbackRate}x`}
            </button>
            {showRateMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 rounded-lg py-1 min-w-[80px] shadow-xl">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => changeRate(rate)}
                    className={`w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 ${
                      rate === playbackRate ? 'text-white font-semibold' : 'text-white/70'
                    }`}
                  >
                    {rate === 1 ? 'Normal' : `${rate}x`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="p-1.5 text-white hover:text-white/80" title="Fullscreen (f)">
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4m-7 10l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
