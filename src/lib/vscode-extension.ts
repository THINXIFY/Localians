/**
 * The one place that says what a visitor may do with the Localians VS Code extension today. Pages, buttons, the sitemap
 * and structured data read it, and a test (tests/unit/vscode-extension.unit.test.ts) checks it against the extension's
 * own package.json, so nothing on the website can link to an install or download that doesn't exist.
 *
 * The .vsix is served by the website itself (public/downloads/vscode, so it works on localhost and on every deployment);
 * a test requires that file to be the exact one described here. The other doors open after the owner approves (see
 * extensions/vscode/PUBLISHING.md):
 *   - the GitHub Release is public  → vsix.released = true (after `npm run vscode:verify-release` passes): GitHub mirror link
 *   - a Marketplace listing is live → marketplace.published = true
 */
export const vscodeExtension = {
  /** Must equal extensions/vscode/package.json: publisher.name, displayName, version and engines.vscode (tested). */
  id: "thinxify.localians",
  displayName: "Localians — Share Localhost",
  /** Shown to visitors (the Marketplace publisher's display name). */
  publisherName: "THINXIFY",
  version: "0.1.0",
  /** Minimum VS Code version. */
  minVscode: "1.90",
  marketplace: {
    published: false,
    listingUrl: "https://marketplace.visualstudio.com/items?itemName=thinxify.localians",
    /** Opens VS Code on the extension's page (enabled once published). */
    installUri: "vscode:extension/thinxify.localians",
  },
  /**
   * The manual-install file. The checksum is the SHA-256 of the exact release-candidate file (not of a later rebuild:
   * every build differs by timestamps); the site's copy and the GitHub Release asset must both be that file.
   */
  vsix: {
    version: "0.1.0",
    fileName: "localians-0.1.0.vsix",
    /** The GitHub Release asset (a mirror). `released` stays false until that release is public. */
    url: "https://github.com/THINXIFY/Localians/releases/download/vscode-v0.1.0/localians-0.1.0.vsix",
    sha256: "b9fc9fbe3677eedb546d6ca3c33df56d7914790b8c0c58a9df085f10995cded8",
    size: "40 KB",
    released: false,
    /** Served by this website from public/ (with a .sha256 file next to it). */
    hostedPath: "/downloads/vscode/localians-0.1.0.vsix",
    hosted: true,
  },
} as const;

/** What the site may offer right now. */
export function vscodeAvailability() {
  const { marketplace, vsix } = vscodeExtension;
  return {
    /** "Install from Marketplace" is live (a published Marketplace listing). */
    installable: marketplace.published,
    /** "Download VSIX" is live: the website serves the file, or the GitHub Release is public. */
    downloadable: vsix.hosted || vsix.released,
    /** Where the Download button points (the website's copy first). */
    downloadHref: vsix.hosted ? vsix.hostedPath : vsix.url,
    /** The GitHub Release is public: show it as a mirror. */
    githubMirror: vsix.released,
    /** Nothing is live yet: the page says Coming soon. */
    comingSoon: !marketplace.published && !vsix.hosted && !vsix.released,
  };
}
