import "server-only";

/**
 * The request's render time. Server components render once per request, so this is a
 * stable snapshot ("connected for", relative times, and the live-update resume cursor).
 */
export const renderTime = () => Date.now();
