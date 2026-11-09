import { describe, expect, it } from "vitest";
import { activitiesView } from "./view";

describe("activitiesView", () => {
  const counts = { assigned: 3, notAssigned: 5, other: 0 };

  it("shows the list asked for", () => {
    expect(activitiesView("unassigned", counts)).toBe("unassigned");
    expect(activitiesView("other", counts)).toBe("other");
    expect(activitiesView("assigned", { assigned: 0, notAssigned: 1, other: 0 })).toBe("assigned");
  });

  it("otherwise opens on the first list with anything in it", () => {
    expect(activitiesView(undefined, counts)).toBe("assigned");
    expect(activitiesView(undefined, { assigned: 0, notAssigned: 2, other: 4 })).toBe("unassigned");
    expect(activitiesView("nonsense", { assigned: 0, notAssigned: 0, other: 4 })).toBe("other");
    expect(activitiesView(undefined, { assigned: 0, notAssigned: 0, other: 0 })).toBe("assigned");
  });
});
