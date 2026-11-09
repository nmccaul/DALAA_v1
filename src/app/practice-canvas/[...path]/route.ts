import { practiceCanvas } from "@/canvas/practice/server";

/** Practice Canvas over HTTP, so the real Canvas client runs against it unchanged. */
export function GET(request: Request) {
  return practiceCanvas(request);
}

/** Making an assignment (the one thing practice Canvas writes). */
export function POST(request: Request) {
  return practiceCanvas(request);
}

/** Changing an assignment. */
export function PUT(request: Request) {
  return practiceCanvas(request);
}
