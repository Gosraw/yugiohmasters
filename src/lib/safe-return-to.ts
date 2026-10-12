// Shared helpers for server actions that redirect "back to where the
// form was" (a hidden return_to field) with a ?success= / ?error=
// banner message.
//
// return_to comes from the browser, so it is never trusted: only a
// same-site, relative path (starting with a single "/") is allowed.
// Anything else ("https://evil.example", "//evil.example",
// "/\\evil.example", "javascript:...") falls back to a fixed path.

const BASE =
  "http://duelist.local";

export function safeReturnTo(
  value:
    | string
    | null
    | undefined,
  fallback: string
): string {
  const raw =
    (value ?? "").trim();

  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(
      raw
    )
  ) {
    return fallback;
  }

  let url: URL;

  try {
    url =
      new URL(
        raw,
        BASE
      );
  } catch {
    return fallback;
  }

  if (
    url.origin !==
    BASE
  ) {
    return fallback;
  }

  // Old banner messages must not pile up on the next redirect.
  url.searchParams.delete(
    "success"
  );

  url.searchParams.delete(
    "error"
  );

  return `${url.pathname}${url.search}`;
}

export function withFeedback(
  path: string,
  kind:
    | "success"
    | "error",
  message: string
): string {
  return `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(
    message
  )}`;
}
