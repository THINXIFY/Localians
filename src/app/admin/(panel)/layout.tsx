import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/server/admin";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Localians Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  return <AdminShell admin={{ email: admin.email }}>{children}</AdminShell>;
}
