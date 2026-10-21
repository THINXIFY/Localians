import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormError, FormNotice } from "@/components/app/Field";
import { ResendVerification } from "@/components/auth/RecoveryForms";
import { buttonClasses } from "@/components/ui/Button";
import { callbackErrorMessage } from "@/lib/auth-client";
import { emailSchema } from "@/lib/validation/auth";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  // Verification links sign the user in, then land here.
  if (params.verified && !params.error && (await getSession())) redirect("/onboarding");

  const email = emailSchema.safeParse(params.email ?? "").success ? params.email! : null;

  if (params.error) {
    return (
      <AuthCard title="Verification failed" description="Verification links can be used once and expire after 1 hour.">
        <div className="flex flex-col gap-4">
          <FormError message={callbackErrorMessage(params.error)} />
          <Link href="/login" className={buttonClasses({ size: "lg", className: "w-full" })}>
            Sign in to get a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (params.verified) {
    return (
      <AuthCard title="Email verified" description="Your email address is confirmed.">
        <Link href="/login?next=/onboarding" className={buttonClasses({ size: "lg", className: "w-full" })}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Check your inbox"
      description={
        email ? (
          <>
            We sent a verification link to <strong className="font-medium text-fg">{email}</strong>.
          </>
        ) : (
          "We sent you a verification link."
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center py-2">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/[0.07] text-accent-ink">
            <MailCheck className="size-6" aria-hidden="true" />
          </span>
        </div>
        <FormNotice>Open the link within 1 hour to activate your account. Check your spam folder if it doesn&apos;t arrive.</FormNotice>
        {email ? <ResendVerification email={email} /> : null}
        <Link href="/login" className="text-center text-[14px] text-fg-2 underline underline-offset-4 hover:text-fg">
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
