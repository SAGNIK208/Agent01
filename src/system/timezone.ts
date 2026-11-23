import { Temporal } from "@js-temporal/polyfill";

export type TimezoneResolution =
  | { status: "ok"; timeZone: string }
  | { status: "unavailable"; reason: string };

export function detectTimeZone(): TimezoneResolution {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!timeZone) {
      return {
        status: "unavailable",
        reason: "The operating system did not provide a time zone.",
      };
    }

    return { status: "ok", timeZone };
  } catch {
    return {
      status: "unavailable",
      reason: "Time-zone detection failed on this system.",
    };
  }
}

export function requireTimeZone(): string {
  const result = detectTimeZone();

  if (result.status === "unavailable") {
    throw new Error(result.reason);
  }

  return result.timeZone;
}

export function getLocalNowString(timeZone: string): {
  timeZone: string;
  dateTime: string;
  dayOfWeek: string;
} {
  const now = Temporal.Now.zonedDateTimeISO(timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateTime = `${now.year}-${pad(now.month)}-${pad(now.day)} ${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)}`;
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const dayOfWeek = days[now.dayOfWeek - 1] ?? "Monday";

  return { timeZone, dateTime, dayOfWeek };
}
