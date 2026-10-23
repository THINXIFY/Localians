import type { Metadata } from "next";
import { SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: "How Localians handles your account data, CLI logins and preview traffic metadata.",
  path: routes.privacy,
});

export default function PrivacyPage() {
  return (
    <SubPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="How Localians collects, uses and protects information."
      notice={
        <>
          <strong className="font-medium text-fg">Not yet published.</strong> The full Privacy Policy will be available
          here before accounts open. This marketing site does not collect personal data through forms.
        </>
      }
    />
  );
}
