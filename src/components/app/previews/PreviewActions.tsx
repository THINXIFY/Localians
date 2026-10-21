"use client";

import { ArrowUpRight, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { stopPreviewAction } from "@/server/actions/previews";
import { Dialog } from "../Dialog";
import { CopyLabelButton } from "../share/Command";
import { useToast } from "../Toast";

export type PreviewActionTarget = {
  id: string;
  publicUrl: string | null;
  /** The preview may still be serving (connecting / connected / reconnecting). */
  active: boolean;
  canStop: boolean;
  projectName: string;
};

const small = "h-8 px-3 text-[12.5px]";

/** Copy Link / Open Preview / Stop Sharing. Ended previews get none: their link no longer works. */
export function PreviewActions({ preview, className }: { preview: PreviewActionTarget; className?: string }) {
  if (!preview.active || !preview.publicUrl) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <CopyLabelButton value={preview.publicUrl} label="Copy Link" size="sm" ariaLabel={`Copy preview link for ${preview.projectName}`} />
      <a
        href={preview.publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open preview of ${preview.projectName} in a new tab`}
        className={buttonClasses({ variant: "secondary", size: "sm", className: small })}
      >
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
        Open Preview
      </a>
      {preview.canStop ? <StopPreviewButton preview={preview} /> : null}
    </div>
  );
}

export function StopPreviewButton({ preview, size = "xs" }: { preview: PreviewActionTarget; size?: "xs" | "sm" }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);

  async function stop() {
    setStopping(true);
    const result = await stopPreviewAction(preview.id);
    setStopping(false);
    if (!result.ok) return toast.error(result.error);
    setOpen(false);
    const { outcome, gateway } = result.data;
    if (outcome === "already_ended" && gateway === "not_needed") toast.success("This preview had already stopped.");
    else if (gateway === "confirmed") toast.success("Sharing stopped. The link no longer reaches your app.");
    else toast.success("Sharing stopped. It may take up to 20 seconds before the link stops working.");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Stop sharing ${preview.projectName}`}
        className={cn("border-danger/35 text-danger hover:border-danger/50 hover:bg-danger/[0.08]", size === "xs" ? small : "h-10")}
      >
        <Square className="size-3.5" aria-hidden="true" />
        Stop Sharing
      </Button>
      <Dialog
        open={open}
        busy={stopping}
        onClose={() => setOpen(false)}
        title="Stop this preview?"
        description="Anyone using this link will lose access to the local application. You can start a new sharing session from your terminal."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={stopping} onClick={() => setOpen(false)} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" loading={stopping} onClick={stop}>
            Stop Sharing
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** Open-preview button for page headers. */
export function OpenPreviewLink({ url, label = "Open Preview" }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}
