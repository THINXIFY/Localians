# Changelog

## 0.2.0 — the Localians sidebar

- **A Localians sidebar** (in the activity bar) for the whole flow: account and status, your running app, project,
  options and **Share App**, every active preview with **Copy Link**, **Open** and **Stop**, a Getting started guide and
  quick links. It follows your VS Code theme (light, dark, high contrast) and fits narrow sidebars.
- **Sign in from the sidebar:** the one-time code is shown while you approve in the browser (**Copy Code**, **Open
  Browser Again**, **Cancel**); the sidebar updates by itself. Your username is shown; **Switch Account** and **Sign Out**.
- **Several apps at once:** **Share Another App**, independent previews (stopping one leaves the others running),
  previews from a terminal listed too, and a clear message when an app is already shared or the account's limit is reached.
- **Only what you're entitled to:** the sidebar shows each project's free preview or Preview Pass; longer link lengths
  only with a pass; **Renew Preview Pass** opens the project's plan page when the free preview is over. Reserved custom
  URLs are shown.
- **Better project matching:** the project you used for an app before, or the one using its port; never a project that
  belongs to another port.
- **Clear messages with a next step** instead of server errors (app not running, preview period ended, preview limit,
  connection interrupted, signed out).
- **Status bar:** Localians: Signed Out / Connected / N Live — click it to open the sidebar.
- **Getting Started walkthrough** (Localians: Getting Started) and new commands **Open Localians** and **Getting Started**;
  **Connect to Localians** is now **Sign In**.
- Security: the sidebar is a webview with a strict Content Security Policy (only its own files, no remote content);
  every message from it is validated; tokens and passwords never reach it (passwords are typed in VS Code's own
  masked input).

## 0.1.0 — first release

- Connect to Localians with one click (browser approval; the token is kept in VS Code's SecretStorage).
- Finds apps running on this computer (Next.js, Vite, React, Vue, Svelte, Angular, Astro, Django, Flask, FastAPI,
  Express, Rails, …) on common ports and ports your workspace suggests; monorepo aware.
- Share App: pick an app → project (matched by port, or a new one named after your app) → Public or Password → link
  copied. Connected is shown only once Localians confirms the tunnel.
- Choose how long the link works: until the free preview or pass ends (default), or stop after 5 minutes to 24 hours.
  When a project's free preview is over, the extension explains it and links to the dashboard's plan page.
- Previews list with Copy Link, Open, Stop, Set Password and Share Again; previews started elsewhere are shown too.
- Status bar entry, Command Palette commands, Restricted Mode support, Remote Development (runs where your app runs).
