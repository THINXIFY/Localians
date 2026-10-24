# Changelog

All notable changes to the `localians` CLI. Versions follow [semantic versioning](https://semver.org/) (0.x: minor
versions add features, patch versions fix bugs).

## 0.2.0

Sign in once, share several apps at the same time, and always know which account and project you're using.

### Added

- `localians whoami` shows which account this computer is signed in to (username, email, workspace), checked with
  the server.
- `localians share <port> --new [--name <name>]` creates a new project for the app you're sharing.
- Share several apps at once: run one `localians share <port>` per app, each in its own terminal. Every share has its
  own project, link, timer and public or password setting, and stopping one leaves the others running. `status`
  lists them all.
- The CLI remembers which project each app folder and port uses, separately for each account, so the next
  `localians share` picks the same project without asking.

### Changed

- `localians login` shows the one-time code and the link to approve it, and says when you're already signed in (and
  how to switch accounts) instead of starting over. Success reads "Signed in as @username. You're ready to share."
- Logins renew themselves while you use them; unused ones still expire after 90 days, and revoked ones stay revoked.
- Project selection never guesses silently: the remembered project, else the only project using the port (you confirm
  it the first time), else you choose when several match.
- A port that's already being shared from another terminal on this computer isn't shared twice: the CLI shows the
  existing link instead. If that terminal crashed, sharing the port again takes over from it.
- Clearer errors that say what to do next, for example "Nothing is running on localhost:3000. Start your app and try
  again.", "You're not signed in. Run: npx localians login", and "This project's preview period has ended. Upgrade or
  renew your Preview Pass."
- A dashboard command (`--setup`) made by a different account says so and offers to switch accounts.
- Hints show `npx localians …` when the CLI runs through npx, and `localians …` when it's installed.

### Compatibility

- Works with existing logins from 0.1.0: no need to sign in again after upgrading.
- 0.1.0 keeps working against the current Localians server.

## 0.1.0

First public release: `localians share <port>` with browser login, `status`, `logout`, `--project`, `--setup`,
`--duration` and password-protected previews.
