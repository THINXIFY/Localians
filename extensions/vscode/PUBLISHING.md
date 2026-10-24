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

Marketplace publishing, with an approval step: GitHub → **Actions → VS Code extension release → Run workflow** → enter the version
(must equal `package.json`) → leave **publish** off first. It builds, tests, packages, and drafts a GitHub Release with
the `.vsix` and `.sha256`. Review the draft, then run the workflow again with **publish** on: after the environment's
reviewers approve, it publishes the same package to the Marketplace.

By hand (from `extensions/vscode`, after `npm run package` and `npx vsce login thinxify`):

```bash
npx vsce publish --packagePath dist/localians-<version>.vsix
```

Check the listing at <https://marketplace.visualstudio.com/items?itemName=thinxify.localians> (it can take a few
minutes), install it in a clean VS Code profile and share an app.

## 4. A direct VSIX download (manual install, before or without the Marketplace)

The website serves the file itself: `public/downloads/vscode/localians-0.1.0.vsix` (+ `.sha256`), so **Download VSIX** works on
localhost and on every deployment (`vsix.hosted = true`). A unit test requires that copy to be byte-for-byte the recorded file, and you can
check a deployment with `npm run vscode:verify-release -- --url https://localians.com/downloads/vscode/localians-0.1.0.vsix`.
The GitHub Release below is an optional mirror: the site links it once `vsix.released = true`. The checksum is the SHA-256
of one specific file: the release candidate built on 2026-10-24 (`localians-0.1.0.vsix`, kept at
`extensions/vscode/dist/` and `~/.cache/localians-vsix-release/0.1.0/`). **Every rebuild has a different checksum**, so release that exact
file (or rebuild, copy the new file and its `.sha256` to `public/downloads/vscode/` and update `src/lib/vscode-extension.ts`;
`npm run vscode:package` tells you when they differ).

1. **Draft the release** (not public). Either:
   - on the web: GitHub → Releases → **Draft a new release** → choose a new tag `vscode-v0.1.0` (created when published), target `main`,
     title `Localians for VS Code 0.1.0`, attach `localians-0.1.0.vsix` and `localians-0.1.0.vsix.sha256`, **Save draft**; or
   - by script: `GITHUB_TOKEN=<fine-grained token, Contents: read and write on THINXIFY/Localians> npm run vscode:draft-release`.
     It checks the file against the website's checksum, refuses if the tag or release already exists, creates a **draft** with both files, and
     cannot publish or replace anything. (The token goes in the environment only.)
   Do not use the "VS Code extension release" workflow for this: it rebuilds the package, so its file would not match the checksum on the site.
2. **Review** the draft, then **Publish release** in GitHub (this is the public step and needs the owner's approval).
3. **Verify the public asset**: `npm run vscode:verify-release` downloads the URL recorded in `src/lib/vscode-extension.ts`, and checks its
   SHA-256, the `.sha256` file and the package contents.
4. **Show the mirror**: set `vsix.released = true` in `src/lib/vscode-extension.ts` (adds a "GitHub mirror" link next to the
   site's Download button), run the site tests, commit, push and deploy.

Tags and release files are never replaced; to fix a bad release, publish a new version.

### Releasing a new version on the website (e.g. 0.2.0)

The 0.2.0 candidate is `extensions/vscode/dist/localians-0.2.0.vsix` (copy kept in
`~/.cache/localians-vsix-release/0.2.0/`; SHA-256 in the `.sha256` file next to it). Released on the website on 2026-10-24
(the owner approved it; 0.1.0 stays hosted for old links). The steps, for the next version:

1. Copy `localians-0.2.0.vsix` and `localians-0.2.0.vsix.sha256` into `public/downloads/vscode/` (keep 0.1.0 there too, so
   old links keep working).
2. In `src/lib/vscode-extension.ts` set `version` and `vsix.version` to 0.2.0, and `vsix.fileName`, `vsix.url`,
   `vsix.hostedPath`, `vsix.sha256` and `vsix.size` to the new file's (the unit tests check the hosted file against them).
3. Run the site tests, commit, push and deploy. The `/docs/vscode` guide and the extension page already describe 0.2.0's
   sidebar, so deploy them together with this step.

## 5. After publishing on the Marketplace: the website

In `src/lib/vscode-extension.ts` set `marketplace.published = true` (and keep the VSIX section). **Install from Marketplace** then becomes a link
to `vscode:extension/thinxify.localians`, the "Coming soon" labels go away, and the page is described as an available application.
Users who installed from a .vsix keep that copy; installing from the Marketplace replaces it and enables automatic updates.

## Optional: Open VS Code forks (VSCodium, Cursor, …)

Those use the Open VSX registry (<https://open-vsx.org>). Create a namespace `thinxify`, a token, and run
`npx ovsx publish dist/localians-<version>.vsix -p <token>`. Same rules for the token as above.
