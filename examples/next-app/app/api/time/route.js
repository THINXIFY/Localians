export function GET() {
  return Response.json({ source: "local Next.js API route", at: new Date().toISOString() });
}
