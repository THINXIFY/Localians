# Changelog

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
