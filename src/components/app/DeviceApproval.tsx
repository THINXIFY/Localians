"use client";

import { CheckCircle2, Terminal, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { decideDeviceAction, lookupDeviceCodeAction } from "@/server/actions/cli";
import { Field, FormError, TextInput } from "./Field";

type Step = { kind: "enter" } | { kind: "confirm"; userCode: string; clientName: string } | { kind: "done"; approved: boolean };

type Props = {
  initialCode: string;
  /** Resolved on the server when the CLI's link carried a valid pending code. */
  initialRequest: { userCode: string; clientName: string } | null;
  initialError: string | null;
  email: string;
  /** Workspaces the user belongs to (current first). The CLI login is limited to the one chosen. */
  workspaces: { id: string; name: string }[];
};

export function DeviceApproval({ initialCode, initialRequest, initialError, email, workspaces }: Props) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [code, setCode] = useState(initialCode);
  const [step, setStep] = useState<Step>(initialRequest ? { kind: "confirm", ...initialRequest } : { kind: "enter" });
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState<"lookup" | "approve" | "deny" | null>(null);

  async function lookup(value: string) {
    setError(null);
    setPending("lookup");
    const result = await lookupDeviceCodeAction(value);
    setPending(null);
    if (!result.ok) return setError(result.error);
    setStep({ kind: "confirm", ...result.data });
  }

  async function decide(approve: boolean) {
    if (step.kind !== "confirm") return;
    setError(null);
    setPending(approve ? "approve" : "deny");
    const result = await decideDeviceAction(step.userCode, approve, workspaces.length > 1 ? workspaceId : undefined);
    setPending(null);
    if (!result.ok) return setError(result.error);
    setStep({ kind: "done", approved: approve });
  }

  return (
    <div className="rounded-[20px] border border-line bg-card/90 p-6 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)] backdrop-blur sm:p-8">
      <span className="flex size-11 items-center justify-center rounded-xl border border-line-strong bg-tint/[0.03] text-fg-2">
        <Terminal className="size-5" aria-hidden="true" />
      </span>

      {step.kind === "done" ? (
        <div className="mt-5" role="status">
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-fg">
            {step.approved ? <CheckCircle2 className="size-5 text-accent-ink" aria-hidden="true" /> : <XCircle className="size-5 text-danger" aria-hidden="true" />}
            {step.approved ? "CLI authorized" : "Request denied"}
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">
            {step.approved ? "You can close this tab. Your terminal carries on by itself — sharing starts in a moment." : "The CLI was not given access. You can close this tab."}
          </p>
        </div>
      ) : step.kind === "confirm" ? (
        <div className="mt-5">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">Authorize the Localians CLI?</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">Only approve if you just ran a Localians command (such as <code className="font-mono text-fg">localians share</code>) on your own computer.</p>
          <dl className="mt-5 divide-y divide-line rounded-xl border border-line text-[13.5px]">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-fg-3">Code</dt>
              <dd className="font-mono font-medium tracking-[0.12em] text-fg">{step.userCode}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-fg-3">Device</dt>
              <dd className="min-w-0 truncate text-right text-fg">{step.clientName}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-fg-3">Account</dt>
              <dd className="min-w-0 truncate text-right text-fg">{email}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-fg-3">Workspace</dt>
              <dd className="min-w-0 text-right text-fg">
                {workspaces.length > 1 ? (
                  <select
                    aria-label="Workspace this computer can share into"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    className="max-w-[220px] rounded-lg border border-line-strong bg-bg-2 px-2 py-1 text-[13.5px] text-fg"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="block truncate">{workspaces[0]?.name}</span>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-fg-3">
            The CLI will be able to create projects and share your local apps through preview links in this workspace. It can&apos;t read
            your password or change account settings. You can revoke it any time in Settings → CLI.
          </p>
          <div className="mt-4">
            <FormError message={error} />
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => decide(false)} loading={pending === "deny"} disabled={pending !== null}>
              Deny
            </Button>
            <Button onClick={() => decide(true)} loading={pending === "approve"} disabled={pending !== null}>
              Authorize CLI
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(code);
          }}
        >
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">Connect the Localians CLI</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">Enter the code shown in your terminal.</p>
          </div>
          <FormError message={error} />
          <Field label="Device code">
            {(p) => (
              <TextInput
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                className="font-mono text-[16px] tracking-[0.18em]"
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={pending === "lookup"} disabled={!code.trim()}>
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}
