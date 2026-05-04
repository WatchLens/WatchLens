import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getVideoComments, getCommentReplies } from '@/api/videos'
import { useVideoTracking } from '@/hooks/useVideoTracking'
import type { Video, RelatedVideosResponse, Comment as CommentType, CommentListResponse } from '@/types'

// --- Helpers ---

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}hr ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${Math.floor(diffMonth / 12)}yr ago`
}

function formatCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return `${count}`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function avatarColor(name: string): string {
  const colors = ['#534AB7', '#D85A30', '#1D9E75', '#378ADD', '#993556', '#E53935', '#3D5AFE', '#00897B']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// --- Thumbnail with extension fallback ---

function ThumbImg({ thumbBase, alt }: { thumbBase: string; alt: string }) {
  const EXTS = ['jpg', 'png', 'webp'] as const
  const [extIdx, setExtIdx] = useState(0)
  const [error, setError] = useState(false)
  const src = error ? null : thumbBase.includes('.') ? thumbBase : `${thumbBase}.${EXTS[extIdx]}`

  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.12)"><path d="M8 5v14l11-7z" /></svg>
      </div>
    )
  }
  return (
    <img src={src} alt={alt} className="w-full h-full object-cover"
      onError={() => { if (!thumbBase.includes('.') && extIdx < EXTS.length - 1) setExtIdx(i => i + 1); else setError(true) }}
    />
  )
}

// --- Reply List ---

function ReplyList({ videoId, commentId, replyCount }: { videoId: string; commentId: string; replyCount: number }) {
  const [expanded, setExpanded] = useState(false)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<CommentListResponse>({
    queryKey: ['replies', videoId, commentId],
    queryFn: ({ pageParam }) => getCommentReplies(videoId, commentId, pageParam as number, 10),
    getNextPageParam: (last) => last.has_more ? last.page + 1 : undefined,
    initialPageParam: 1,
    enabled: expanded,
  })
  const replies = data?.pages.flatMap(p => p.comments) || []

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)}
        className="text-[#3ea6ff] text-[11px] font-medium mt-1 hover:underline">
        {replyCount} replies
      </button>
    )
  }
  return (
    <div className="mt-2 ml-9 space-y-0">
      {replies.map(r => <CmtItem key={r.id} comment={r} videoId={videoId} isReply />)}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
          className="text-[#3ea6ff] text-[10px] mt-1 hover:underline">
          {isFetchingNextPage ? 'Loading...' : 'More'}
        </button>
      )}
      <button onClick={() => setExpanded(false)} className="text-[#3ea6ff] text-[10px] mt-1 hover:underline">Hide</button>
    </div>
  )
}

// --- Comment Item (matches HTML .cmt) ---

function CmtItem({ comment, videoId, isReply = false }: { comment: CommentType; videoId: string; isReply?: boolean }) {
  return (
    <div className="flex gap-2.5 py-2.5 border-t border-gray-200 dark:border-[#1e1e1e] first:border-t-0" style={isReply ? { borderTop: 'none' } : undefined}>
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
        style={{ background: avatarColor(comment.author_name) }}>
        {(comment.author_name || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-medium text-gray-500 dark:text-[#999]">{comment.author_name}</span>
          <span className="text-[10px] text-gray-400 dark:text-[#555]">{timeAgo(comment.published_at)}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-gray-800 dark:text-[#ddd]">{comment.text}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] flex items-center gap-1 cursor-pointer text-gray-400 dark:text-[#555] hover:text-gray-600 dark:hover:text-[#aaa]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>
            {comment.like_count > 0 && formatCount(comment.like_count)}
          </span>
          <span className="text-[10px] flex items-center cursor-pointer text-gray-400 dark:text-[#555] hover:text-gray-600 dark:hover:text-[#aaa]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" /></svg>
          </span>
          <span className="text-[10px] cursor-pointer text-gray-400 dark:text-[#555] hover:text-gray-600 dark:hover:text-[#aaa]">reply</span>
        </div>
        {!isReply && comment.reply_count > 0 && (
          <ReplyList videoId={videoId} commentId={comment.comment_id} replyCount={comment.reply_count} />
        )}
      </div>
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface ShortsWatchProps {
  video: Video
  videoSrc: string
  relatedData: RelatedVideosResponse | undefined
  onLike: () => void
  onDislike: () => void
  liked: 'like' | 'dislike' | null
  onRelatedVideoClick?: (relatedVideo: Video, position: number) => void
  onPlayStateChange?: (playing: boolean) => void
  onFirstPlayEnd?: () => void
}

export default function ShortsWatch({
  video, videoSrc, relatedData, onLike, onDislike, liked,
  onRelatedVideoClick, onPlayStateChange, onFirstPlayEnd,
}: ShortsWatchProps): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tracking = useVideoTracking()

  const goToFeed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    navigate('/')
  }, [navigate, queryClient])
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  // Track watched time for this playthrough
  const playStartTimeRef = useRef<number | null>(null)
  const totalWatchedRef = useRef(0)
  const lastSeekFromRef = useRef<number | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(false)

  // Theme detection
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  const t = useMemo(() => isDark ? {
    bg: '#0f0f0f', border: '#272727', text: '#fff', textSec: '#aaa', textTer: '#888',
    textMuted: '#555', cardHover: '#1a1a1a', input: '#121212', inputBorder: '#303030',
    searchBtn: '#222', accent: '#3ea6ff', thumbBg: '#222', cmt: '#ddd', cmtBorder: '#1e1e1e',
  } : {
    bg: '#ffffff', border: '#e5e7eb', text: '#111', textSec: '#666', textTer: '#888',
    textMuted: '#999', cardHover: '#f3f4f6', input: '#f3f4f6', inputBorder: '#d1d5db',
    searchBtn: '#f3f4f6', accent: '#065fd4', thumbBg: '#e5e7eb', cmt: '#333', cmtBorder: '#e5e7eb',
  }, [isDark])

  // Comments
  const { data: commentsData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: commentsLoading } =
    useInfiniteQuery<CommentListResponse>({
      queryKey: ['comments', video.video_id],
      queryFn: ({ pageParam }) => getVideoComments(video.video_id, pageParam as number, 20),
      getNextPageParam: (last) => last.has_more ? last.page + 1 : undefined,
      initialPageParam: 1,
    })
  const allComments = commentsData?.pages.flatMap(p => p.comments) || []
  const totalComments = commentsData?.pages[0]?.total ?? video.comment_count ?? 0

  // Video events
  const firstEndFired = useRef(false)
  const watched1sFiredRef = useRef(false)
  const watched5sFiredRef = useRef(false)
  useEffect(() => {
    firstEndFired.current = false
    watched1sFiredRef.current = false
    watched5sFiredRef.current = false
    totalWatchedRef.current = 0
    playStartTimeRef.current = null
  }, [videoSrc])

  // Fire VIDEO_META_CAPTURED on video change
  useEffect(() => {
    if (video && video.video_id) {
      tracking.trackVideoMeta(video)
    }
  }, [video, tracking])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const vid = video.video_id

    const onTime = () => {
      const dur = v.duration || 0
      const ratio = dur > 0 ? v.currentTime / dur : 0
      setProgress(ratio * 100)
      if (!watched1sFiredRef.current && v.currentTime >= 1) {
        watched1sFiredRef.current = true
        tracking.trackVideoWatched1s(vid, { currentTime: v.currentTime, duration: dur, progress: ratio })
      }
      if (!watched5sFiredRef.current && v.currentTime >= 5) {
        watched5sFiredRef.current = true
        tracking.trackVideoWatched5s(vid, { currentTime: v.currentTime, duration: dur, progress: ratio })
      }
    }

    const onPlay = () => {
      setPlaying(true)
      onPlayStateChange?.(true)
      playStartTimeRef.current = v.currentTime
      tracking.trackPlay(vid, { currentTime: v.currentTime, duration: v.duration || 0, playbackRate: v.playbackRate })
    }

    const onPause = () => {
      setPlaying(false)
      onPlayStateChange?.(false)
      if (playStartTimeRef.current !== null) {
        totalWatchedRef.current += Math.abs(v.currentTime - playStartTimeRef.current)
        playStartTimeRef.current = null
      }
      tracking.trackPause(vid, { currentTime: v.currentTime, duration: v.duration || 0, watchedDuration: totalWatchedRef.current })
    }

    const onEnd = () => {
      if (playStartTimeRef.current !== null) {
        totalWatchedRef.current += Math.abs(v.currentTime - playStartTimeRef.current)
        playStartTimeRef.current = null
      }

      if (!firstEndFired.current) {
        firstEndFired.current = true
        onFirstPlayEnd?.()
        const dur = v.duration || 0
        tracking.trackVideoEnded(vid, {
          duration: dur,
          totalWatchedTime: totalWatchedRef.current,
          completionRate: dur ? Math.min(totalWatchedRef.current / dur, 2) : 0,
        })
      }

      v.currentTime = 0
      watched1sFiredRef.current = false
      watched5sFiredRef.current = false
      v.play().catch(() => {})
    }

    const onSeeking = () => { lastSeekFromRef.current = v.currentTime }
    const onSeeked = () => {
      const from = lastSeekFromRef.current
      const to = v.currentTime
      if (from !== null && Math.abs(to - from) > 0.5) {
        tracking.trackSeek(vid, { from, to, seekDistance: to - from, duration: v.duration || 0 })
      }
      lastSeekFromRef.current = null
    }

    const onWaiting = () => {
      tracking.trackBuffering(vid, { currentTime: v.currentTime, readyState: v.readyState, networkState: v.networkState })
    }

    const onVolumeChange = () => {
      tracking.trackVolumeChange(vid, {
        volume: v.volume, previousVolume: v.volume, muted: v.muted, previousMuted: v.muted,
      })
    }

    v.addEventListener('timeupdate', onTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnd)
    v.addEventListener('seeking', onSeeking)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('volumechange', onVolumeChange)

    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnd)
      v.removeEventListener('seeking', onSeeking)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('volumechange', onVolumeChange)
    }
  }, [onPlayStateChange, onFirstPlayEnd, videoSrc, video.video_id, tracking])

  // VIDEO_PROGRESS every 5s while playing
  useEffect(() => {
    if (playing) {
      progressTimerRef.current = setInterval(() => {
        const v = videoRef.current
        if (!v) return
        tracking.trackProgress(video.video_id, {
          currentTime: v.currentTime,
          duration: v.duration || 0,
          progress: v.duration ? v.currentTime / v.duration : 0,
        })
      }, 5000)
    } else if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current) }
  }, [playing, video.video_id, tracking])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }, [])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    v.currentTime = pct * v.duration
  }, [])

  // ============================================================
  // RENDER — faithful to shorts-ui-v2 (6).html
  // ============================================================

  return (
    <div style={{ height: '100vh', background: t.bg, color: t.text, fontFamily: "'Noto Sans KR', -apple-system, sans-serif", overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* ===== TOP NAV ===== */}
      <nav style={{ height: 56, background: t.bg, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0 }}>
        {/* Logo */}
        <div onClick={goToFeed} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: t.text, cursor: 'pointer', flexShrink: 0 }}>
          <img src="/icon.svg" alt="VidRecLab" style={{ width: 28, height: 28, marginRight: 6 }} />
          VidRecLab
        </div>
        {/* Right spacer */}
        <div style={{ marginLeft: 'auto' }} />
      </nav>

      {/* ===== MAIN LAYOUT ===== */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ===== LEFT: Player Section (60%) ===== */}
        <div style={{ flex: '0 0 60%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: '100%' }}>

            {/* Video info — left of player */}
            <div style={{ width: 240, flexShrink: 0, paddingBottom: 24, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {/* Creator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(video.channel_name || 'V'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {(video.channel_name || 'V')[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>@{video.channel_name || video.category || 'Video'}</span>
              </div>
              {/* Title */}
              {video.title && (
                <div style={{ fontSize: 12, color: t.textSec, lineHeight: 1.5, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                  {video.title}
                </div>
              )}
              {/* Tags */}
              {video.tags && (
                <div>
                  {(Array.isArray(video.tags) ? video.tags : String(video.tags).split(',')).slice(0, 5).map((tag, i) => (
                    <span key={i} style={{ fontSize: 11, color: t.textMuted, marginRight: 5 }}>#{String(tag).trim()}</span>
                  ))}
                </div>
              )}
              {/* Music */}
              {video.channel_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, color: t.textMuted }}>
                  <span>♫</span><span>Original audio - {video.channel_name}</span>
                </div>
              )}
            </div>

            {/* Video Player (9:16) */}
            <div style={{ width: 'auto', height: '100%', aspectRatio: '9/16', overflow: 'hidden', position: 'relative', background: '#1a1a1a', borderRadius: 12 }}>
              {/* Actual video */}
              <video ref={videoRef} src={videoSrc} autoPlay playsInline onClick={togglePlay}
                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />

              {/* Player top controls */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 12, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={togglePlay} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      {playing
                        ? <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        : <path d="M8 5v14l11-7z" />}
                    </svg>
                  </button>
                  <button onClick={toggleMute} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      {muted
                        ? <path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />}
                    </svg>
                  </button>
                </div>
              </div>

              {/* Progress bar (very bottom) */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
                <div onClick={handleProgressClick}
                  style={{ padding: '8px 0 0', cursor: 'pointer', pointerEvents: 'auto' }}>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.2)' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: '#5cb8ff' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Side controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingBottom: 24 }}>
              {/* Like */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }} onClick={onLike}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: liked === 'like' ? 'rgba(255,60,60,0.2)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'), display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s, transform 0.15s' }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill={liked === 'like' ? '#ff4444' : t.text}><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>
                </div>
                <span style={{ fontSize: 10, color: t.textSec }}>{formatCount(video.like_count || 0)}</span>
              </div>
              {/* Dislike */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }} onClick={onDislike}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: liked === 'dislike' ? 'rgba(68,136,255,0.2)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill={liked === 'dislike' ? '#4488ff' : t.text}><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" /></svg>
                </div>
                <span style={{ fontSize: 10, color: t.textSec }}>Dislike</span>
              </div>
              {/* Comment count */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill={t.text}><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" /></svg>
                </div>
                <span style={{ fontSize: 10, color: t.textSec }}>{formatCount(totalComments)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Side Panel (40%) ===== */}
        <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: `1px solid ${t.border}` }}>

          {/* --- Recommendations (65%, order:1 = top) --- */}
          <div style={{ flex: '0 0 65%', display: 'flex', flexDirection: 'column', overflow: 'hidden', order: 1, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ padding: '14px 20px 10px 20px', flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Recommended</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px 20px', scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' } as React.CSSProperties}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {relatedData?.videos?.map((rv, idx) => {
                  const thumbBase = rv.resolved_url?.thumbnail_url || rv.thumbnail_url
                  return (
                    <div key={rv.id} onClick={() => onRelatedVideoClick?.(rv, idx)}
                      style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', transition: 'background 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = t.cardHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      {/* Thumbnail (9:16 style) */}
                      <div style={{ aspectRatio: '405/600', borderRadius: 8, overflow: 'hidden', position: 'relative', background: t.thumbBg }}>
                        {thumbBase ? <ThumbImg thumbBase={thumbBase} alt={rv.title || ''} /> : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.12)"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        )}
                        {rv.duration && (
                          <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 9, fontWeight: 500, padding: '1px 3px', borderRadius: 3 }}>
                            {formatDuration(rv.duration)}
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ padding: '6px 4px' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: t.text, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                          {rv.title || 'Untitled'}
                        </div>
                        <div style={{ fontSize: 10, color: t.textTer, marginTop: 2 }}>
                          {rv.view_count ? `${formatCount(rv.view_count)} views` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {(!relatedData?.videos || relatedData.videos.length === 0) && (
                  <div style={{ fontSize: 12, color: t.textMuted, padding: '16px 0', gridColumn: 'span 3' }}>No recommendations</div>
                )}
              </div>
            </div>
          </div>

          {/* --- Comments (35%, order:2 = bottom) --- */}
          <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', overflow: 'hidden', order: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px 20px', flexShrink: 0 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Comments</span>
                <span style={{ fontSize: 12, color: t.textSec, marginLeft: 6 }}>{formatCount(totalComments)}</span>
              </div>
              <button style={{ fontSize: 12, color: t.accent, cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' }}>Sort</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px 20px', scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' } as React.CSSProperties}>
              {commentsLoading && <div style={{ fontSize: 12, color: t.textMuted, padding: '16px 0' }}>Loading comments...</div>}
              {allComments.map(comment => (
                <CmtItem key={comment.id} comment={comment} videoId={video.video_id} />
              ))}
              {hasNextPage && (
                <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                  style={{ width: '100%', padding: '8px 0', textAlign: 'center', color: t.accent, fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {isFetchingNextPage ? 'Loading...' : 'More comments'}
                </button>
              )}
              {!commentsLoading && allComments.length === 0 && (
                <div style={{ fontSize: 12, color: t.textMuted, padding: '16px 0' }}>No comments</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
