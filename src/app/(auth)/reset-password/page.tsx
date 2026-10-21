import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormError } from "@/components/app/Field";
import { ResetPasswordForm } from "@/components/auth/RecoveryForms";
import { buttonClasses } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token, error } = await searchParams;

  if (error || !token) {
    return (
      <AuthCard title="Link expired" description="Password reset links can be used once and expire after 1 hour.">
        <div className="flex flex-col gap-4">
          <FormError message="This reset link is invalid or has expired." />
          <Link href="/forgot-password" className={buttonClasses({ size: "lg", className: "w-full" })}>
            Request a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="Signing in again will be required on all your devices.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
