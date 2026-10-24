/**
 * Google Analytics (Google tag) with Consent Mode. The tag is on every page, but analytics and ad storage start as
 * "denied": no analytics cookies are set until the visitor clicks Accept in the cookie banner (ConsentBanner). The
 * choice is kept in this browser's local storage and can be changed from "Cookie settings" in the footer.
 */
export const GA_MEASUREMENT_ID = "G-CKRSHECFM1";

/** localStorage key holding "granted" or "denied". */
export const CONSENT_STORAGE_KEY = "localians-cookie-consent";
/** Fired on window to reopen the banner ("Cookie settings"). */
export const CONSENT_REOPEN_EVENT = "localians:cookie-settings";

export type ConsentChoice = "granted" | "denied";

/**
 * Runs in <head> before gtag.js loads: sets the consent defaults (denied), re-applies a stored Accept, then
 * configures the Google tag. Order matters: the consent default must come before `config`.
 */
export const googleTagBootstrap = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
try{if(localStorage.getItem('${CONSENT_STORAGE_KEY}')==='granted'){gtag('consent','update',{analytics_storage:'granted'});}}catch(e){}
gtag('js',new Date());
gtag('config','${GA_MEASUREMENT_ID}');`;

type Gtag = (...args: unknown[]) => void;

/** Records the visitor's choice and tells the Google tag. Only analytics storage is ever granted (no advertising). */
export function applyConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice applies to this page view only.
  }
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  gtag?.("consent", "update", { analytics_storage: choice });
}

export function storedConsent(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}
