/**
 * CommentList — production renders the bundled `<CommentSection>`
 * (which fetches via react-query). In mock-data mode (editor preview)
 * we render a lightweight inline list against `MockData.comments` so
 * admins can see comment styling without an API round-trip.
 */
import { useState } from 'react'
import CommentSection from '@/components/video/CommentSection'
import { useMockData } from '@/ui-runtime/data/mockContext'
import type { Comment } from '@/types'
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'


function CommentListBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  const mock = useMockData()
  if (!video) return null
  const defaultExpanded = p<boolean>(node, 'defaultExpanded', false)

  if (mock) {
    return (
      <MockCommentList
        comments={mock.comments ?? []}
        defaultExpanded={defaultExpanded}
      />
    )
  }

  return (
    <CommentSection
      videoId={video.video_id}
      commentCount={video.comment_count}
      defaultExpanded={defaultExpanded}
    />
  )
}


export const CommentListSpec: BlockSpec = {
  type: 'CommentList',
  category: 'data-bound',
  description: 'Comments thread for the bound video.',
  defaultProps: { defaultExpanded: false },
  propSchema: [{ key: 'defaultExpanded', label: 'Default Expanded', type: 'toggle' }],
  Component: CommentListBlock,
}


// ── Mock-mode renderer ─────────────────────────────────────────────


const AVATAR_COLORS = ['#ff4d4f', '#ff7a45', '#ffa940', '#bae637', '#36cfc9', '#40a9ff', '#9254de', '#f759ab']

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}hr ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon}mo ago`
  return `${Math.floor(mon / 12)}yr ago`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface MockProps {
  comments: Comment[]
  defaultExpanded: boolean
}

function MockCommentList({ comments, defaultExpanded }: MockProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const total = comments.length

  // Same UX as CommentSection: header is the toggle target in both
  // states (collapsed shows ▾, expanded shows ▴), so a second click
  // closes what the first opened.
  if (!expanded) {
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-left p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900 text-sm">
              Comments{' '}
              {total > 0 && (
                <span className="text-gray-500 font-normal">{total.toLocaleString()}</span>
              )}
            </span>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="w-full flex items-center justify-between mb-4 text-left hover:bg-gray-100 rounded-md px-2 -mx-2 py-1 transition-colors"
      >
        <h3 className="font-medium text-gray-900 text-sm">
          Comments <span className="text-gray-500 font-normal">{total.toLocaleString()}</span>
        </h3>
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {comments.length === 0 ? (
        <div className="text-gray-500 text-sm py-4">No comments yet</div>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div
                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-semibold"
                style={{ background: avatarColor(c.author_name) }}
              >
                {(c.author_name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-[13px]">{c.author_name}</span>
                  <span className="text-xs text-gray-500">{timeAgo(c.published_at)}</span>
                </div>
                <p className="text-gray-800 mt-0.5 whitespace-pre-line text-sm">{c.text}</p>
                <div className="flex items-center gap-3 mt-1 text-gray-500">
                  <span className="flex items-center gap-1 text-xs">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                      />
                    </svg>
                    {c.like_count > 0 ? formatCount(c.like_count) : ''}
                  </span>
                  {c.reply_count > 0 && (
                    <span className="text-xs text-blue-600 font-medium">
                      {c.reply_count} {c.reply_count === 1 ? 'reply' : 'replies'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
