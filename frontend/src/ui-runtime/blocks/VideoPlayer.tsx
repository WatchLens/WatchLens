/**
 * VideoPlayer — wraps the bundled `<VideoPlayer>` (raw <video>) with a
 * watch-context `<VideoSurface>`. Together they emit the full playback
 * event family (VIDEO_PLAY/PAUSE/SEEK/ENDED/PROGRESS/WATCHED_1S/5S/
 * BUFFERING, PLAYBACK_RATE_CHANGE, VOLUME_CHANGE, FULLSCREEN_CHANGE,
 * KEYBOARD_SHORTCUT) without the block author having to wire handlers.
 *
 * Reads the bound video from env (iter > pageVideo). Only valid on a
 * watch page.
 */
import { VideoSurface } from '@/ui-runtime/surfaces'
import VideoPlayerCmp from '@/components/video/VideoPlayer'
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function VideoPlayerBlock({ node, env }: BlockRenderProps): JSX.Element {
  const video = activeVideo(env)
  if (!video) {
    return (
      <div style={{ padding: 12, color: '#900', fontSize: 12, background: '#fee', borderRadius: 4 }}>
        VideoPlayer: no bound video
      </div>
    )
  }
  if (env.page !== 'watch') {
    return (
      <div style={{ padding: 12, color: '#900', fontSize: 12, background: '#fee', borderRadius: 4 }}>
        VideoPlayer: only valid on a watch page
      </div>
    )
  }

  const aspect = p<string>(node, 'aspect', '16/9')
  const playerSrc = video.resolved_url?.video_url || video.url

  return (
    <div style={{ aspectRatio: aspect, background: '#000', borderRadius: 12, overflow: 'hidden', width: '100%' }}>
      <VideoSurface video={video} context="watch">
        {(handlers) =>
          playerSrc ? (
            <VideoPlayerCmp src={playerSrc} {...handlers} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No video source
            </div>
          )
        }
      </VideoSurface>
    </div>
  )
}

export const VideoPlayerSpec: BlockSpec = {
  type: 'VideoPlayer',
  category: 'data-bound',
  description: 'Inline video player. Only valid on a watch page; emits all playback events.',
  defaultProps: { aspect: '16/9' },
  propSchema: [{ key: 'aspect', label: 'Aspect', type: 'aspect' }],
  Component: VideoPlayerBlock,
}
