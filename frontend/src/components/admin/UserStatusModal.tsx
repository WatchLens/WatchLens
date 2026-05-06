import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUserTrajectory, type TrajectoryResponse, type TrajectoryEvent } from '@/api/admin'

interface Props {
  userId: string
  loginId: string
  onClose: () => void
}

// Show the most recent N days as tabs.
const RECENT_DAYS = 7

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const utcIso = /Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'
  const d = new Date(utcIso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const utcIso = /Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'
  const d = new Date(utcIso)
  return d.toLocaleString()
}

function EventRow({ event }: { event: TrajectoryEvent }) {
  const hasVideo = !!event.video_id
  const ratioTxt = event.watch_ratio != null ? `${Math.round(event.watch_ratio * 100)}%` : ''
  const durTxt = event.watch_duration != null ? `${Math.round(event.watch_duration)}s` : ''
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-100 last:border-0 text-xs">
      <span className="text-gray-400 tabular-nums w-20 flex-shrink-0">{fmtTime(event.timestamp)}</span>
      <span className="font-mono font-medium text-blue-700 w-44 flex-shrink-0 truncate">{event.event_type}</span>
      <div className="flex-1 min-w-0">
        {hasVideo && (
          <div className="text-gray-700 truncate">
            <span className="text-gray-500">{event.video_id}</span>
            {event.video_title && <span className="ml-2 text-gray-800">{event.video_title}</span>}
          </div>
        )}
        {(ratioTxt || durTxt || event.algorithm_feed || event.algorithm_watch || event.position_in_feed != null) && (
          <div className="text-gray-500">
            {ratioTxt && <span className="mr-2">ratio: {ratioTxt}</span>}
            {durTxt && <span className="mr-2">dur: {durTxt}</span>}
            {event.position_in_feed != null && <span className="mr-2">pos: {event.position_in_feed}</span>}
            {event.algorithm_feed && <span className="mr-2">feed: {event.algorithm_feed}</span>}
            {event.algorithm_watch && <span className="mr-2">watch: {event.algorithm_watch}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function DayContent({ data }: { data: TrajectoryResponse }) {
  if (data.sessions.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        No sessions recorded for this date.
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">Sessions</div>
          <div className="text-lg font-semibold text-gray-900">{data.summary.sessions}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">Events</div>
          <div className="text-lg font-semibold text-gray-900">{data.summary.events}</div>
        </div>
      </div>

      <div className="space-y-4">
        {data.sessions.map((s, idx) => (
          <div key={s.session_id} className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-baseline justify-between">
              <span className="text-sm font-medium text-gray-700">Session #{idx + 1}</span>
              <span className="text-xs text-gray-500 tabular-nums">{fmtDate(s.started_at)} · {s.events.length} events</span>
            </div>
            <div className="px-4 py-2 max-h-96 overflow-y-auto">
              {s.events.length === 0 ? (
                <div className="py-3 text-xs text-gray-400 text-center">No events (mouse/scroll noise filtered)</div>
              ) : (
                s.events.map((e, i) => <EventRow key={i} event={e} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function UserStatusModal({ userId, loginId, onClose }: Props): JSX.Element {
  // Build the last RECENT_DAYS dates (UTC, YYYY-MM-DD).
  const dates = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < RECENT_DAYS; i++) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i)
      out.push(d.toISOString().slice(0, 10))
    }
    return out
  }, [])

  const [date, setDate] = useState<string>(dates[0])

  const { data, isLoading, error } = useQuery<TrajectoryResponse>({
    queryKey: ['trajectory', userId, date],
    queryFn: () => getUserTrajectory(userId, date),
    staleTime: 30_000,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-4xl shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{loginId}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Session and event trajectory (mouse/scroll filtered)</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 pt-4 border-b border-gray-200">
          <div className="flex gap-1 flex-wrap">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors tabular-nums ${
                  date === d
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 min-h-[300px] max-h-[70vh] overflow-y-auto">
          {isLoading && <div className="text-sm text-gray-500 text-center py-10">Loading...</div>}
          {error && <div className="text-sm text-red-600 text-center py-10">Error loading trajectory.</div>}
          {data && !isLoading && <DayContent data={data} />}
        </div>
      </div>
    </div>
  )
}
