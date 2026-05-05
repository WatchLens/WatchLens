/**
 * Mock-data context for in-editor preview.
 *
 * Visual-mode preview (`<BlockTreeRenderer mock>`) injects mock videos
 * by overriding `RenderEnv.feedVideos` / `relatedVideos` / `pageVideo`.
 * Code-mode preview (`<CompiledUI mock>`) cannot do that — researcher
 * code calls real data hooks (`useFeed`, `useVideo`, `useRelated`,
 * `useComments`) which would otherwise hit the platform API and fail
 * (e.g. when the admin is not assigned to a user group).
 *
 * This context provides a parallel injection point: when present, each
 * hook short-circuits and returns the mock data with the same shape it
 * would have returned from the real API. Production renders mount the
 * compiled component without this provider, so real users see real
 * data; only the in-editor preview opts in.
 */
import { createContext, useContext, type ReactNode } from 'react'
import type { Video, Comment } from '@/types'

export interface MockData {
  feed: Video[]
  related: Video[]
  pageVideo: Video
  comments?: Comment[]
}

export const MockDataContext = createContext<MockData | null>(null)

export function useMockData(): MockData | null {
  return useContext(MockDataContext)
}

interface ProviderProps {
  value: MockData
  children: ReactNode
}

export function MockDataProvider({ value, children }: ProviderProps): JSX.Element {
  return <MockDataContext.Provider value={value}>{children}</MockDataContext.Provider>
}
