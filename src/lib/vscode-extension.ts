/**
 * The one place that says what a visitor may do with the Localians VS Code extension today. Pages, buttons, the sitemap
 * and structured data read it, and a test (tests/unit/vscode-extension.unit.test.ts) checks it against the extension's
 * own package.json, so nothing on the website can link to an install or download that doesn't exist.
 *
 * To open each door (after the owner approves, see extensions/vscode/PUBLISHING.md):
 *   - published a Marketplace listing  → marketplace.published = true
 *   - released a VSIX (GitHub Release) → fill in vsix with its real URL, version and SHA-256
 * Until then the site says "Coming soon" and enables only the documentation link.
 */
export const vscodeExtension = {
  /** Must equal extensions/vscode/package.json: publisher.name, displayName, version and engines.vscode (tested). */
  id: "thinxify.localians",
  displayName: "Localians — Share Localhost",
  version: "0.1.0",
  /** Minimum VS Code version. */
  minVscode: "1.90",
  marketplace: {
    published: false,
    listingUrl: "https://marketplace.visualstudio.com/items?itemName=thinxify.localians",
    /** Opens VS Code on the extension's page (the "Install in VS Code" button, once published). */
    installUri: "vscode:extension/thinxify.localians",
  },
  /** A validated, publicly released package. null until a GitHub Release exists. */
  vsix: null as null | { version: string; url: string; sha256: string; size: string },
} as const;

/** What the site may offer right now. */
export function vscodeAvailability() {
  const { marketplace, vsix } = vscodeExtension;
  return {
    /** "Install in VS Code" is live (a published Marketplace listing). */
    installable: marketplace.published,
    /** "Download VSIX" is live (a public release file with a checksum). */
    downloadable: vsix !== null,
    /** Neither is live yet: the page says Coming soon. */
    comingSoon: !marketplace.published && vsix === null,
  };
}
