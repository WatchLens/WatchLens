import client from './client'
import type { EventBatchCreate, EventBatchResponse, SessionCreate, SessionResponse } from '@/types'

export const sendEventBatch = async (batch: EventBatchCreate): Promise<EventBatchResponse> => {
  const response = await client.post<EventBatchResponse>('/events/batch', batch)
  return response.data
}

export const createSession = async (sessionData: SessionCreate): Promise<SessionResponse> => {
  const response = await client.post<SessionResponse>('/sessions', sessionData)
  return response.data
}
