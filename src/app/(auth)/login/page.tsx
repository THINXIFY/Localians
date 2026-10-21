import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Divider } from "@/components/auth/AuthCard";
import { GithubButton } from "@/components/auth/GithubButton";
import { LoginForm } from "@/components/auth/LoginForm";
import { callbackErrorMessage } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/validation/auth";
import { githubConfigured } from "@/server/auth";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Sign In", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getSession()) redirect(next);

  const notice =
    params.reason === "expired"
      ? "Your session has expired. Please sign in again."
      : params.reason === "signed-out"
        ? "You've been signed out."
        : null;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to manage your projects and previews."
      footer={
        <>
          New to Localians?{" "}
          <Link href={`/signup${params.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-fg underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <GithubButton enabled={githubConfigured} next={next} />
      <Divider label="or" />
      <LoginForm next={next} notice={notice} initialError={callbackErrorMessage(params.error)} />
    </AuthCard>
  );
}
