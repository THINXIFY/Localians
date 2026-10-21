/** URL-safe slug: lowercase ASCII words joined by single hyphens, max 48 chars. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function randomSuffix(length = 5): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Finds a slug not rejected by `isTaken`, trying the base first, then numbered
 * variants, then a random suffix as a last resort.
 */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>, fallback = "item") {
  const root = slugify(base) || fallback;
  if (!(await isTaken(root))) return root;
  for (let n = 2; n <= 20; n++) {
    const candidate = `${root.slice(0, 44)}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${root.slice(0, 40)}-${randomSuffix(6)}`;
}
