/**
 * Survey types — matches backend `app/schemas/survey.py`.
 *
 * Three timing kinds:
 * - `pre`           — forced gate before feed entry (must answer to proceed)
 * - `post`          — shown when experiment.status='completed' and survey is_active
 * - `inter_session` — shown on new SESSION_START asking about the prior session
 *
 * Question types:
 * - `single` — radio, pick exactly one from `answers[]`
 * - `multi`  — checkbox, pick `minSelect`–`maxSelect` (`maxSelect=0` means unlimited)
 * - `text`   — open-ended; user types into a text field
 *
 * Answer `value` (float) is the analyst-defined quantization (Likert 1.0/0.75/...).
 */
export type SurveyKind = 'pre' | 'post' | 'inter_session'
export type QuestionType = 'single' | 'multi' | 'text'

export interface QuestionAnswer {
  id: string
  text: string
  value: number
}

export interface SurveyQuestion {
  id: string
  text: string
  type: QuestionType
  minSelect?: number | null
  maxSelect?: number | null
  answers: QuestionAnswer[]
}

export interface Survey {
  id: string
  experiment_id: string
  kind: SurveyKind
  name: string
  is_active: boolean
  questions: SurveyQuestion[]
  created_at: string
  updated_at: string
  response_count: number
}

export interface SurveyCreateRequest {
  kind: SurveyKind
  name: string
  is_active?: boolean
  questions?: SurveyQuestion[]
}

export interface SurveyUpdateRequest {
  kind?: SurveyKind
  name?: string
  is_active?: boolean
  questions?: SurveyQuestion[]
}

export interface PendingSurvey {
  id: string
  kind: SurveyKind
  name: string
  questions: SurveyQuestion[]
  about_session_id: string | null
  forced: boolean
}

export interface SelectionItem {
  id: string
  text: string
  value: number | null
}

export interface AnswerSubmission {
  questionId: string
  questionText: string
  selections: SelectionItem[]
  textInput: string | null
}

export interface SurveySubmitRequest {
  answers: AnswerSubmission[]
  about_session_id: string | null
}
