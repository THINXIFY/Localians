import type { Metadata } from "next";
import { Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description: "Localians helps developers share a locally running web app with clients and teammates through a secure HTTPS link — without deploying it.",
  path: routes.about,
});

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
          We&apos;re starting with the essentials: one-command sharing, password-protected HTTPS previews, auto-stop
          timers and a clean project dashboard with connection monitoring.
        </p>
      </Prose>
    </SubPage>
  );
}
