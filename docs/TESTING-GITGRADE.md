# Testing Study Chat on gitgrade

A step-by-step check of the whole loop in Nathan's Canvas
(https://gitgrade.opencanvaslms.org), course **DALAA Test** (id 42), against
production (https://dalaa-v1.vercel.app). About 30 minutes, plus 15 for step 9.

If anything looks wrong, use the **Feedback** button (bottom right on every
DALAA page, or Cmd/Ctrl+Shift+F). Click the picture to circle the problem. The
reports show up under DALAA **Settings → Feedback reports**.

## Before you start
- Production `/api/health` says `"db":"up"`.
- The course menu entry is named **Study Chat** (`src/lti/config.ts`).
  Canvas keeps its own copy of the tool config, so after that name changes,
  refresh developer key 10000000000013 (Admin → Developer Keys → edit → re-read
  the JSON from `https://dalaa-v1.vercel.app/api/lti/config` → Save).
- Use a normal browser window. Safari blocks cookies inside the Canvas frame
  more often than Chrome, so try Chrome first and Safari second.

## 1. Teacher: open DALAA from the course
1. In course 42, click **Study Chat** in the course menu.
2. You should land on the course in DALAA, inside the Canvas frame, with the
   tabs **Activities · Materials · Results · DALAA**, and no DALAA
   sidebar (Canvas's menu is the navigation).
3. If you see **Open DALAA in a new tab** instead, the browser blocked the
   cookie in the frame. Click it; DALAA opens in its own tab on the same page.
   Note which browser did this.

## 2. Teacher: sync the class list
1. **DALAA** tab → **Class list** → **Sync with Canvas**.
2. Canvas's people (you as teacher, and the Test Student once Student View has
   been used at least once) show up. Sync adds and flags; it never removes.

## 3. Teacher: create a Study Chat from the Harbor Bikes page (the wizard)
1. **Activities** tab → **+ Activity** → **Study Chat**. The wizard's
   seven steps show on the left; the DALAA wizard note on the right.
2. **Step 1, Materials.** Pick the Canvas page `case-harbor-bikes` from the
   list (the first time, it asks you to **Connect Canvas ↗** in a new tab;
   approve, come back). Add more if you like: readings are seen by students
   and the AI, notes by the AI only. **Next**.
   (Fallback if the connection fails: copy the page text and paste it.)
3. **Step 2, Learning goal.** It opens with a goal suggested from the
   materials. Edit it, set the length, **Next**.
4. **Step 3, Activity type.** The suggested type is marked **Suggested** with
   its reason; two more are cards; the rest are under **More types**. Pick one
   (try **Case Chat**) and **Next**. Drafting takes up to a minute.
5. **Steps 4–6** (Scenario and persona · Chat options · Grading) open on the
   draft. Change something small on one, **Next** each time. Options marked
   **Coming soon** are shown but can't be used yet.
   - Check: the draft matches the case; nothing is blank; nothing invented.
6. **Step 7, Review and assign.** Read the summary (title, type, materials,
   touchpoints, points), **Try it with a sample student** once, then **Publish**
   (or **Assign** when `ASSIGN_TO_CANVAS=1`, which adds the Canvas assignment
   itself; then skip step 4 below). **Save as draft** instead leaves it under
   **Not assigned** on the Activities tab; clicking it there reopens the wizard.

## 4. Teacher: add it to Canvas as an assignment
1. Easiest: in DALAA, **Activities → Not assigned → Assign** (DALAA creates the
   Canvas assignment). Or start in Canvas: **Assignments → + Assignment**,
   Submission type **Study Chat** (once the developer key has the Submission
   Type Selection placement), or **External Tool** → **Find** → **Study Chat**.
2. The DALAA picker opens in Canvas's dialog. Click **Add to Canvas** next to
   the assignment from step 3.
   (Or try "Create a new assignment" there: after Publish you should land back
   on the picker inside the dialog.)
3. Save and publish the Canvas assignment.
   - Check: the gradebook has a column for it, worth the same points as in DALAA.

## 5. Student: launch, chat, finish, dispute
1. In Canvas, **Student View** (course home, right side).
2. Open the assignment. DALAA shows the directions, the case (collapsible),
   then the chat.
3. Chat for a few turns. Replies stream in. If one fails, **Send again** resends the
   same message without costing a turn.
4. **Finish** → **Finish chat** (or let the turn/question limit end it).
5. "Being graded…" shows, then the score with feedback per criterion and the
   quotes it used. Reload after a minute if needed.
   - Check: this is the first real grade on production (`GRADER_MODEL`).
6. **Dispute this grade** → write a reason → **Send to your teacher**.
7. Leave Student View.

## 6. Teacher: resolve and send grades
1. Back in DALAA as teacher, **Results** tab. The disputed grade is marked
   **Disputed**.
2. Type an answer, change the score if you want, **Resolve**.
3. **Send grades to Canvas**. In the clean case it sends in one click. A
   preview only appears for exceptions (lower than Canvas, changed in Canvas,
   points mismatch, students Canvas hasn't launched yet).
4. Read the summary ("Sent 1 grade to Canvas.").

## 7. Check the gradebook
1. Canvas **Grades**: the Test Student has the score that counts (the
   teacher's, if you changed it).
2. Click **Send grades to Canvas** again: "No new grades to send."
3. Change the grade in Canvas by hand, then send again: DALAA reports it as
   changed in Canvas and does not overwrite it.

## 8. Outside Canvas
1. Open https://dalaa-v1.vercel.app/sign-in in a private window.
2. Sign in as the shared test teacher (`TEST_TEACHER_EMAIL` /
   `TEST_TEACHER_PASSWORD` from Vercel env). Test-only: remove before the pilot.
3. **Create account** with a `byu.edu` email works; any other domain is
   refused. A student with no courses sees "Open DALAA once from your Canvas
   course".
4. Signing in with an email that already exists (e.g. after an LTI launch)
   links to that account; it never makes a second one.

## 9. Study Chat depth
Each of these is a quick check on top of steps 3–6. Use a new Study Chat, or
edit the one from step 3 (an edit only changes chats students start after it).

1. **Additional AI instructions.** On create step 2, under the material, add
   **Additional AI instructions (students never see this)**: paste an answer
   key or teaching notes, or pick a Canvas page. You can add or remove them
   later on the review screen.
   - Check (Student View): the instructions appear nowhere on the student's
     page, but the chat clearly follows them (e.g. "never give the NPV
     figure"), and asking the AI to show them doesn't reveal them.
2. **Defend.** Create a Study Chat in **Defend** mode. **Students bring their
   own work** is on and can't be turned off for Defend.
   - Check (Student View): the student first sees **First, add your work**
     (upload a .pdf, .txt or .md up to 4 MB, or paste). It can be added once.
     The AI then questions them about that work, and the grade is on how well
     they understand it.
3. **Try it with a sample student.** On the review screen (draft or
   published), open **Try it with a sample student**, pick **Struggling** or
   **Strong**, **Run it**. Takes up to a minute. The sample conversation and
   the sample grade show side by side.
   - Check: nothing appears on the Grading tab or in Canvas. It uses the last
     *saved* settings, so save edits first.
4. **Touchpoints.** In the review screen's Touchpoints card, turn on **Show
   students their progress** (off by default).
   - Check (Student View): under the chat, "Points covered — 1 of 4" and
     "Your position: …" update after each reply. With it off, nothing shows.
   - Check (teacher, **Results** tab): "Points covered" and "Positions taken"
     for the class ("Cash flow: 1 of 1 students"), and under each student the
     points they covered and their position. The grader still judges from the
     chat itself.

## Who signs in how
- **Teachers.** Open DALAA from the Canvas course first (step 1). That makes
  the account and makes it a teacher of that course. To use the DALAA site
  without Canvas afterwards: **Settings → Sign in without Canvas**, set a
  password, then sign in at `/sign-in` with the account's email and that
  password. A password never makes anyone a teacher; teaching comes from the
  Canvas launch (D-029).
- **The shared test student.** The Canvas user `student@dalaa.test`, enrolled
  as a student in course 42. Its password is `TEST_STUDENT_PASSWORD` in
  `.env.local` (and Vercel). It's the same DALAA account from Canvas or from
  `/sign-in`, once a launch or a **Sync with Canvas** has created it; before
  that, signing in on the site gives a "Test Student" with no courses. It can
  never be a teacher. Test-only: remove before the pilot.
- **The shared test teacher.** `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD`
  (step 8). Test-only.

### What Nathan does in gitgrade first
1. Add `TEST_STUDENT_EMAIL=student@dalaa.test` and a random
   `TEST_STUDENT_PASSWORD` to `.env.local` and to Vercel production + preview,
   then redeploy. Until then the test student login is off.
2. Create the Canvas user `student@dalaa.test` (login ID the same email) and
   enroll them in course 42 as a **Student**.
3. Create Dr. Sampson's Canvas user and enroll them in course 42 as a
   **Teacher**. Their first DALAA launch from the course makes them a teacher
   there; they can then set a password from Settings.

## Fixing reports
After a round of testing, the bug loop (D-030) works through the open
Feedback reports, one fresh pass per report, oldest first, bugs and
confusing ones before ideas.

- **Start:** from the repo, `caffeinate -i ralph/bugs.sh`. It works in its own
  checkout of `main` (`../DALAA_v1-bugs`, made on the first run), so the build
  loop's branch is never touched. It stops by itself when every open report
  has an outcome, after 40 passes, or after 3 failures in a row.
- **Stop:** `touch ralph/STOP` (it stops before the next pass; the build loop
  reads the same file, so delete it afterwards), or Ctrl+C to stop at once.
- **See what's waiting:** `npm run feedback -- list --prod`.
- **Where outcomes show:**
  - The report's page under **Settings → Feedback reports**, in "What the bug
    loop did": the outcome (fixed, won't fix, can't reproduce, needs Nathan,
    in progress), the PR link and a note.
  - Pull requests on GitHub named with the report's short id. Small fixes
    are merged and deployed by the loop; anything bigger (a migration, sign-in,
    LTI, Canvas or grade sending, a new dependency, or over ~200 lines) waits
    as a PR for you.
  - Ideas are never built: each one goes into `docs/IDEAS.md` on a PR for you
    to read.
  - Each pass's log is in `ralph/logs/bugs-*.log`.
- A report left "in progress" with no PR (a pass that crashed) isn't retried;
  record an outcome for it by hand with `npm run feedback -- record`.

## Known gaps (not bugs)
- Teachers can't read a student's chat from the Grading tab yet.
- No extra credit: a teacher score can't exceed the points.
- The new-tab page from step 1.3 is plain on purpose.
