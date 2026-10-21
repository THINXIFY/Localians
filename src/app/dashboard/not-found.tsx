import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/Primitives";
import { ButtonLink } from "@/components/ui/Button";

export default function DashboardNotFound() {
  return (
    <EmptyState
      icon={<SearchX className="size-5" aria-hidden="true" />}
      title="Page not found"
      description="This page doesn't exist, or you don't have access to it."
      action={<ButtonLink href="/dashboard/projects">Back to projects</ButtonLink>}
    />
  );
}
