import { readFileSync } from "node:fs";
import path from "node:path";

// The three LOCAL devstack accounts (scripts/devstack/test-users.json).
// The league is capped at 3 members, so the bots play as these.

type TestUser = {
  username: string;
  password: string;
  admin?: boolean;
};

const file = path.resolve(__dirname, "../../../scripts/devstack/test-users.json");

export const TEST_USERS: TestUser[] = JSON.parse(readFileSync(file, "utf8")).users;

export type Username = "bossg" | "samo" | "fardin";

export const USERNAMES: Username[] = ["bossg", "samo", "fardin"];

// bossg is created first by the devstack, so he is the league admin
// (only an admin can create competitions and submit their results).
export const ADMIN: Username = "bossg";

// Seeded by global-setup through the real RPCs; fardin is left fresh
// so onboarding.spec can walk him through the real UI.
export const PRESEEDED: Username[] = ["bossg", "samo"];
export const FRESH_USER: Username = "fardin";

export function passwordFor(username: string): string {
  const user = TEST_USERS.find((u) => u.username === username);

  if (!user) {
    throw new Error(`Unknown test user ${username}`);
  }

  return user.password;
}
