import { z } from "zod";

/** Same rule as the database CHECK constraint (usernames are stored lowercase). */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

/** Names that would look official or collide with app routes. */
const RESERVED = new Set(
  `admin administrator root system support help billing payments security official staff team moderator mod owner
  localians thinxify api www mail dashboard login signup settings account accounts user users null undefined me you`.split(/\s+/),
);

export const usernameSchema = z
  .string()
  .trim()
  .transform((v) => v.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "Use at least 3 characters.")
      .max(24, "Use 24 characters or fewer.")
      .regex(/^[a-z0-9_]+$/, "Use letters, numbers and underscores only.")
      .regex(/^[a-z]/, "Start with a letter.")
      .refine((v) => !RESERVED.has(v), "That username is reserved. Try another."),
  );

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
