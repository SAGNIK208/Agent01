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