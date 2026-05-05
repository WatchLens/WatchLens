/**
 * Modal for creating / editing a survey.
 *
 * Layout: a fixed header (kind label, name input, isActive toggle) above
 * a scrollable question editor. Each question card lets the admin pick a
 * type (single / multi / text), edit text, set min/max for multi, and
 * add/edit/remove answers (single/multi only).
 *
 * The kind is fixed at create time and shown read-only on edit. Activating
 * a second survey of the same kind for the experiment is rejected by the
 * backend with 409 → we surface the message inline rather than blocking
 * client-side, so admins always know it's the server's call.
 */
import { useEffect, useMemo, useState } from 'react'
import type {
  QuestionType,
  Survey,
  SurveyCreateRequest,
  SurveyKind,
  SurveyQuestion,
  SurveyUpdateRequest,
  QuestionAnswer,
} from '@/types'

interface SurveyEditorModalProps {
  isOpen: boolean
  onClose: () => void
  /** When set, modal opens in edit mode for this survey. */
  initial?: Survey | null
  /** Default kind when creating; ignored in edit mode. */
  defaultKind?: SurveyKind
  onCreate?: (data: SurveyCreateRequest) => void
  onUpdate?: (id: string, data: SurveyUpdateRequest) => void
  saveError?: string | null
  isSaving?: boolean
}

const KIND_LABEL: Record<SurveyKind, string> = {
  pre: 'Pre-study (forced before feed)',
  post: 'Post-study (after experiment completes)',
  inter_session: 'Inter-session (between sessions)',
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function emptyAnswer(): QuestionAnswer {
  return { id: genId('ans'), text: '', value: 0 }
}

function emptyQuestion(type: QuestionType = 'single'): SurveyQuestion {
  if (type === 'text') {
    return { id: genId('q'), text: '', type: 'text', answers: [] }
  }
  if (type === 'multi') {
    return {
      id: genId('q'),
      text: '',
      type: 'multi',
      minSelect: 1,
      maxSelect: 0,
      answers: [emptyAnswer(), emptyAnswer()],
    }
  }
  return {
    id: genId('q'),
    text: '',
    type: 'single',
    answers: [emptyAnswer(), emptyAnswer()],
  }
}

export default function SurveyEditorModal({
  isOpen,
  onClose,
  initial,
  defaultKind = 'pre',
  onCreate,
  onUpdate,
  saveError,
  isSaving,
}: SurveyEditorModalProps): JSX.Element | null {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SurveyKind>(defaultKind)
  const [isActive, setIsActive] = useState(false)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])

  useEffect(() => {
    if (!isOpen) return
    if (initial) {
      setName(initial.name)
      setKind(initial.kind)
      setIsActive(initial.is_active)
      setQuestions(initial.questions ?? [])
    } else {
      setName('')
      setKind(defaultKind)
      setIsActive(false)
      setQuestions([emptyQuestion('single')])
    }
  }, [isOpen, initial, defaultKind])

  const isEdit = !!initial
  const validationError = useMemo(() => {
    if (!name.trim()) return 'Name is required'
    if (questions.length === 0) return 'At least one question is required'
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) return `Question ${i + 1}: text is required`
      if (q.type === 'text') continue
      if (q.answers.length === 0)
        return `Question ${i + 1}: needs at least one answer`
      for (const [j, a] of q.answers.entries()) {
        if (!a.text.trim())
          return `Question ${i + 1}, Answer ${j + 1}: text is required`
      }
      if (q.type === 'multi') {
        const min = q.minSelect ?? 0
        const max = q.maxSelect ?? 0
        if (min < 0) return `Question ${i + 1}: minSelect must be ≥ 0`
        if (max !== 0 && max < min)
          return `Question ${i + 1}: maxSelect must be ≥ minSelect (or 0 for unlimited)`
      }
    }
    return null
  }, [name, questions])

  const updateQuestion = (idx: number, patch: Partial<SurveyQuestion>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  const setQuestionType = (idx: number, type: QuestionType) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== idx) return q
        if (type === q.type) return q
        if (type === 'text') {
          return { ...q, type: 'text', answers: [], minSelect: null, maxSelect: null }
        }
        const baseAnswers = q.answers.length > 0 ? q.answers : [emptyAnswer(), emptyAnswer()]
        if (type === 'multi') {
          return {
            ...q,
            type: 'multi',
            minSelect: 1,
            maxSelect: 0,
            answers: baseAnswers,
          }
        }
        return { ...q, type: 'single', minSelect: null, maxSelect: null, answers: baseAnswers }
      }),
    )
  }

  const handleSave = () => {
    if (validationError) return
    if (isEdit && initial && onUpdate) {
      onUpdate(initial.id, { name, is_active: isActive, questions })
    } else if (!isEdit && onCreate) {
      onCreate({ kind, name, is_active: isActive, questions })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isEdit ? `Edit survey: ${initial!.name}` : 'New survey'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kind</label>
              {isEdit ? (
                <div className="text-sm text-gray-700">{KIND_LABEL[kind]}</div>
              ) : (
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SurveyKind)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  {(['pre', 'post', 'inter_session'] as SurveyKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Pre-study demographics"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="text-sm">Active (visible to users)</span>
            </label>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm">Questions</h4>
                <div className="flex gap-1">
                  <button
                    onClick={() => setQuestions((qs) => [...qs, emptyQuestion('single')])}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  >
                    + Single
                  </button>
                  <button
                    onClick={() => setQuestions((qs) => [...qs, emptyQuestion('multi')])}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  >
                    + Multi
                  </button>
                  <button
                    onClick={() => setQuestions((qs) => [...qs, emptyQuestion('text')])}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  >
                    + Text
                  </button>
                </div>
              </div>

              {questions.map((q, qi) => (
                <div
                  key={q.id}
                  className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-200"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs text-gray-500 mt-2 w-6">Q{qi + 1}</span>
                    <textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                      placeholder="Question text"
                      rows={2}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm resize-y"
                    />
                    <select
                      value={q.type}
                      onChange={(e) => setQuestionType(qi, e.target.value as QuestionType)}
                      className="px-2 py-1 border border-gray-300 rounded text-xs h-fit"
                    >
                      <option value="single">Single</option>
                      <option value="multi">Multi</option>
                      <option value="text">Text</option>
                    </select>
                    <button
                      onClick={() =>
                        setQuestions((qs) => qs.filter((_, i) => i !== qi))
                      }
                      className="text-red-500 hover:text-red-700 px-2"
                      title="Delete question"
                    >
                      ×
                    </button>
                  </div>

                  {q.type === 'multi' && (
                    <div className="flex items-center gap-3 mb-2 ml-8 text-xs">
                      <label className="flex items-center gap-1">
                        <span>min:</span>
                        <input
                          type="number"
                          min={0}
                          value={q.minSelect ?? 0}
                          onChange={(e) =>
                            updateQuestion(qi, { minSelect: parseInt(e.target.value) || 0 })
                          }
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-center"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span>max:</span>
                        <input
                          type="number"
                          min={0}
                          value={q.maxSelect ?? 0}
                          onChange={(e) =>
                            updateQuestion(qi, { maxSelect: parseInt(e.target.value) || 0 })
                          }
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-center"
                        />
                      </label>
                      <span className="text-gray-400">(0 = unlimited)</span>
                    </div>
                  )}

                  {(q.type === 'single' || q.type === 'multi') && (
                    <div className="ml-8 space-y-1.5">
                      {q.answers.map((a, ai) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={a.text}
                            onChange={(e) => {
                              const newAnswers = [...q.answers]
                              newAnswers[ai] = { ...a, text: e.target.value }
                              updateQuestion(qi, { answers: newAnswers })
                            }}
                            placeholder="Answer text"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                          <input
                            type="number"
                            step={0.05}
                            value={a.value}
                            onChange={(e) => {
                              const newAnswers = [...q.answers]
                              newAnswers[ai] = { ...a, value: parseFloat(e.target.value) || 0 }
                              updateQuestion(qi, { answers: newAnswers })
                            }}
                            placeholder="value"
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                            title="Quantization value (e.g. Likert 1.0/0.75/...)"
                          />
                          <button
                            onClick={() => {
                              const newAnswers = q.answers.filter((_, i) => i !== ai)
                              updateQuestion(qi, { answers: newAnswers })
                            }}
                            className="text-red-400 hover:text-red-600 text-sm"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          updateQuestion(qi, { answers: [...q.answers, emptyAnswer()] })
                        }
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        + Add answer
                      </button>
                    </div>
                  )}

                  {q.type === 'text' && (
                    <div className="ml-8 text-xs text-gray-500 italic">
                      User will type a free-form text response.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs flex-1">
            {validationError && <span className="text-red-600">{validationError}</span>}
            {!validationError && saveError && <span className="text-red-600">{saveError}</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!!validationError || isSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
