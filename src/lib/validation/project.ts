import { z } from "zod";

export const FRAMEWORKS = [
  { value: "NEXTJS", label: "Next.js", port: 3000 },
  { value: "REACT_VITE", label: "React / Vite", port: 5173 },
  { value: "VUE", label: "Vue", port: 5173 },
  { value: "ANGULAR", label: "Angular", port: 4200 },
  { value: "NODEJS", label: "Node.js", port: 3000 },
  { value: "OTHER", label: "Other", port: null },
] as const;

export type FrameworkValue = (typeof FRAMEWORKS)[number]["value"];

export const frameworkLabel = (value: string | null | undefined) =>
  FRAMEWORKS.find((f) => f.value === value)?.label ?? null;

const frameworkValues = FRAMEWORKS.map((f) => f.value) as [FrameworkValue, ...FrameworkValue[]];

/**
 * Form input for create/edit. Empty strings from the form mean "not set".
 * defaultPort arrives as a string from <input> and must be an integer 1–65535.
 */
export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(80, "Keep the name under 80 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters.")
    .transform((v) => (v === "" ? null : v)),
  framework: z
    .union([z.enum(frameworkValues), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  defaultPort: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), "Use a whole number, like 5173.")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (v >= 1 && v <= 65535), "Ports range from 1 to 65535."),
});

export type ProjectFormValues = z.input<typeof projectInputSchema>;
export type ProjectInput = z.output<typeof projectInputSchema>;

export const projectStatusFilter = z.enum(["all", "active", "archived"]).catch("all");
