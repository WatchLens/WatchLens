# Surveys

WatchLens ships a built-in survey system for the three points in a user
study where researchers typically want to capture self-report data:

| Kind | When | Display | Response unit |
|------|------|---------|---------------|
| `pre` | First feed entry. User cannot proceed until they answer | Forced modal | Once per user |
| `post` | After `experiment.status='completed'` and the survey is `is_active` | Dismissable modal | Once per user |
| `inter_session` | New session start, asking about the most recent prior session | Dismissable modal | Once per (user, prior session) |

The three kinds share one schema and one admin tab. The dispatcher in
`backend/app/api/v1/surveys.py` decides which (if any) survey is due at
any moment, and `<SurveyGate>` on the frontend renders it. Researchers
configure surveys per experiment from the admin **Surveys** tab between
**Videos** and **Stats**.

Playback events stay clean — surveys never fire mid-watch and never wrap
the player. Only navigation surfaces (`/`, `/watch/:id`) host the gate.

## Data model

Two tables, added in migration `020_surveys`.

### `surveys`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `experiment_id` | UUID | FK, cascade delete |
| `kind` | varchar(20) | `'pre' \| 'post' \| 'inter_session'` |
| `name` | varchar(255) | Admin-facing label |
| `is_active` | bool | Visibility flag |
| `questions` | JSONB | See [question shape](#question-shape) |
| `created_at` / `updated_at` | timestamp | |

Partial unique index `uq_surveys_one_active_per_kind`:
`(experiment_id, kind) WHERE is_active=true`. The DB enforces "at most
one active survey per kind per experiment" so admins cannot accidentally
expose conflicting surveys. Drafts (multiple `is_active=false` rows) are
allowed.

### `survey_responses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `survey_id` | UUID | FK, cascade |
| `user_id` | UUID | FK, cascade |
| `about_session_id` | UUID nullable | FK `sessions.id`, set null on delete |
| `answers` | JSONB | See [answer shape](#answer-shape) |
| `created_at` | timestamp | |

`about_session_id` is `NULL` for `pre` / `post` responses and the prior
session's id for `inter_session`. Two partial unique indexes prevent
duplicate submissions in either case:

- `uq_responses_pre_post`: `(survey_id, user_id) WHERE about_session_id IS NULL`
- `uq_responses_inter_session`: `(survey_id, user_id, about_session_id) WHERE about_session_id IS NOT NULL`

A duplicate insert raises `IntegrityError`; the API surfaces this as
HTTP 409 so the frontend can quietly drop the modal.

## Question shape

```json
{
  "id": "q1",
  "text": "How many hours of video do you watch daily?",
  "type": "single",
  "minSelect": null,
  "maxSelect": null,
  "answers": [
    {"id": "a1", "text": "Less than 1 hour", "value": 1},
    {"id": "a2", "text": "1-3 hours",        "value": 2},
    {"id": "a3", "text": "More than 3 hours","value": 3}
  ]
}
```

Three question types:

- **`single`** — radio. `answers ≥ 1` is required; `minSelect` /
  `maxSelect` are ignored.
- **`multi`** — checkbox. `answers ≥ 1` and both `minSelect` and
  `maxSelect` are required. `maxSelect = 0` means "no upper bound" (i.e.
  "select all that apply").
- **`text`** — open-ended. `answers` must be empty; the user types into
  a textarea.

`value: float` is the analyst-defined quantization for downstream
analysis — Likert scales (`1.0 / 0.75 / 0.5 / 0.25`) and ordinal codes
fit naturally; nominal categories can leave it `0`.

The Pydantic validator (`schemas/survey.py:Question._shape`) rejects
inconsistent shapes (a `text` question with answers, a `multi` without
`min`/`max`, etc.) so admin saves never silently produce a broken survey.

## Answer shape

```json
{
  "questionId": "q1",
  "questionText": "How many hours of video do you watch daily?",
  "selections": [{"id": "a2", "text": "1-3 hours", "value": 2}],
  "textInput": null
}
```

`questionText` is a snapshot of the question's text at submission time.
Admins can rename questions later without invalidating older responses —
the CSV export and any downstream analysis sees the wording the user
actually saw.

For `text` responses, `selections` is `[]` and `textInput` carries the
user's free-form answer. For `single` / `multi`, `textInput` is `null`.

## Dispatcher priority

`GET /api/v1/surveys/pending?session_id=<uuid>` returns at most one
survey, decided in this order:

1. **Pre** — active `pre` survey exists and the user has no response →
   return with `forced: true`.
2. **Post** — `experiment.status === 'completed'`, active `post` survey
   exists, user has no response → return with `forced: false`.
3. **Inter-session** — active `inter_session` survey exists. Find the
   user's most recent session that is *not* the current one
   (`session_id` query param). If a prior session exists and the user
   has not yet responded for that `about_session_id`, return with
   `forced: false` and `about_session_id` set.

The priority matters: a user is never asked to juggle two modals at
once, and pre-study (the only one that ever blocks the feed) wins.

## Frontend dispatch

`<SurveyGate>` (`components/SurveyGate.tsx`) wraps `Feed` and
`VideoWatch` in `App.tsx`. It runs `useQuery(['pending-survey', userId,
sessionId])` and renders accordingly:

- `pending.forced === true` (pre-study): the wrapped page is *not*
  mounted; only the modal is visible. The user must submit to proceed.
- `pending.forced === false` (post / inter-session): the page mounts
  underneath; the modal has a close button. Dismissing keeps it hidden
  until the next pending check (next session or new survey).

Submitting a response invalidates the `pending-survey` query, which
causes the dispatcher to re-evaluate — typically returning `null` and
clearing the gate.

## Admin authoring

The **Surveys** tab in `pages/admin/ExperimentDetail.tsx` lists the
experiment's surveys grouped by kind. Each row shows:

- Name + question count + response count
- `is_active` toggle (server-side checks the unique index; conflicting
  activations return 409 inline)
- Edit / CSV export / Delete buttons

`SurveyEditorModal` (`components/admin/SurveyEditorModal.tsx`) supports:

- Selecting `kind` at creation (read-only on edit)
- Toggling `is_active`
- Adding `single` / `multi` / `text` questions
- For each `single` / `multi`: editing answers (text + value)
- For `multi`: setting `min`/`max` (`max=0` for unlimited)

Validation blocks save with an inline message until the survey shape is
self-consistent.

## CSV export

`GET /api/v1/admin/surveys/{id}/responses/csv` streams responses,
flattened to one row per `(response, question)`:

```csv
response_id,user_login_id,about_session_id,created_at,question_id,question_text,selections,text_input
<uuid>,user001,,2026-05-05T07:18:32,q1,Pick one,"[{""id"": ""a2"", ""text"": ""B"", ""value"": 1.0}]",
<uuid>,user001,,2026-05-05T07:18:32,q2,Pick multi,"[{""id"": ""b1""...}]",
```

Selections are JSON-encoded with their `value`s preserved so the
analyst can ingest the file directly into pandas / R without joining
back to the survey definition. Question text comes from the *response's*
snapshot, not the current survey definition.

## Adding a survey programmatically

You can seed surveys from a migration or fixture script if you want a
reusable demographics block across experiments:

```python
from app.models.survey import Survey

Survey.__table__.insert().values(
    experiment_id=exp_id,
    kind="pre",
    name="Pre-study demographics",
    is_active=True,
    questions=[
        {
            "id": "q-age",
            "text": "Age range?",
            "type": "single",
            "answers": [
                {"id": "a-18-24", "text": "18-24", "value": 1},
                {"id": "a-25-34", "text": "25-34", "value": 2},
                {"id": "a-35-44", "text": "35-44", "value": 3},
                {"id": "a-45-plus", "text": "45+", "value": 4},
            ],
        },
        {
            "id": "q-hours",
            "text": "Daily video hours?",
            "type": "text",
            "answers": [],
        },
    ],
)
```

The same Pydantic shape validation runs when admins POST through the
admin UI; bypassing it via raw insert means the Survey model trusts the
JSON to be well-formed. Seed scripts should mirror the validator's
rules.

## Limitations / out of scope

- **No conditional questions.** Informfully's `selectionsFrom` /
  `withAtLeast` ("ask Q4 only if user picked ≥2 in Q3") is intentionally
  not implemented — it adds a small dependency-graph runtime that
  outweighs the value for the case studies WatchLens targets. If
  needed, fork the editor modal and the frontend dispatcher.
- **No per-video like-survey.** Informfully ties `articleLikes` to a
  question id so each like carries a "why?" reason. WatchLens keeps the
  binary `LIKE` / `DISLIKE` events; reason capture lives in the
  separate survey kinds (typically post-study).
- **Inter-session boundary is sessionStorage-scoped.** A new session
  fires when the frontend's `sessionStorage` is cleared (tab close, new
  tab, logout). A user who keeps a tab open for days will not trigger
  inter-session prompts — see
  [`event-schema.md`](./event-schema.md#session-lifecycle) for the
  exact session lifecycle.
- **No response edit.** Users can't change a submitted response; the
  unique indexes block re-submission. Admins can delete a response row
  via SQL if the study protocol allows.
