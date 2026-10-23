import "server-only";

/** Response for a stored image: exact type, no sniffing, no script execution even if opened directly. */
export function imageResponse(body: Buffer, contentType: string, cache: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

export const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
