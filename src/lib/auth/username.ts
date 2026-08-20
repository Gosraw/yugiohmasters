const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username.trim());
}

export function usernameToAuthEmail(username: string): string {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) {
    throw new Error("Username must be 3-24 characters using letters, numbers, _ or -.");
  }
  return `${normalized}@duelist.local`;
}
