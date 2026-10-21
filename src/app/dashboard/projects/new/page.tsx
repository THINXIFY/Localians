import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { CreateProject } from "@/components/app/CreateProject";
import { Card, PageHeader } from "@/components/app/Primitives";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireUser();
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Projects", href: "/dashboard/projects" }, { label: "New project" }]} />}
        title="Create a project"
        description="Describe the app you're building. You can change these details at any time."
      />
      <Card className="p-5 sm:p-7">
        <CreateProject />
      </Card>
    </div>
  );
}
