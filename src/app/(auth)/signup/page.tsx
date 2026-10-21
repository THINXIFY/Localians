import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Divider } from "@/components/auth/AuthCard";
import { GithubButton } from "@/components/auth/GithubButton";
import { SignupForm } from "@/components/auth/SignupForm";
import { githubConfigured } from "@/server/auth";
import { getSession } from "@/server/session";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free Localians account and start sharing your localhost.",
};

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <AuthCard
      title="Create your account"
      description="Free during the beta. Share your first localhost preview in minutes."
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
