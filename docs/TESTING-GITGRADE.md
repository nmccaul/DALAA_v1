# Testing Study Chat on gitgrade

A step-by-step check of the whole loop in Nathan's Canvas
(https://gitgrade.opencanvaslms.org), course **DALAA Test** (id 42), against
production (https://dalaa-v1.vercel.app). About 30 minutes.

If anything looks wrong, use the **Feedback** button (bottom right on every
DALAA page, or Cmd/Ctrl+Shift+F). Click the picture to circle the problem. The
reports show up under DALAA **Settings → Feedback reports**.

## Before you start
- Production `/api/health` says `"db":"up"`.
- Use a normal browser window. Safari blocks cookies inside the Canvas frame
  more often than Chrome, so try Chrome first and Safari second.

## 1. Teacher: open DALAA from the course
1. In course 42, click **DALAA** in the course menu.
2. You should land on the course in DALAA, inside the Canvas frame, with the
   tabs **Assignments · Grading · Students**.
3. If you see **Open DALAA in a new tab** instead, the browser blocked the
   cookie in the frame. Click it; DALAA opens in its own tab on the same page.
   Note which browser did this.

## 2. Teacher: sync the class list
1. **Students** tab → **Sync with Canvas**.
2. Canvas's people (you as teacher, and the Test Student once Student View has
   been used at least once) show up. Sync adds and flags; it never removes.

## 3. Teacher: create a Study Chat from the Harbor Bikes page
1. **Assignments** tab → **Create assignment** → **Study Chat**.
2. **Use a Canvas page or file**. The first time, it asks you to
   **Connect Canvas ↗** in a new tab; approve, come back, then pick the page
   `case-harbor-bikes`.
   (Fallback if the connection fails: copy the page text and paste it.)
3. Pick a mode (try **Case Chat**) or **Suggest for me**. Drafting takes up to
   a minute.
4. Read the summary cards (Goal, Scenario, Positions, Touchpoints, Persona,
   Completion, Grading). Open one, change something small, then **Publish**.
   - Check: the draft matches the case; nothing is blank; nothing invented.

## 4. Teacher: add it to Canvas as an assignment
1. In Canvas: **Assignments → + Assignment**. Submission type **External
   Tool** → **Find** → **DALAA Study Chat**.
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
1. Back in DALAA as teacher, **Grading** tab. The disputed grade is marked
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

## Known gaps (not bugs)
- Teachers can't read a student's chat from the Grading tab yet.
- Due times show in UTC.
- No extra credit: a teacher score can't exceed the points.
- The new-tab page from step 1.3 is plain on purpose.
