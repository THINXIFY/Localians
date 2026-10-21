import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/Primitives";
import { SettingsTabs } from "@/components/app/SettingsTabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Manage your profile, security, preferences and workspace." />
      <SettingsTabs />
      <div className="flex max-w-[760px] flex-col gap-6">{children}</div>
    </div>
  );
}
