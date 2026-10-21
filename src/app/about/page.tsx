import type { Metadata } from "next";
import { Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Localians helps developers share locally running web apps without deploying.",
  alternates: { canonical: routes.about },
};

export default function AboutPage() {
  return (
    <SubPage
      eyebrow="About"
      title="Secure localhost previews for developers who move fast."
      intro="Localians exists for one moment in every project: someone needs to see your work, and it only runs on your machine."
    >
      <Prose>
        <p>
          Deploying to a staging server just to show progress adds build waits and repeated steps to every review. Localians
          replaces that loop with a single command that turns your running local app into a secure HTTPS link anyone can
          open in a browser.
        </p>
        <p>
          We&apos;re starting with the essentials in our Stage 1 beta: sharing, a clean project dashboard, basic access
          protection and connection monitoring.
        </p>
      </Prose>
    </SubPage>
  );
}
