/**
 * What's new, for teachers: the Help tab's "Latest release notes". Newest
 * first, one entry per day something a teacher can see changed, in plain
 * language (no PR numbers, no internal names). Add a line here in the same PR
 * as the change; the test keeps the list in order.
 */

export type ReleaseNote = { date: string; changes: string[] };

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: "2026-11-22",
    changes: [
      "On step 2 of a new Study Chat, the learning goal box starts empty: write your own, press Draft for DALAA's, or press Tweak and say what to change.",
      "A new Study Chat now starts with \"Show students their progress\" on and students answering by typing or speaking, their choice. Change either on Chat options.",
      "The \"You're still setting up …\" reminder on Activities has a ✕ to dismiss it and \"Remind me tomorrow\".",
      "Results now has one Gradebook, like Canvas's: students down, assignments across. Under each grade it says whether it's in Canvas (✓ In Canvas, Not sent, or Changed, not sent) and if it's disputed. Each column has Send to Canvas. Click a grade to read the chat, change the score or answer a dispute right beside the grid. Disputes no longer have their own view.",
      "When you change a student's score, you can say why: the student sees it with their grade. \"Polish with AI\" tidies your wording, and Undo puts your words back. A student's chat page now has Previous and Next, and on a wide screen the grade stays beside the conversation.",
      "Results → Grades lists your assignments, the latest submissions first, each with how many are graded, being graded and disputed. Open one to see just its students, with Send grades to Canvas there. The Results link on an activity goes straight to its grades.",
      "Search for an assignment on Grades and Insights. Score boxes move by half a point. The Insights score chart now splits low scores into Under 40%, 40s and 50s.",
      "Open any material from Materials to read it the way students do (a PDF as its pages) and to edit its name and text, with a preview beside it. The list shows when each was last edited.",
      "Insights now says when it leaves out test chats from Canvas Student View (\"1 test chat … isn't counted here\"), with a link to Grades, where they still show.",
      "Help now lists the feedback you've sent, under Open and Done, with where each one stands. When one is fixed, it's crossed off.",
      "When you mark up the picture in Feedback, you can draw in red, blue or green, so your note can point at \"the blue box\".",
      "Feedback asks how soon it needs fixing: Urgent, Soon or Can wait. Your feedback in Help shows it, and filters by tab (Activities, Materials, Results, Setup, Help, Other), then by section, type and priority.",
    ],
  },
  {
    date: "2026-11-20",
    changes: [
      "Fixed: in the student chat, a new reply could sit behind the message box at the bottom of the screen, so it looked like nothing came back. The chat now scrolls so the whole reply shows above the box.",
      "You can delete a material or an activity with the trash button on its row. A box asks you to confirm first. A material that a published activity uses can't be deleted until you take it out of that activity. If students have started an activity, you tick a box to delete their chats and grades too. Deleting doesn't change Canvas: remove an assigned activity there as well.",
    ],
  },
  {
    date: "2026-11-18",
    changes: [
      "Release notes fold by day: the newest day is open, and each earlier day opens with a click.",
      "Feedback is now a yellow tab on the right edge of the screen, halfway down, so it no longer covers Next or Send at the bottom.",
      "The \"DALAA wizard\" box on the right of the new-activity steps is gone, so each step has more room. Its tip is now a short line under the step's title; use Draft or Tweak on any box to have DALAA write it.",
    ],
  },
  {
    date: "2026-11-17",
    changes: [
      "Students can speak instead of type: on Chat options, \"How students answer\" is Typing, Speaking or Their choice. Speaking puts what the student said into their message box to check before sending.",
      "Fixed: on Insights, \"Weakest\" marked only the first of several criteria with the same low average, even when every criterion scored the same. Now every tied criterion is marked, and none is when they're all level.",
      "Fixed: when a chat's time limit ran out, students saw \"time's up\" but their chat wasn't handed in. It now ends and is graded right away.",
      "The practice run with an AI student shows the conversation as it happens, then \"Grading it…\", then the grade, instead of a spinner. It stops after 3 minutes of chatting so it always finishes, and if it's cut off you keep what it said so far.",
      "Fixed: after a practice run that didn't finish, another couldn't start for 10 minutes.",
      "A draft reopens on the step you were last on. If you step away mid-setup, the Activities tab shows \"You're still setting up …\" with a link back.",
      "Insights is redesigned: pick an assignment to see how the class did at a glance (how many finished, the average, the weakest criterion, the point most students missed) with charts of the scores, the rubric and the key points. \"Analyze conversations\" now leads with a one-sentence summary and the three biggest takeaways, and takes seconds instead of minutes.",
      "On an assignment's Insights you can ask questions about the class (\"What should I reteach?\", \"Who struggled most, and why?\") and get an answer from the students' conversations, with a link to each student it mentions.",
      "The + Materials menu no longer lists \"Link a Canvas Page\" and \"Link a Canvas File\": those are already in the Materials list, and the menu now just says so.",
      "Fixed: a PDF's text could read as a long line, then one or two words, then a long line, for students. Lines are now rejoined into paragraphs when the PDF is added. A PDF added before this keeps its old line breaks; remove it and add it again to fix it.",
      "The student chat looks like the chat apps students know: a slim header with who they're talking to and how many messages are left, the character's messages beside its initials, their own in bubbles on the right, dots while the reply comes, and one message box with the microphone and a send arrow inside it.",
      "Students see their progress beside the chat, so the conversation comes first: messages left, time left and key points made, each with a bar, plus the minimum and their position. On a phone it's one slim line above the chat. It turns red near the end.",
      "Students now see a PDF reading as its pages, the way you made it (layout, headings, pictures), with \"Show as text\" and \"Open the PDF\" above it. This works for PDFs uploaded or picked from Canvas from today on; one added earlier shows as text until you remove it and add it again.",
      "Fixed: a Canvas course with no term showed its term name in Arabic. It now says \"Default Term\", as Canvas does.",
    ],
  },
  {
    date: "2026-11-16",
    changes: [
      "Creating a Study Chat no longer writes everything for you. After step 2 the AI's role and the grading open empty: write them yourself, or click \"Draft this page with DALAA\". If you've written some boxes, DALAA fills in only the empty ones and keeps to what you wrote.",
      "Every box has its own DALAA button: Draft writes an empty box, and Tweak rewrites a filled one, with room to say what to change (\"shorter\", \"use alien jargon\").",
      "\"About how long?\" moved from step 2 to Chat options, where it sets the message limit.",
      "Review and assign lists anything still empty before you can try or assign the chat.",
    ],
  },
  {
    date: "2026-11-14",
    changes: [
      "Fixed: on step 2, \"Draft the chat\" could stay greyed out after you switched kinds of activity. Goals for other kinds are now written faster, and if one can't be written you can type your own.",
    ],
  },
  {
    date: "2026-11-13",
    changes: [
      "Creating a Study Chat is now six questions. Step 2 suggests the goal and the kind of activity together, based on your reading, from seven clear kinds (Explain, Apply, Argue, Question, Practice a conversation, Connect, Defend their work).",
      "Grading now holds the key points to listen for and how the chat is scored, each with a line on what it does. After the draft, \"Skip to review\" goes straight to the end.",
      "Drafted scenarios are shorter.",
      "Step 2 starts with how students will work with the AI: every kind of activity is shown, each saying what students do and who the AI is. The learning goal comes next and is rewritten for the kind you pick, unless you've written your own.",
      "Chat options has \"Fewest student messages\": students must send at least that many before answering the question or Finish can end the chat, and they see when they've reached it.",
      "In the new-activity wizard, \"Save as draft\" is now \"Save and finish later\" at the top right of each step, away from Next. It saves and takes you back to your activities. Back is on the left and Next on the right.",
      "Chat options explain themselves: \"Students bring their own work\" and \"Show students their progress\" each have a line saying what they do, and \"Question to answer\" is now \"Question that ends the chat\", with a note on how it works.",
      "In the new-activity wizard, click any step in the list on the left to go straight to it. From Scenario onward it saves your changes first (Back does too), and tells you if something still needs filling in.",
      "If saving fails because Student View signed you in as Canvas's Test Student, DALAA now says so and how to sign back in as yourself.",
      "Picking materials for a new activity: search by title or show one kind (Canvas Pages, Uploaded, …), see how many you've ticked, and Next stays at the bottom of the screen instead of below the whole list.",
      "\"About how long?\" now offers 2–5 and 5–10 minutes for very short chats.",
      "The picture sent with feedback shows what you picked in dropdowns, not the default.",
      "The chat's opening message is now on the Scenario step, right under the situation, so you can see and change the first thing students read.",
      "A chat no longer gets stuck on \"Waiting for the reply\": if a reply doesn't finish, students can send again.",
      "\"Try it yourself\" now points to Canvas Assignments, where Student View starts.",
      "A Study Chat is now three short steps for students: Your task (goal, how it works, how it's graded), Read, then Chat. A bar shows where they are, and they can go back to the reading mid-chat without losing anything.",
      "Above the chat, students see how many messages they have left before it ends and, with progress turned on, the key points they've made.",
    ],
  },
  {
    date: "2026-11-12",
    changes: [
      "Class prep brief on Insights: the AI reads every finished conversation and tells you what the class found confusing, what it did well, the questions it asked, and questions to raise in class.",
      "Insights shows which positions the class took and which points it raised, with what students said (names hidden until you click Show names), and the class average on each rubric criterion.",
      "Results has three views: Insights, Grades and Disputes. Click a student's name to read their whole conversation and grade.",
      "Disputes get their own list, oldest first, with your reply and the score in one step.",
      "Search box on the Activities and Materials tabs: type part of a title to filter the list.",
      "New Help tab: give feedback and see what's new.",
      "The DALAA tab is now called Setup.",
      "+ Activity opens a menu of activity types, and copying one from another course is in the same menu.",
      "Switch courses from the course name at the top of the page.",
      "Try an activity as a student two ways: an AI practice run, or yourself in Canvas Student View.",
      "A practice run with a struggling student no longer stops partway through.",
    ],
  },
  {
    date: "2026-11-11",
    changes: [
      "A Results tab for reviewing scores and sending them to Canvas.",
      "Study Chat appears in Canvas's Submission Type list when you create an assignment.",
    ],
  },
  {
    date: "2026-11-09",
    changes: [
      "A new activity wizard: start from your materials, and the AI suggests the goal and the kind of activity.",
      "Edit on every activity opens it in the wizard.",
      "An activity can use several materials.",
      "The Activities tab shows Assigned, Not assigned and Other courses, and copies activities between courses.",
      "Materials: add Word and PowerPoint files and web pages; your Canvas Pages and Files are listed for you.",
      "DALAA looks like Canvas, for you and for students.",
    ],
  },
  {
    date: "2026-11-04",
    changes: ["Students land on their grade when it arrives.", "Chat replies keep their formatting."],
  },
];

/** "November 12, 2026" for a YYYY-MM-DD date, without the reader's time zone moving it a day. */
export function noteDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
