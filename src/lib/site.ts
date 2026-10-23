export const site = {
  name: "Localians",
  title: "Localians — Share localhost apps securely with one command",
  description:
    "Share the app running on your computer with a secure HTTPS preview link — public or password protected. One command for Next.js, Vite and any local dev server. No deployment.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://localians.com",
  command: "npx localians share 3000",
  demoUrl: "https://demo.preview.localians.com",
  supportEmail: "hello@thinxify.com",
  operator: { name: "THINXIFY Technologies", url: "https://thinxify.com" },
};

export const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Use Cases", href: "/#use-cases" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Docs", href: "/docs" },
] as const;

export const routes = {
  signIn: "/login",
  getStarted: "/signup",
  dashboard: "/dashboard",
  /** Plans and upgrades (sign-in first when signed out). */
  billing: "/dashboard/settings/billing",
  forgotPassword: "/forgot-password",
  docs: "/docs",
  cliGuide: "/docs/cli",
  gettingStarted: "/docs/getting-started",
  frameworks: "/docs/frameworks",
  troubleshooting: "/docs/troubleshooting",
  security: "/docs/security",
  about: "/about",
  contact: "/contact",
  privacy: "/privacy-policy",
  terms: "/terms",
  shareLocalhost: "/share-localhost",
  ngrokAlternative: "/ngrok-alternative",
  shareNextjs: "/share-nextjs-localhost",
  shareVite: "/share-vite-localhost",
} as const;

/** Guides for developers looking for a way to share localhost (linked from the footer and the docs). */
export const guideLinks = [
  { label: "Share localhost online", href: routes.shareLocalhost },
  { label: "Share a Next.js app", href: routes.shareNextjs },
  { label: "Share a Vite app", href: routes.shareVite },
  { label: "ngrok alternative", href: routes.ngrokAlternative },
] as const;

export const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How It Works", href: "/#how-it-works" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: routes.docs },
      { label: "Getting Started", href: routes.gettingStarted },
      { label: "CLI Guide", href: routes.cliGuide },
      { label: "Troubleshooting", href: routes.troubleshooting },
      { label: "Share Localhost", href: routes.shareLocalhost },
      { label: "Next.js Guide", href: routes.shareNextjs },
      { label: "Vite Guide", href: routes.shareVite },
      { label: "ngrok Alternative", href: routes.ngrokAlternative },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: routes.about },
      { label: "Contact", href: routes.contact },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: routes.privacy },
      { label: "Terms of Service", href: routes.terms },
    ],
  },
] as const;

/** Every public page meant for search engines: the sitemap lists them, and tests check each is indexable. */
export const indexablePaths = [
  "/",
  routes.shareLocalhost,
  routes.shareNextjs,
  routes.shareVite,
  routes.ngrokAlternative,
  routes.docs,
  routes.gettingStarted,
  routes.cliGuide,
  routes.frameworks,
  routes.security,
  routes.troubleshooting,
  routes.getStarted,
  routes.about,
  routes.contact,
  routes.privacy,
  routes.terms,
] as const;
