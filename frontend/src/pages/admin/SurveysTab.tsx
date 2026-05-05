/**
 * Surveys tab in ExperimentDetail. Lists all surveys for the experiment
 * grouped by kind (pre / post / inter_session), with toggle to flip
 * `is_active` and a button to open the editor modal for a row.
 *
 * Backend rejects activating a second survey of the same kind with HTTP
 * 409 — we surface that as an inline error rather than blocking
 * client-side so admins always know the constraint comes from the server.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSurvey,
  deleteSurvey,
  downloadSurveyResponsesCSV,
  getSurveys,
  updateSurvey,
} from '@/api/admin'
import type { Survey, SurveyCreateRequest, SurveyKind, SurveyUpdateRequest } from '@/types'
import SurveyEditorModal from '@/components/admin/SurveyEditorModal'

interface SurveysTabProps {
  experimentId: string
}

const KIND_LABEL: Record<SurveyKind, string> = {
  pre: 'Pre-study',
  post: 'Post-study',
  inter_session: 'Inter-session',
}

const KIND_DESCRIPTION: Record<SurveyKind, string> = {
  pre: 'Forced before feed entry. User must answer to proceed.',
  post: 'Shown after experiment status is set to "completed". Dismissable.',
  inter_session: 'Asks about the prior session on a new session start. Dismissable.',
}

export default function SurveysTab({ experimentId }: SurveysTabProps): JSX.Element {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Survey | null>(null)
  const [creatingKind, setCreatingKind] = useState<SurveyKind | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: surveys = [], isLoading } = useQuery({
    queryKey: ['surveys', experimentId],
    queryFn: () => getSurveys(experimentId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['surveys', experimentId] })
  }

  const createMutation = useMutation({
    mutationFn: (data: SurveyCreateRequest) => createSurvey(experimentId, data),
    onSuccess: () => {
      invalidate()
      setCreatingKind(null)
      setSaveError(null)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setSaveError(e.response?.data?.detail || 'Failed to create')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SurveyUpdateRequest }) =>
      updateSurvey(id, data),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setSaveError(null)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setSaveError(e.response?.data?.detail || 'Failed to update')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSurvey,
    onSuccess: invalidate,
  })

  const toggleActive = (survey: Survey) => {
    updateMutation.mutate({
      id: survey.id,
      data: { is_active: !survey.is_active },
    })
  }

  const renderKindSection = (kind: SurveyKind) => {
    const list = surveys.filter((s) => s.kind === kind)
    return (
      <div key={kind} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{KIND_LABEL[kind]}</h3>
            <p className="text-xs text-gray-500">{KIND_DESCRIPTION[kind]}</p>
          </div>
          <button
            onClick={() => {
              setCreatingKind(kind)
              setSaveError(null)
            }}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
          >
            + New
          </button>
        </div>

        {list.length === 0 ? (
          <div className="bg-gray-50 rounded-md p-4 text-center text-xs text-gray-400">
            No {KIND_LABEL[kind]} surveys yet.
          </div>
        ) : (
          <div className="bg-white rounded-md border border-gray-200 divide-y divide-gray-200">
            {list.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.questions.length} questions · {s.response_count} responses
                  </div>
                </div>

                {/* Active toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.is_active}
                    onChange={() => toggleActive(s)}
                    className="sr-only peer"
                  />
                  <div className="relative w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors">
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        s.is_active ? 'translate-x-4' : ''
                      }`}
                    />
                  </div>
                  <span className="text-xs text-gray-600">{s.is_active ? 'Active' : 'Draft'}</span>
                </label>

                <button
                  onClick={() => {
                    setEditing(s)
                    setSaveError(null)
                  }}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => downloadSurveyResponsesCSV(s.id)}
                  disabled={s.response_count === 0}
                  className="text-gray-600 hover:text-gray-800 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  CSV
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Delete survey "${s.name}"? ${s.response_count} responses will be removed.`,
                      )
                    ) {
                      deleteMutation.mutate(s.id)
                    }
                  }}
                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading surveys...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Surveys</h2>
        <p className="text-xs text-gray-500">
          One active survey per kind. Backend enforces.
        </p>
      </div>

      {(['pre', 'inter_session', 'post'] as SurveyKind[]).map(renderKindSection)}

      <SurveyEditorModal
        isOpen={editing !== null || creatingKind !== null}
        onClose={() => {
          setEditing(null)
          setCreatingKind(null)
          setSaveError(null)
        }}
        initial={editing}
        defaultKind={creatingKind ?? 'pre'}
        onCreate={(data) => createMutation.mutate(data)}
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        saveError={saveError}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  )
}
