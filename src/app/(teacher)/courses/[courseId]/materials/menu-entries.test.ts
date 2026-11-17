import { describe, expect, it } from "vitest";
import { materialsMenuEntries } from "./menu-entries";

describe("+ Materials menu", () => {
  // Feedback 85113309: "Link a Canvas Page/File" only filtered the list, so a
  // teacher read them as a step they had to take for material already listed.
  it("offers only entries that add a material", () => {
    const base = "/courses/c1/materials";
    for (const e of materialsMenuEntries(base)) expect(e.href).toMatch(new RegExp(`^${base}/new\\?kind=`));
  });
});
