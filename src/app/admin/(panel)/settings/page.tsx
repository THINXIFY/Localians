import type { Metadata } from "next";
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm";
import { AdminHeader } from "@/components/admin/Ui";
import { qrPath } from "@/lib/payment-qr";
import { requireAdminPage } from "@/server/admin";
import { getPaymentSettingsView } from "@/server/payment-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const view = await getPaymentSettingsView();
  return (
    <>
      <AdminHeader title="Settings" description="Payment collection for the 7-Day Preview Pass." />
      <PaymentSettingsForm view={{ ...view, generatedQr: qrPath(view.recipient) }} />
    </>
  );
}
