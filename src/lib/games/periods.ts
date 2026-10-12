// =========================================================
// Mini game periods (display helpers). The database is the
// source of truth for which day / week a run belongs to
// (_mini_game_today(), Europe/Amsterdam); these mirror it for
// labels and countdowns only.
// =========================================================

export const GAME_TIME_ZONE = "Europe/Amsterdam";

/** 'YYYY-MM-DD' of the given instant in Amsterdam. */
export function amsterdamDay(
  at: Date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: GAME_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(at);

  const get = (
    type: string
  ) =>
    parts.find(
      (part) => part.type === type
    )?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** ISO-8601 week key 'IYYY-Www' for a 'YYYY-MM-DD' day. */
export function isoWeekKey(
  day: string
) {
  const [year, month, date] =
    day.split("-").map(Number);

  const d =
    new Date(
      Date.UTC(year, month - 1, date)
    );

  const weekday =
    d.getUTCDay() || 7;

  // Thursday of this week decides the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - weekday);

  const isoYear =
    d.getUTCFullYear();

  const yearStart =
    Date.UTC(isoYear, 0, 1);

  const week =
    Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** "Mon 12 Oct" style label for a 'YYYY-MM-DD' day. */
export function dayLabel(
  day: string
) {
  const [year, month, date] =
    day.split("-").map(Number);

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }
  ).format(
    new Date(
      Date.UTC(year, month - 1, date)
    )
  );
}

/** Milliseconds until the next Amsterdam midnight (approximate across DST, fine for a countdown). */
export function msUntilAmsterdamMidnight(
  at: Date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: GAME_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(at);

  const get = (
    type: string
  ) =>
    Number(
      parts.find(
        (part) => part.type === type
      )?.value ?? 0
    );

  const elapsed =
    (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;

  return Math.max(
    0,
    86400000 - elapsed
  );
}
