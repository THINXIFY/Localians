"use client";

import { ArrowUpRight, Link2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PassOffer } from "@/lib/offer";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { suggestName } from "@/lib/preview-names";
import { claimNameAction, releaseNameAction } from "@/server/actions/names";
import { Dialog } from "../Dialog";
import { FormError, inputClasses } from "../Field";
import { CopyLabelButton } from "../share/Command";
import { useToast } from "../Toast";
import { type NameCheck, NameField } from "./NameField";

export type CustomUrlState = { name: string | null; url: string | null; canUse: boolean; previewDomain: string | null };

/**
 * A project's custom preview URL (7-Day Pass): claim one, change it, or release it. Every preview of the project is
 * then served on it, and the project's password protection applies to it like to any link.
 */
export function CustomUrlPanel({ projectId, projectName, state, upgradeHref, offer }: { projectId: string; projectName: string; state: CustomUrlState; upgradeHref: string | null; offer: PassOffer }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => suggestName(projectName));
  const [check, setCheck] = useState<NameCheck>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const domain = state.previewDomain ?? "preview.localians.com";

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await claimNameAction(projectId, value);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    toast.success(`${result.data.name}.${domain} is yours.`);
    setEditing(false);
    router.refresh();
  }

  async function release() {
    setReleaseError(null);
    setSaving(true);
    const result = await releaseNameAction(projectId, confirm);
    setSaving(false);
    if (!result.ok) return setReleaseError(result.error);
    toast.success("Custom URL released.");
    setReleasing(false);
    setConfirm("");
    router.refresh();
  }

  const showForm = state.canUse && (!state.name || editing);
  return (
    <section id="custom-url" aria-labelledby="custom-url-title" className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-card" data-testid="custom-url-panel">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="custom-url-title" className="flex items-center gap-2 text-[15px] font-semibold text-fg">
          <Link2 className="size-4 text-fg-3" aria-hidden="true" />
          Custom URL
        </h2>
        <p className="text-[13px] leading-relaxed text-fg-2">A memorable link that stays the same every time you share this project.</p>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        {state.name && state.url && !editing ? (
          <>
            <p className="break-all font-mono text-[16px] text-fg" data-testid="custom-url">
              {state.url}
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyLabelButton value={state.url} label="Copy Link" />
              {state.canUse ? (
                <Button variant="secondary" size="sm" className="h-10" onClick={() => {
                    setEditing(true);
                    setValue(state.name!);
                  }}>
                  Change
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="h-10 text-fg-2" onClick={() => setReleasing(true)}>
                Release
              </Button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-fg-3">
              {state.canUse
                ? "Previews of this project use this link. When nothing is shared, visitors see that the preview is offline."
                : "This project's Preview Pass has ended, so sharing is paused. The URL stays reserved for 3 days — renew the pass to keep it."}
            </p>
          </>
        ) : null}

        {showForm ? (
          <form onSubmit={claim} className="flex flex-col gap-3">
            <NameField value={value} onChange={setValue} onCheck={setCheck} previewDomain={domain} label={state.name ? "New custom URL" : "Choose your custom URL"} />
            {state.name ? (
              <p className="text-[12.5px] leading-relaxed text-fg-3">
                Changing stops any preview on <span className="font-mono text-fg-2">{state.name}</span>, and that name can&apos;t be used by anyone else for 30 days.
              </p>
            ) : null}
            <FormError message={error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" className="h-10" loading={saving} disabled={!(check.state === "available" || check.state === "error")}>
                {state.name ? "Change URL" : "Claim URL"}
              </Button>
              {editing ? (
                <Button variant="ghost" size="sm" className="h-10" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {!state.canUse && !state.name ? (
          <div className="flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
            <p className="flex items-center gap-2 text-[14px] font-medium text-fg">
              <Sparkles className="size-4 text-accent-ink" aria-hidden="true" />
              <span>
                Get <span className="font-mono">{suggestName(projectName) || "your-app"}.{domain}</span>
              </span>
            </p>
            <p className="text-[13px] leading-relaxed text-fg-2">
              Custom URLs come with the {offer.shortName}: {offer.priceLabel} one-time for {offer.moreLabel} of sharing this project. No subscription.
            </p>
            {upgradeHref ? (
              <Link href={upgradeHref} className={buttonClasses({ size: "sm", className: "h-10 w-fit" })}>
                Upgrade for {offer.priceLabel}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <p className="text-[12.5px] text-fg-3">The {offer.shortName} is coming soon.</p>
            )}
          </div>
        ) : null}
      </div>

      <Dialog open={releasing} onClose={() => setReleasing(false)} title="Release this custom URL?" busy={saving} className="max-w-[480px]">
        <div className="flex flex-col gap-4 text-[13.5px] leading-relaxed text-fg-2">
          <p>
            Any preview on <span className="font-mono text-fg">{state.name}</span> stops right away, and the link stops working. Nobody else can claim it for 30 days; you can claim it again
            while this project has a Preview Pass.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">
              Type <span className="font-mono">{state.name}</span> to confirm
            </span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} className={inputClasses + " h-10 font-mono"} data-autofocus />
          </label>
          <FormError message={releaseError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReleasing(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={saving} disabled={confirm.trim().toLowerCase() !== state.name} onClick={release}>
              Release URL
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
