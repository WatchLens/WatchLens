import client from './client'
import type {
  Experiment,
  ExperimentsListResponse,
  ExperimentCreateRequest,
  ExperimentUpdateRequest,
  UserGroup,
  UserGroupCreateRequest,
  UserGroupUpdateRequest,
  UsersListResponse,
  UserBulkCreateRequest,
  UserBulkCreateResponse,
  VideoListResponse,
  VideoUploadResponse,
  StatsResponse,
  UITemplate,
  UITemplateListItem,
  UITemplateCreateRequest,
  UITemplateUpdateRequest,
  RecBoleStatus,
  RecBoleModelInfo,
  TrainingRun,
  TrainingRunCreateRequest,
  TrainingRunListResponse,
  RecBoleCoverage,
} from '@/types'

// Experiments
export const getExperiments = async (): Promise<ExperimentsListResponse> => {
  const response = await client.get<ExperimentsListResponse>('/admin/experiments')
  return response.data
}

export const getExperiment = async (id: number | string): Promise<Experiment> => {
  const response = await client.get<Experiment>(`/admin/experiments/${id}`)
  return response.data
}

export const createExperiment = async (data: ExperimentCreateRequest): Promise<Experiment> => {
  const response = await client.post<Experiment>('/admin/experiments', data)
  return response.data
}

export const updateExperiment = async (
  id: number | string,
  data: ExperimentUpdateRequest
): Promise<Experiment> => {
  const response = await client.put<Experiment>(`/admin/experiments/${id}`, data)
  return response.data
}

export const deleteExperiment = async (id: number | string): Promise<void> => {
  await client.delete(`/admin/experiments/${id}`)
}

// User Groups
export const getUserGroups = async (experimentId: number | string): Promise<UserGroup[]> => {
  const response = await client.get<UserGroup[]>(`/admin/experiments/${experimentId}/user-groups`)
  return response.data
}

export const createUserGroup = async (
  experimentId: number | string,
  data: UserGroupCreateRequest
): Promise<UserGroup> => {
  const response = await client.post<UserGroup>(
    `/admin/experiments/${experimentId}/user-groups`,
    data
  )
  return response.data
}

export const updateUserGroup = async (
  groupId: number | string,
  data: UserGroupUpdateRequest
): Promise<UserGroup> => {
  const response = await client.put<UserGroup>(`/admin/user-groups/${groupId}`, data)
  return response.data
}

export const deleteUserGroup = async (groupId: number | string): Promise<void> => {
  await client.delete(`/admin/user-groups/${groupId}`)
}

// Users
export const getUsers = async (experimentId: number | string): Promise<UsersListResponse> => {
  const response = await client.get<UsersListResponse>(`/admin/experiments/${experimentId}/users`)
  return response.data
}

export const bulkCreateUsers = async (
  experimentId: number | string,
  data: UserBulkCreateRequest
): Promise<UserBulkCreateResponse> => {
  const response = await client.post<UserBulkCreateResponse>(
    `/admin/experiments/${experimentId}/users/bulk`,
    data
  )
  return response.data
}

export const downloadUsersCSV = (experimentId: number | string): void => {
  window.open(`/api/v1/admin/experiments/${experimentId}/users/csv`, '_blank')
}

export const deleteUser = async (userId: number | string): Promise<void> => {
  await client.delete(`/admin/users/${userId}`)
}

// Videos
export const getVideos = async (
  experimentId: number | string,
  page: number = 1,
  limit: number = 100
): Promise<VideoListResponse> => {
  const response = await client.get<VideoListResponse>(
    `/admin/experiments/${experimentId}/videos`,
    { params: { page, limit } }
  )
  return response.data
}

export const uploadVideosCSV = async (
  experimentId: number | string,
  file: File
): Promise<VideoUploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await client.post<VideoUploadResponse>(
    `/admin/experiments/${experimentId}/videos/csv`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  return response.data
}

export const deleteVideo = async (videoId: number | string): Promise<void> => {
  await client.delete(`/admin/videos/${videoId}`)
}

export const bulkDeleteVideos = async (videoIds: string[]): Promise<{ deleted: number }> => {
  const response = await client.post<{ deleted: number }>('/admin/videos/bulk-delete', {
    video_ids: videoIds,
  })
  return response.data
}

// Stats
export const getExperimentStats = async (experimentId: number | string): Promise<StatsResponse> => {
  const response = await client.get<StatsResponse>(`/admin/experiments/${experimentId}/stats`)
  return response.data
}

export const getRecommendationEvaluation = async (experimentId: string) => {
  const response = await client.get(
    `/admin/experiments/${experimentId}/stats/evaluation`,
  )
  return response.data
}

export const getUserStats = async (experimentId: string) => {
  const response = await client.get(`/admin/experiments/${experimentId}/stats/users`)
  return response.data
}

export interface TrajectoryEvent {
  event_type: string
  timestamp: string | null
  client_timestamp: string | null
  video_id: string | null
  video_title: string | null
  watch_ratio: number | null
  watch_duration: number | null
  position_in_feed: number | null
  algorithm_feed: string | null
  algorithm_watch: string | null
}

export interface TrajectorySession {
  session_id: string
  started_at: string | null
  events: TrajectoryEvent[]
}

export interface TrajectoryResponse {
  date: string
  summary: {
    sessions: number
    events: number
  }
  window: { start: string; end: string } | null
  sessions: TrajectorySession[]
}

export const getUserTrajectory = async (userId: string, date: string): Promise<TrajectoryResponse> => {
  const response = await client.get<TrajectoryResponse>(
    `/admin/users/${userId}/trajectory`,
    { params: { date } },
  )
  return response.data
}

export const downloadEventsCSV = (experimentId: number | string): void => {
  window.open(`/api/v1/admin/experiments/${experimentId}/events/csv`, '_blank')
}

// UI Templates
export const getUITemplates = async (
  status?: string,
  device?: string,
): Promise<UITemplateListItem[]> => {
  const params: Record<string, string> = {}
  if (status) params.status = status
  if (device) params.device = device
  const response = await client.get<UITemplateListItem[]>('/admin/ui-templates', { params })
  return response.data
}

export const getUITemplate = async (id: string): Promise<UITemplate> => {
  const response = await client.get<UITemplate>(`/admin/ui-templates/${id}`)
  return response.data
}

export const createUITemplate = async (data: UITemplateCreateRequest): Promise<UITemplate> => {
  const response = await client.post<UITemplate>('/admin/ui-templates', data)
  return response.data
}

export const updateUITemplate = async (
  id: string,
  data: UITemplateUpdateRequest
): Promise<UITemplate> => {
  const response = await client.put<UITemplate>(`/admin/ui-templates/${id}`, data)
  return response.data
}

export const deleteUITemplate = async (id: string): Promise<void> => {
  await client.delete(`/admin/ui-templates/${id}`)
}

export const duplicateUITemplate = async (id: string): Promise<UITemplate> => {
  const response = await client.post<UITemplate>(`/admin/ui-templates/${id}/duplicate`)
  return response.data
}

// RecBole Training
export const getRecBoleStatus = async (): Promise<RecBoleStatus> => {
  const response = await client.get<RecBoleStatus>('/admin/recbole/status')
  return response.data
}

export const getRecBoleModels = async (): Promise<RecBoleModelInfo[]> => {
  const response = await client.get<RecBoleModelInfo[]>('/admin/recbole/models')
  return response.data
}

export const startTrainingRun = async (
  experimentId: string,
  data: TrainingRunCreateRequest
): Promise<TrainingRun> => {
  const response = await client.post<TrainingRun>(
    `/admin/experiments/${experimentId}/training/runs`,
    data
  )
  return response.data
}

export const getTrainingRuns = async (experimentId: string): Promise<TrainingRunListResponse> => {
  const response = await client.get<TrainingRunListResponse>(
    `/admin/experiments/${experimentId}/training/runs`
  )
  return response.data
}

export const getTrainingRun = async (
  experimentId: string,
  runId: string
): Promise<TrainingRun> => {
  const response = await client.get<TrainingRun>(
    `/admin/experiments/${experimentId}/training/runs/${runId}`
  )
  return response.data
}

export const getRecBoleCoverage = async (experimentId: string): Promise<RecBoleCoverage> => {
  const response = await client.get<RecBoleCoverage>(
    `/admin/experiments/${experimentId}/training/coverage`
  )
  return response.data
}

export const importRecGraph = async (experimentId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await client.post(
    `/admin/experiments/${experimentId}/training/import-rec-graph`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return response.data
}

export const getFallbackStats = async (experimentId: string) => {
  const response = await client.get(
    `/admin/experiments/${experimentId}/training/fallback-stats`
  )
  return response.data
}

export const clearRecBoleCache = async (experimentId: string): Promise<void> => {
  await client.delete(`/admin/experiments/${experimentId}/training/cache`)
}

// Public UI Template (for user-facing pages)
export const getPublicUITemplate = async (id: string): Promise<UITemplate> => {
  const response = await client.get<UITemplate>(`/ui-templates/${id}`)
  return response.data
}

// Recommender registry (admin UI dropdown source)
import type { RecommenderInfo } from '@/types/experiment'

export const getRecommenders = async (): Promise<RecommenderInfo[]> => {
  const response = await client.get<RecommenderInfo[]>('/admin/recommenders')
  return response.data
}

// ── Surveys ────────────────────────────────────────────────────────
import type { Survey, SurveyCreateRequest, SurveyUpdateRequest } from '@/types'

export const getSurveys = async (experimentId: string): Promise<Survey[]> => {
  const response = await client.get<Survey[]>(`/admin/experiments/${experimentId}/surveys`)
  return response.data
}

export const createSurvey = async (
  experimentId: string,
  data: SurveyCreateRequest,
): Promise<Survey> => {
  const response = await client.post<Survey>(
    `/admin/experiments/${experimentId}/surveys`,
    data,
  )
  return response.data
}

export const updateSurvey = async (
  surveyId: string,
  data: SurveyUpdateRequest,
): Promise<Survey> => {
  const response = await client.patch<Survey>(`/admin/surveys/${surveyId}`, data)
  return response.data
}

export const deleteSurvey = async (surveyId: string): Promise<void> => {
  await client.delete(`/admin/surveys/${surveyId}`)
}

export const downloadSurveyResponsesCSV = (surveyId: string): void => {
  window.open(`/api/v1/admin/surveys/${surveyId}/responses/csv`, '_blank')
}
