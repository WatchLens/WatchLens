/**
 * Wraps the user-facing app and intercepts pending surveys.
 *
 * On mount (and on session_id change after the EventContext finalises one)
 * it polls `GET /surveys/pending`. The backend dispatcher decides which
 * survey — if any — is due, in priority pre → post → inter_session.
 *
 * - `forced=true` (pre-study) renders a full-screen modal that cannot be
 *   dismissed; the user must respond before the wrapped app is mounted.
 * - `forced=false` (post / inter_session) renders the same modal with a
 *   close button; dismissing keeps the app rendered and the modal won't
 *   reappear until the next pending check (next mount / session change).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPendingSurvey, submitSurveyResponse } from '@/api/surveys'
import { useAuth } from '@/contexts/AuthContext'
import { useEvents } from '@/contexts/EventContext'
import type {
  AnswerSubmission,
  PendingSurvey,
  SelectionItem,
  SurveyQuestion,
} from '@/types'

interface SurveyGateProps {
  children: ReactNode
}

export default function SurveyGate({ children }: SurveyGateProps): JSX.Element {
  const { user } = useAuth()
  const { sessionId } = useEvents()
  const queryClient = useQueryClient()

  const enabled = !!user && !user.is_admin
  const [dismissed, setDismissed] = useState(false)

  // Re-fetch pending whenever user or session changes
  const { data: pending } = useQuery({
    queryKey: ['pending-survey', user?.id, sessionId],
    queryFn: () => getPendingSurvey(sessionId ?? null),
    enabled,
    refetchOnWindowFocus: false,
  })

  // Reset dismissal when the survey identity changes (new survey appeared)
  useEffect(() => {
    setDismissed(false)
  }, [pending?.id, pending?.about_session_id])

  const showModal = !!pending && !dismissed

  const handleSubmit = async (answers: AnswerSubmission[]) => {
    if (!pending) return
    await submitSurveyResponse(pending.id, {
      answers,
      about_session_id: pending.about_session_id,
    })
    setDismissed(false)
    queryClient.invalidateQueries({ queryKey: ['pending-survey'] })
  }

  return (
    <>
      {/* For forced (pre) surveys, hide the wrapped app entirely so the
       *  modal is the only interactable surface. For dismissable surveys
       *  the app stays mounted so users can close the modal and continue. */}
      {pending?.forced && !dismissed ? null : children}

      {showModal && (
        <SurveyModal
          survey={pending!}
          onClose={pending!.forced ? null : () => setDismissed(true)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  )
}

interface SurveyModalProps {
  survey: PendingSurvey
  onClose: (() => void) | null
  onSubmit: (answers: AnswerSubmission[]) => Promise<void>
}

interface ResponseState {
  // selections: per-question, set of selected answer ids
  selectedIds: Record<string, Set<string>>
  // textInput: per-question free-form
  textInput: Record<string, string>
}

function SurveyModal({ survey, onClose, onSubmit }: SurveyModalProps): JSX.Element {
  const [state, setState] = useState<ResponseState>({ selectedIds: {}, textInput: {} })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validationError = useMemo(
    () => validate(survey.questions, state),
    [survey.questions, state],
  )

  const toggleSelection = (q: SurveyQuestion, answerId: string) => {
    setState((s) => {
      const cur = new Set(s.selectedIds[q.id] ?? [])
      if (q.type === 'single') {
        cur.clear()
        cur.add(answerId)
      } else if (q.type === 'multi') {
        if (cur.has(answerId)) cur.delete(answerId)
        else {
          const max = q.maxSelect ?? 0
          if (max === 0 || cur.size < max) cur.add(answerId)
        }
      }
      return { ...s, selectedIds: { ...s.selectedIds, [q.id]: cur } }
    })
  }

  const setTextInput = (qid: string, value: string) => {
    setState((s) => ({ ...s, textInput: { ...s.textInput, [qid]: value } }))
  }

  const handleSubmit = async () => {
    if (validationError || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const answers = buildSubmission(survey.questions, state)
      await onSubmit(answers)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{survey.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {survey.kind === 'pre'
                ? 'Please answer to continue.'
                : survey.kind === 'post'
                  ? 'The experiment has ended. We appreciate your feedback.'
                  : 'A short reflection on your previous session.'}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">
          {survey.questions.map((q, qi) => (
            <div key={q.id}>
              <div className="text-sm font-medium text-gray-900 mb-2">
                {qi + 1}. {q.text}
                {q.type === 'multi' && (
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    ({selectionHint(q)})
                  </span>
                )}
              </div>
              {q.type === 'text' ? (
                <textarea
                  value={state.textInput[q.id] ?? ''}
                  onChange={(e) => setTextInput(q.id, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Your answer..."
                />
              ) : (
                <div className="space-y-1.5">
                  {q.answers.map((a) => {
                    const selected = state.selectedIds[q.id]?.has(a.id) ?? false
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleSelection(q, a.id)}
                        className={`w-full text-left px-3 py-2 rounded-md border-2 transition-colors text-sm ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="inline-block w-4 mr-2">{selected ? '●' : '○'}</span>
                        {a.text}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs">
            {validationError && <span className="text-red-600">{validationError}</span>}
            {!validationError && error && <span className="text-red-600">{error}</span>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!!validationError || submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────

function selectionHint(q: SurveyQuestion): string {
  const min = q.minSelect ?? 0
  const max = q.maxSelect ?? 0
  if (max === 0) return min > 0 ? `select at least ${min}` : 'select all that apply'
  if (min === max) return `select ${min}`
  return `select ${min}–${max}`
}

function validate(questions: SurveyQuestion[], state: ResponseState): string | null {
  for (const [i, q] of questions.entries()) {
    if (q.type === 'text') {
      // Free text is not required (researchers can mark forced via min — simpler: allow empty)
      continue
    }
    const sel = state.selectedIds[q.id] ?? new Set()
    if (q.type === 'single') {
      if (sel.size === 0) return `Question ${i + 1}: please select an answer`
    } else {
      const min = q.minSelect ?? 0
      const max = q.maxSelect ?? 0
      if (sel.size < min)
        return `Question ${i + 1}: please select at least ${min}`
      if (max !== 0 && sel.size > max)
        return `Question ${i + 1}: please select at most ${max}`
    }
  }
  return null
}

function buildSubmission(
  questions: SurveyQuestion[],
  state: ResponseState,
): AnswerSubmission[] {
  return questions.map((q) => {
    if (q.type === 'text') {
      return {
        questionId: q.id,
        questionText: q.text,
        selections: [],
        textInput: state.textInput[q.id] ?? '',
      }
    }
    const ids = state.selectedIds[q.id] ?? new Set<string>()
    const selections: SelectionItem[] = q.answers
      .filter((a) => ids.has(a.id))
      .map((a) => ({ id: a.id, text: a.text, value: a.value }))
    return {
      questionId: q.id,
      questionText: q.text,
      selections,
      textInput: null,
    }
  })
}
