"use client";

import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/app/Primitives";
import { Button } from "@/components/ui/Button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-5" aria-hidden="true" />}
      title="Something went wrong"
      description="We couldn't load this page. Your data is safe — try again, and if the problem continues, reload the page."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
