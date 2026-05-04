/**
 * Surface demo — paper Figure 3a candidate + Phase 1 verification UI.
 *
 * Wired into the app at `/dev/surfaces` (feed) and
 * `/dev/surfaces/watch/:videoId` (watch). Reads real data through the data
 * hooks and emits the full event schema through the surface primitives.
 *
 * See `docs/event-schema.md` for the per-event payload contract and
 * `docs/phase1-verification.md` for the click-by-click verification recipe.
 */
import { useNavigate, useParams } from 'react-router-dom'
import { useFeed, useVideo, useRelated, useLikes, useUser } from '../data'
import { FeedSurface, WatchSurface, VideoSurface } from '../surfaces'
import VideoPlayer from '@/components/video/VideoPlayer'

// ── Feed UI written entirely against the public runtime ────────

export function SurfaceDemoFeed(): JSX.Element {
  const navigate = useNavigate()
  const { videos, hasMore, loadMore, exhausted, isLoading } = useFeed({ limit: 12 })
  const user = useUser()

  if (isLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!user.isAuthenticated) return <div style={{ padding: 24 }}>Not signed in</div>

  return (
    <FeedSurface videos={videos}>
      <header style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
        <strong>VidRecLab — Surface demo (Phase 1 verification)</strong>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          user: {user.login_id} · {videos.length} videos · scroll, hover, click to fire events
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: 16 }}>
        {videos.map((v, i) => (
          <VideoSurface
            key={v.id}
            video={v}
            position={i}
            context="feed"
            onClick={() => navigate(`/dev/surfaces/watch/${v.video_id}`)}
          >
            <article style={{ background: '#f9fafb', borderRadius: 8, overflow: 'hidden' }}>
              {v.resolved_url?.thumbnail_url ? (
                <img
                  src={v.resolved_url.thumbnail_url}
                  alt=""
                  style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ aspectRatio: '16/9', background: '#e5e7eb' }} />
              )}
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{v.title || 'Untitled'}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {v.channel_name || v.category} · {v.view_count} views
                </div>
              </div>
            </article>
          </VideoSurface>
        ))}
      </div>

      <div style={{ padding: 16, textAlign: 'center' }}>
        {hasMore && !exhausted && (
          <button onClick={loadMore} style={{ padding: '8px 16px' }}>Load more</button>
        )}
        {exhausted && <span style={{ color: '#666' }}>No more videos.</span>}
      </div>
    </FeedSurface>
  )
}

// ── Watch UI ───────────────────────────────────────────────────

export function SurfaceDemoWatch(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const { video, isLoading } = useVideo(videoId)
  const { videos: related } = useRelated(videoId)
  const likes = useLikes(videoId, { initialCount: video?.like_count })

  if (isLoading || !video) return <div style={{ padding: 24 }}>Loading…</div>

  const isYouTube = video.resolved_url?.type === 'youtube'
  const embedUrl = video.resolved_url?.embed_url
  const playerSrc = video.resolved_url?.video_url

  return (
    <WatchSurface video={video} relatedVideos={related}>
      <header style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={() => navigate('/dev/surfaces')}>← Back to feed</button>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, padding: 16 }}>
        <section>
          <div style={{ aspectRatio: '16/9', background: '#000' }}>
            <VideoSurface video={video} context="watch">
              {(handlers) =>
                isYouTube && embedUrl ? (
                  // YouTube iframes are cross-origin: VideoSurface still
                  // mounts (so the unmount-mid-play synthetic VIDEO_ENDED
                  // path is wired) but the per-frame playback events are
                  // not observable. Card-level events (impression, click,
                  // hover) plus VIDEO_META_CAPTURED + RECOMMENDATIONS still
                  // fire normally.
                  <iframe
                    src={`${embedUrl}?autoplay=0&modestbranding=1`}
                    style={{ width: '100%', height: '100%', border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                  />
                ) : playerSrc ? (
                  <VideoPlayer src={playerSrc} {...handlers} />
                ) : (
                  <div style={{ color: '#fff', padding: 24 }}>No video source</div>
                )
              }
            </VideoSurface>
          </div>

          <h1 style={{ marginTop: 12 }}>{video.title}</h1>
          <p style={{ color: '#666' }}>{video.channel_name || video.category}</p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={likes.like}>
              {likes.isLiked ? '👍 liked' : '👍'} ({likes.count})
            </button>
            <button onClick={likes.dislike}>
              {likes.isDisliked ? '👎 disliked' : '👎'}
            </button>
          </div>
        </section>

        <aside>
          <h2 style={{ fontSize: 16 }}>Recommended</h2>
          {related.map((rv, i) => (
            <VideoSurface
              key={rv.id}
              video={rv}
              position={i}
              context="related"
              onClick={() => navigate(`/dev/surfaces/watch/${rv.video_id}`)}
            >
              <article style={{ display: 'flex', gap: 8, marginBottom: 8, padding: 4 }}>
                {rv.resolved_url?.thumbnail_url && (
                  <img
                    src={rv.resolved_url.thumbnail_url}
                    alt=""
                    style={{ width: 120, aspectRatio: '16/9', objectFit: 'cover' }}
                  />
                )}
                <span style={{ fontSize: 13 }}>{rv.title}</span>
              </article>
            </VideoSurface>
          ))}
        </aside>
      </main>
    </WatchSurface>
  )
}
