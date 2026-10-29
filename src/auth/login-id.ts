/**
 * What people call the ID they sign in with: "NetID" at BYU, "login ID" on
 * any other Canvas (D-025). Every page that names it uses this, so the word
 * is decided once.
 */

import { usesNetIds } from "@/canvas/institution";

export type LoginIdLabel = {
  /** Starts a sentence or heads a column: "NetID" / "Login ID". */
  title: string;
  /** Mid-sentence: "their NetID" / "their login ID". */
  noun: string;
  /** "NetIDs" / "login IDs". */
  plural: string;
};

export function loginIdLabel(netIds = usesNetIds()): LoginIdLabel {
  return netIds
    ? { title: "NetID", noun: "NetID", plural: "NetIDs" }
    : { title: "Login ID", noun: "login ID", plural: "login IDs" };
}
