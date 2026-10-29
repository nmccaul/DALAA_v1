"use client";

import { useSyncExternalStore } from "react";
import { formatTime, type TimeStyle } from "./time";

const noChange = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * A time in the viewer's own time zone. The server renders UTC (it can't know
 * the zone); the browser swaps in its zone right after hydration, without a
 * mismatch, because the server snapshot is the UTC one.
 */
export function LocalTime({ value, style = "dateTime" }: { value: Date | number; style?: TimeStyle }) {
  const zone = useSyncExternalStore(noChange, browserZone, () => "UTC");
  const at = new Date(value);
  return <time dateTime={at.toISOString()}>{formatTime(at, style, zone)}</time>;
}
