# Publishing the Localians VS Code extension

Nothing here has been done yet. **Do not publish until the owner has approved.** The extension's id is
`thinxify.localians` (publisher `thinxify`, name `localians`); users install it with `ext install thinxify.localians`.

## Decision needed: the license

The extension is currently **all rights reserved** (`LICENSE.md`: installing and using it with the Localians service is
allowed; copying, modifying and redistributing is not), because only the CLI package was approved for MIT. The
Marketplace accepts that. If the owner wants people to be able to redistribute the extension (or wants a public VSIX
download without that restriction), switch `LICENSE.md` and `"license"` to MIT (the code it bundles from the CLI is
already MIT) and update `scripts/verify-vsix.mjs` and `tests/unit/cli.unit.test.ts`, which currently pin the decision.

## 0. Before every release

```bash
npm run vscode:typecheck
npm run vscode:package           # builds dist/localians-<version>.vsix + .sha256 and verifies the package
LOCALIANS_VSCODE_DOWNLOAD=1 npx vitest run tests/integration/vscode-host.test.ts   # real VS Code (also: LOCALIANS_VSCODE_VERSION=1.90.2)
```

Bump `version` in `extensions/vscode/package.json` (semver) and add a section to `CHANGELOG.md`. A version can only be
published once; the Marketplace never lets you replace it.

## 1. One-time: the publisher

1. Sign in at <https://marketplace.visualstudio.com/manage> with a Microsoft account the team controls (use a shared
   team account, not one person's, so access isn't lost).
2. **Create publisher** → ID `thinxify` (this ID is permanent and must match `"publisher"` in `package.json`), display
   name `THINXIFY`, and the support/website links (<https://thinxify.com>, <https://localians.com>).
3. Complete the publisher profile; ask Microsoft to **verify** the publisher's domain (`thinxify.com`) when offered, so
   the listing shows the verified badge.

If `thinxify` is already taken by someone else, pick another ID and change `publisher` in `package.json` (and the id in
`tests/integration/vscode-host.test.ts`, `scripts/verify-vsix.mjs` and the website's `src/lib/vscode-extension.ts`).

## 2. One-time: a publishing token (never commit it)

1. Go to <https://dev.azure.com> → your organization → **User settings → Personal access tokens → New token**.
2. Organization: **All accessible organizations**. Scopes: **Custom defined → Marketplace → Manage** (nothing else).
   Expiry: the shortest practical (90 days), and put the renewal date in the team calendar.
3. Copy the token once. Store it **only** as a secret:
   - GitHub: repository **Settings → Environments → New environment `vscode-marketplace`** (add required reviewers),
     then add the environment secret `VSCE_PAT`. The release workflow reads it from there.
   - Locally, if publishing by hand: paste it at the `vsce login thinxify` prompt (it is kept in the OS credential
     store). Don't put it in a file, a shell history entry, `.env`, or a command-line argument.
4. Revoke the token on the same page if it is ever exposed, then create a new one.

## 3. Publish

Preferred, with an approval step: GitHub → **Actions → VS Code extension release → Run workflow** → enter the version
(must equal `package.json`) → leave **publish** off first. It builds, tests, packages, and drafts a GitHub Release with
the `.vsix` and `.sha256`. Review the draft, then run the workflow again with **publish** on: after the environment's
reviewers approve, it publishes the same package to the Marketplace.

By hand (from `extensions/vscode`, after `npm run package` and `npx vsce login thinxify`):

```bash
npx vsce publish --packagePath dist/localians-<version>.vsix
```

Check the listing at <https://marketplace.visualstudio.com/items?itemName=thinxify.localians> (it can take a few
minutes), install it in a clean VS Code profile and share an app.

## 4. After publishing: the website

In `src/lib/vscode-extension.ts` (repository root) set `marketplace.published = true`; if the VSIX release is public also
set `vsix` to its release URL, version and SHA-256. Run the site tests, commit, push and deploy. The "Coming soon" labels on
localians.com change to **Install in VS Code** only through that file. Nothing is linked before it is real.

## 5. A direct VSIX download (optional, needs approval)

The GitHub Release created by the workflow holds `localians-<version>.vsix` and its checksum under the tag
`vscode-v<version>`. Tags and release files are never replaced: the workflow fails if the tag already exists (do not use
`--clobber`). To fix a bad release, publish a new version.

## Optional: Open VS Code forks (VSCodium, Cursor, …)

Those use the Open VSX registry (<https://open-vsx.org>). Create a namespace `thinxify`, a token, and run
`npx ovsx publish dist/localians-<version>.vsix -p <token>`. Same rules for the token as above.
