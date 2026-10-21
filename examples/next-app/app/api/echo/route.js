export async function POST(request) {
  const form = await request.formData();
  return new Response(`<p data-testid="echo">Form received: ${String(form.get("message")).replace(/[<>&]/g, "")}</p>`, {
    headers: { "content-type": "text/html" },
  });
}
