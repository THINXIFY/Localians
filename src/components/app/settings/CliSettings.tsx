"use client";

import { Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { revokeCliCredentialAction } from "@/server/actions/cli";
import { SettingsPanel } from "../Primitives";
import { useToast } from "../Toast";

type Row = { id: string; name: string; tokenPrefix: string; created: string; lastUsed: string; expires: string };

export function CliCredentialsPanel({ credentials }: { credentials: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  return (
    <SettingsPanel
      title="CLI logins"
      description="Computers where the Localians CLI is signed in to this workspace. Revoking one signs it out and stops its active shares."
    >
      {credentials.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {credentials.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <Terminal className="hidden size-4 shrink-0 text-fg-3 sm:block" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-fg">{c.name}</p>
                <p className="text-[12px] text-fg-3">
                  <span className="font-mono">{c.tokenPrefix}…</span> · Created {c.created} · Last used {c.lastUsed} · Expires {c.expires}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={pending === c.id}
                aria-label={`Revoke ${c.name}`}
                onClick={async () => {
                  setPending(c.id);
                  const result = await revokeCliCredentialAction(c.id);
                  setPending(null);
                  if (!result.ok) return toast.error(result.error);
                  toast.success("CLI access revoked.");
                  router.refresh();
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-fg-2">
          No CLI logins yet. Run <code className="font-mono text-fg">localians login</code> in your terminal to connect one.
        </p>
      )}
    </SettingsPanel>
  );
}
