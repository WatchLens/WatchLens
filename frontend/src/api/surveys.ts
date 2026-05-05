import client from './client'
import type { PendingSurvey, SurveySubmitRequest } from '@/types'

/**
 * User-facing survey API. Pairs with the dispatcher in
 * `backend/app/api/v1/surveys.py` which decides which survey (if any) to
 * surface based on experiment status, prior responses, and the current
 * session id.
 */

export const getPendingSurvey = async (
  sessionId?: string | null,
): Promise<PendingSurvey | null> => {
  const params = sessionId ? { session_id: sessionId } : undefined
  const response = await client.get<PendingSurvey | null>('/surveys/pending', { params })
  return response.data ?? null
}

export const submitSurveyResponse = async (
  surveyId: string,
  body: SurveySubmitRequest,
): Promise<{ id: string }> => {
  const response = await client.post<{ id: string }>(
    `/surveys/${surveyId}/respond`,
    body,
  )
  return response.data
}
