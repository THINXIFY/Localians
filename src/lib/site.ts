export const site = {
  name: "Localians",
  title: "Localians — Your localhost. Anywhere.",  description:
    "Share your local web apps with clients and teammates in seconds. Secure HTTPS previews, real-time updates, and zero deployment hassle.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://localians.com",
  command: "npx localians share 3000",
  demoUrl: "https://demo.localians.com",
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
  forgotPassword: "/forgot-password",
  docs: "/docs",
  cliGuide: "/docs/cli",
  gettingStarted: "/docs/getting-started",
  frameworks: "/docs/frameworks",
  troubleshooting: "/docs/troubleshooting",
  security: "/docs/security",
  about: "/about",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
} as const;

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
    title: "Developers",
    links: [
      { label: "Documentation", href: routes.docs },
      { label: "CLI Guide", href: routes.cliGuide },
      { label: "Getting Started", href: routes.gettingStarted },
      { label: "Troubleshooting", href: routes.troubleshooting },
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
