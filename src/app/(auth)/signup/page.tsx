import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Divider } from "@/components/auth/AuthCard";
import { GithubButton } from "@/components/auth/GithubButton";
import { SignupForm } from "@/components/auth/SignupForm";
import { githubConfigured } from "@/server/auth";
import { getSession } from "@/server/session";
import { pageMetadata } from "@/lib/seo";
import { routes } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Create a Free Account",
  description: "Create a free Localians account and share your localhost with a secure HTTPS preview link in about a minute.",
  path: routes.getStarted,
});

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <AuthCard
      title="Create your account"
      description="Free to start: every project gets a 24-hour preview. Share your first localhost preview in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-fg underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <GithubButton enabled={githubConfigured} next="/dashboard" label="Sign up with GitHub" />
      <Divider label="or" />
      <SignupForm />
    </AuthCard>
  );
}
