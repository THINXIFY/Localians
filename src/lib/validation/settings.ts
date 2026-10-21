import { z } from "zod";
import { nameSchema } from "./auth";

export const profileSchema = z.object({
  name: nameSchema,
  image: z
    .string()
    .trim()
    .max(2048, "That URL is too long.")
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Use an https:// image URL, or leave it empty.")
    .transform((v) => (v === "" ? null : v)),
});

export const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Enter a workspace name.").max(60, "Keep the name under 60 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters.")
    .max(48, "Use at most 48 characters.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens."),
});

export const themeSchema = z.enum(["DARK", "LIGHT", "SYSTEM"]);
