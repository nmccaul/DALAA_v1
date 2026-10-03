import { practiceCanvas } from "@/canvas/practice/server";

/** Practice Canvas over HTTP, so the real Canvas client runs against it unchanged. */
export function GET(request: Request) {
  return practiceCanvas(request);
}
