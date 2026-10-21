import { SubPage } from "@/components/sections/SubPage";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <SubPage
      eyebrow="404"
      title="This preview is offline."
      intro="The page you're looking for doesn't exist or has moved."
    >
      <ButtonLink href="/" size="lg">
        Back to home
      </ButtonLink>
    </SubPage>
  );
}
