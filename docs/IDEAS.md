# Ideas from feedback (D-030: written down, never built by the bug loop)

- **2026-10-29 · `a6cfe3c8`**: Make the teacher's activity page more of an onboarding flow, with clear stopping points and an obvious "tweak" button. *Opinion:* fits product rule 1. Worth folding into the getting-started checklist (#95) rather than reworking the activity page.
- **2026-10-29 · `782628a4`**: Make the "Read first" material render better for students. *Opinion:* yes. Uploaded .md and PDF text shows as raw text. The inline formatter from PR #114 could cover headings, bold and paragraphs here cheaply.
- **2026-10-29 · `53f16801`**: When a student finishes, show a clear "you're done" message, or send them back to Canvas automatically. *Opinion:* a clear done state plus a "Back to Canvas" button is safer than closing the tool automatically, since students still need to see their grade.
- **2026-10-29 · `7215a7e3`**: Let students pick a category when disputing a grade (ambiguous question, typo, too strict, other). *Opinion:* cheap and gives teachers a sortable reason. It needs a column on disputes (migration), so it belongs with v2 "Review workflow and disputes" (#58).
- **2026-10-30 · `12c091c2`**: "Draft it" reads as "let the AI draft it". Swap the order of "Suggest for me" and "Draft it", keeping "Draft it" as the primary button. *Opinion:* agree. It's a two-line change once Nathan approves the wording.
- **2026-10-30 · `c6b6086c`** (part of a bug report): When material has little text (a music score, an image), ask the teacher what students should do with it instead of failing. *Opinion:* good fallback. The failure she hit was the schema bug (PR #113), but low-text files will still draft poorly.
- **2026-10-29 · `cdc2b58a`** (part of a confusing report): Collapsible sections for each rubric category in the student's grade. *Opinion:* the scroll fix (PR #115) covers the main complaint. Try collapsing only if grades get long.

## From the creation wizard (D-034, 2026-11-09)

Shown in the wizard as disabled "Coming soon" until built:

- **Wizard chat panel and one-click edits**: the "DALAA wizard" side panel takes typed requests ("make the persona tougher") and offers one-click edits to the current step. This run shows only notes built from stored data.
- **Hints**: students can ask for a hint during the chat.
- **Reading beside the chat**: the reading stays open next to the conversation.
- **Minimum exchanges**: a floor on student turns before the activity can finish.
- **Criterion-by-criterion feedback**: feedback shown per rubric criterion, not only overall.
- **Allowed attempts** and **score to keep** (best, latest, average).
- **Activity group**: group activities inside a course.
- **Start from a copy** inside the wizard (copying already works from the Activities tab).
- **Saved rubrics / "Use a saved rubric"**.
- **"Redraft with AI"** on the grading step.
- **Case Writer**: write a new case with the AI as a material.

## From the Help tab (D-032, 2026-11-12)

- **Ask the DALAA wizard**: on the Help tab, a teacher asks the AI how to do something in DALAA and gets an answer for their course. Shown as a Preview until built. *Opinion:* worth it only if it answers from our own help text and the course's real state; a generic chatbot will give wrong directions.

## From Nathan (2026-11-12)

- **Search on Activities and Materials**: a search box at the top left of each tab, across from "+ Activity" / "+ Materials", like Canvas's "Search for Quiz" on its Quizzes page. Typing filters the list as you go, by title. *Opinion:* cheap, since both lists are already on the page, so it can filter in the browser with no new query. It matters once a course has more than a screenful. On Activities it should search the current view (Assigned, Not assigned, Other courses).
