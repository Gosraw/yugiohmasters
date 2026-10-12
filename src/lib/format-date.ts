// =========================================================
// DATE FORMATTING (league time zone)
//
// Pages render on the server, and on Vercel the server clock is
// UTC: a plain toLocaleString() showed every time 1-2 hours early
// for the league (which plays in the Netherlands). Every date shown
// in the app goes through these helpers, which always format in
// Europe/Amsterdam, no matter where the code runs.
// =========================================================

export const LEAGUE_TIME_ZONE = "Europe/Amsterdam";

type DateInput =
  | string
  | number
  | Date
  | null
  | undefined;

function toDate(
  value: DateInput
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

/** "12 Oct 2026" */
export function formatLeagueDate(
  value: DateInput,
  fallback = "—"
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      timeZone: LEAGUE_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

/** "12 Oct 2026, 21:30" */
export function formatLeagueDateTime(
  value: DateInput,
  fallback = "—"
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  return date.toLocaleString(
    "en-GB",
    {
      timeZone: LEAGUE_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/** "12 Oct" */
export function formatLeagueShortDate(
  value: DateInput,
  fallback = "—"
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      timeZone: LEAGUE_TIME_ZONE,
      day: "numeric",
      month: "short",
    }
  );
}

/** The calendar day ("2026-10-12") a moment falls on in Amsterdam. */
export function leagueDayKey(
  value: Date
) {
  // en-CA formats as YYYY-MM-DD.
  return value.toLocaleDateString(
    "en-CA",
    {
      timeZone: LEAGUE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  );
}

function dayNumber(
  key: string
) {
  const [year, month, day] =
    key.split("-").map(Number);

  return Math.round(
    Date.UTC(year, month - 1, day) /
      86_400_000
  );
}

/**
 * "Today" / "Yesterday" / "3d ago" / "12 Oct", by CALENDAR day in
 * Amsterdam (not "less than 24 hours ago").
 */
export function formatLeagueRelativeDay(
  value: DateInput,
  now: Date = new Date()
) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  const diffDays =
    dayNumber(leagueDayKey(now)) -
    dayNumber(leagueDayKey(date));

  if (diffDays <= 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return formatLeagueShortDate(date);
}

/** 2825 -> "2,825" (same on server and client). */
export function formatNumber(
  value: number
) {
  return value.toLocaleString("en-US");
}
