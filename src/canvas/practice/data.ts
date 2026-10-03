/**
 * Practice Canvas data: a made-up teacher with three made-up courses, shaped
 * exactly like Canvas's JSON. Deterministic, so tests and demos see the same
 * people every time. Includes the awkward cases real BYU courses have:
 * a cross-listed section, a dropped (concluded) student, an inactive one, a
 * student in two sections, one with no NetID visible, and a course big enough
 * to need several pages.
 */

import type { CanvasCourse, CanvasEnrollment, CanvasSection, CanvasUser } from "../client";

export const PRACTICE_TEACHER: CanvasUser = { id: 9001, name: "Practice Professor" };

const FIRST = ["Avery", "Brooklyn", "Carter", "Dallin", "Eliza", "Finn", "Gracie", "Hyrum", "Ivy", "Jonah",
  "Kenzie", "Landon", "Mia", "Nephi", "Olivia", "Parker", "Quinn", "Rosie", "Spencer", "Tess", "Ulises",
  "Violet", "Wyatt", "Ximena", "Yusuf", "Zoe"];
const LAST = ["Anderson", "Bennett", "Christensen", "Davis", "Erickson", "Fonua", "Garcia", "Hansen",
  "Iverson", "Jensen", "Kim", "Larsen", "Martinez", "Nielsen", "Olsen", "Peterson", "Quispe", "Rasmussen",
  "Smith", "Tanaka", "Uchida", "Vargas", "Walker", "Young", "Zhang"];

let nextUserId = 50_000;
let nextEnrollmentId = 80_000;

function person(n: number) {
  const first = FIRST[n % FIRST.length];
  const last = LAST[(n * 7) % LAST.length];
  const id = nextUserId++;
  return {
    id,
    name: `${first} ${last}`,
    sortable_name: `${last}, ${first}`,
    // "practice." can never be a real BYU NetID, so practice students never collide with real ones.
    login_id: `practice.${first[0]}${last}${n}`.toLowerCase(),
    sis_user_id: String(100_000_000 + id),
  };
}

function enroll(
  user: CanvasEnrollment["user"],
  sectionId: number,
  state: CanvasEnrollment["enrollment_state"] = "active",
): CanvasEnrollment {
  return { id: nextEnrollmentId++, user_id: user.id, course_section_id: sectionId, enrollment_state: state, user };
}

const WINTER = { name: "Winter 2027", start_at: "2027-01-07T07:00:00Z", end_at: "2027-04-21T06:00:00Z" };
const FALL = { name: "Fall 2026", start_at: "2026-09-02T06:00:00Z", end_at: "2026-12-17T07:00:00Z" };

export const PRACTICE_SECTIONS: CanvasSection[] = [
  { id: 11011, name: "BUS M 361 Section 001", course_id: 1101, nonxlist_course_id: null },
  { id: 11012, name: "BUS M 361 Section 002", course_id: 1101, nonxlist_course_id: null },
  { id: 11013, name: "BUS M 361R Section 001", course_id: 1101, nonxlist_course_id: 1199 }, // cross-listed in
  { id: 11021, name: "BUS M 499 Section 001", course_id: 1102, nonxlist_course_id: null },
  { id: 11031, name: "MKTG 201 Section 001", course_id: 1103, nonxlist_course_id: null },
  { id: 11032, name: "MKTG 201 Section 002", course_id: 1103, nonxlist_course_id: null },
  { id: 11033, name: "MKTG 201 Section 003", course_id: 1103, nonxlist_course_id: null },
];

function buildEnrollments(): Map<number, CanvasEnrollment[]> {
  let n = 1;
  const byCourse = new Map<number, CanvasEnrollment[]>();

  // BUS M 361: 46 students over three sections, plus the awkward cases.
  const bus361: CanvasEnrollment[] = [];
  for (let i = 0; i < 46; i++) bus361.push(enroll(person(n++), [11011, 11012, 11013][i % 3]));
  const twoSections = person(n++);
  bus361.push(enroll(twoSections, 11011), enroll(twoSections, 11012));
  bus361.push(enroll(person(n++), 11012, "completed")); // dropped the class
  bus361.push(enroll(person(n++), 11011, "inactive"));
  bus361.push(enroll({ ...person(n++), login_id: null }, 11013)); // NetID not visible
  bus361.push(enroll(person(n++), 11011, "invited"));
  byCourse.set(1101, bus361);

  const bus499: CanvasEnrollment[] = [];
  for (let i = 0; i < 24; i++) bus499.push(enroll(person(n++), 11021));
  byCourse.set(1102, bus499);

  // MKTG 201: big enough that Canvas returns it in three pages of 100.
  const mktg: CanvasEnrollment[] = [];
  for (let i = 0; i < 230; i++) mktg.push(enroll(person(n++), [11031, 11032, 11033][i % 3]));
  byCourse.set(1103, mktg);

  return byCourse;
}

export const PRACTICE_ENROLLMENTS = buildEnrollments();

function activeStudents(courseId: number): number {
  const ids = new Set(
    (PRACTICE_ENROLLMENTS.get(courseId) ?? []).filter((e) => e.enrollment_state === "active").map((e) => e.user_id),
  );
  return ids.size;
}

export const PRACTICE_COURSES: CanvasCourse[] = [
  { id: 1101, name: "Business Strategy", course_code: "BUS M 361", term: WINTER, total_students: activeStudents(1101) },
  { id: 1102, name: "Strategy Capstone", course_code: "BUS M 499", term: WINTER, total_students: activeStudents(1102) },
  { id: 1103, name: "Marketing Principles", course_code: "MKTG 201", term: FALL, total_students: activeStudents(1103) },
];
