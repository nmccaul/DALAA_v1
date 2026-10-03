/**
 * The BYU term a teacher is most likely setting up now: the next one to start.
 * Only a starting value for the form; the teacher can type anything.
 * BYU terms: Winter (Jan), Spring (May), Summer (late Jun), Fall (Sep).
 */
export function upcomingTerm(today: Date): string {
  const month = today.getMonth(); // 0 = January
  const year = today.getFullYear();
  if (month >= 8) return `Winter ${year + 1}`;
  if (month >= 6) return `Fall ${year}`;
  if (month >= 4) return `Summer ${year}`;
  return `Spring ${year}`;
}
