/** Thrown when a resource does not exist *or* the caller may not see it (avoids leaking existence). */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
}

/** Thrown when the caller can see a resource but lacks the role to change it. */
export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
}

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
}
