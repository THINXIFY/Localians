/**
 * Auth cookie naming. Over HTTPS every Localians auth cookie uses the `__Host-` prefix, which
 * browsers only accept when the cookie is Secure, has Path=/ and has NO Domain attribute.
 *
 * Why: previews (*.preview.localians.com) run developers' untrusted code on subdomains of the
 * app's domain. A preview page can set cookies for the parent domain (`Domain=localians.com`) and
 * try to shadow the dashboard's session cookie ("cookie tossing"). A `__Host-` name can't be set
 * with a Domain attribute at all, so such a cookie is rejected by the browser — and the app only
 * ever reads the `__Host-` name.
 *
 * Local http development keeps plain `localians.*` names (`__Host-` requires Secure).
 */
const appUrl = () => process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const authCookiesSecure = () => appUrl().startsWith("https://");
export const authCookiePrefix = () => (authCookiesSecure() ? "__Host-localians" : "localians");
/** Name of the session cookie, as the browser sends it. */
export const sessionCookieName = () => `${authCookiePrefix()}.session_token`;
