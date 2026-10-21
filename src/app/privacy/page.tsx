import type { Metadata } from "next";
import { SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Localians privacy policy.",
  alternates: { canonical: routes.privacy },
};

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
