# Strategy decisions

*Append; supersede with a new entry rather than rewriting. Product/engineering
decisions are in `../DECISIONS.md` (D-###).*

---

## Made

### S-001 · Position as a suite of focused tools, not an everything-app
*2026-09-28 meeting — Scott, Nathan, Lucy.* Office, not Symphony. Lucy's research:
most education AI platforms (e.g., MagicSchool) are Symphony-like — dozens of
tools that all feel like the same prompt box. Focused, distinct tools are the
differentiator. (Mirrors product decision D-001.)

### S-002 · "Greatest hits" portfolio
*2026-09-28 meeting.* Develop several tools; promote the ones instructors love to
the main menu ("A side"); let others keep experimenting ("B side"). We don't know
yet which ones departments will adopt.

### S-003 · Don't charge for setup
*2026-09-30, Nathan.* Setup is ~2 minutes with the token flow; handling teachers'
tokens for them is a liability. See product decision D-006.

### S-004 · BYU first
*2026-09-30.* Winter 2027 pilot with 3–4 instructors in Scott's department, then
other BYU departments (religion is the named example), before any other school.
The Canvas REST API plan (D-004) is BYU-specific by design.

### S-006 · The product is called DALAA
*2026-10-01, Nathan.* Replaces the working name Volli. Repo and folder renamed to
`DALAA_v1`. Earlier spellings: DALLA (meeting), DAALAA (Scott's repo), DAILA
(Quizzer branch). Domain/trademark check still open (S-006b).

---

## Open

| # | Question | Owner | Notes |
|---|---|---|---|
| S-005 | Revenue model: institutional license, per-department, services (case/activity design, training, seminars), or free at BYU? | Nathan / Scott | Scholarly's strategy chose annual institutional license. Services fit S-003. |
| S-006b | DALAA: domain and trademark check; Scott agrees on the spelling | Nathan | Candidate wordmark: `marketing/brand/2026-09-30-dalaa-teal-parrot-wordmark.png` (still to be tested). |
| S-007 | Relationship between DALAA and Scholarly | Nathan | Merge, keep separate, or fold Scholarly's tools (oral assessment, interactive reading) in as suite tools? |
| S-008 | Who owns what — BYU, Scott, students? IP and commercialization terms | Scott | Needed before charging anyone or pitching outside BYU. |
| S-009 | Which department after Scott's? | Scott / Lucy | Religion (Case Chat with historical figures) was the meeting's example. |
