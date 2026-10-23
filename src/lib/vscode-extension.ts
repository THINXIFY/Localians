/**
 * The one place that says what a visitor may do with the Localians VS Code extension today. Pages, buttons, the sitemap
 * and structured data read it, and a test (tests/unit/vscode-extension.unit.test.ts) checks it against the extension's
 * own package.json, so nothing on the website can link to an install or download that doesn't exist.
 *
 * To open each door (after the owner approves, see extensions/vscode/PUBLISHING.md):
 *   - the GitHub Release is public  → vsix.released = true (after `npm run vscode:verify-release` passes)
 *   - a Marketplace listing is live → marketplace.published = true
 * Until then the site shows the file's details and says "Coming soon"; only the documentation link is live.
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
   * The manual-install file. The checksum is the SHA-256 of the exact file attached to the GitHub Release `vscode-v<version>`
   * (not of a later rebuild: every build differs by timestamps). `released` stays false until that release is public.
   */
  vsix: {
    version: "0.1.0",
    fileName: "localians-0.1.0.vsix",
    url: "https://github.com/THINXIFY/Localians/releases/download/vscode-v0.1.0/localians-0.1.0.vsix",
    sha256: "b9fc9fbe3677eedb546d6ca3c33df56d7914790b8c0c58a9df085f10995cded8",
    size: "40 KB",
    released: false,
  },
} as const;

/** What the site may offer right now. */
export function vscodeAvailability() {
  const { marketplace, vsix } = vscodeExtension;
  return {
    /** "Install from Marketplace" is live (a published Marketplace listing). */
    installable: marketplace.published,
    /** "Download VSIX" is live (the release is public and its asset was verified). */
    downloadable: vsix.released,
    /** Neither is live yet: the page says Coming soon. */
    comingSoon: !marketplace.published && !vsix.released,
  };
}
