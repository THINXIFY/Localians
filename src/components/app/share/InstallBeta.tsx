"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { DisclosureChevron, summaryClasses } from "@/components/ui/Disclosure";
import { cn } from "@/lib/cn";
import { Command } from "./Command";

type Os = "windows" | "macos" | "linux";
const OS_LABEL: Record<Os, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };
const OS_ORDER: Os[] = ["windows", "macos", "linux"];

/**
 * One-time install of a locally built CLI (shown while LOCALIANS_CLI_PUBLISHED is off, e.g. local development), plus (for a local development
 * gateway) trusting its certificate. Collapsed by default: most visits don't need it.
 */
export function InstallBeta({ localGateway, defaultOpen = false }: { localGateway: boolean; defaultOpen?: boolean }) {
  const [os, setOs] = useState<Os>("windows");
  const id = useId();

  const install =
    os === "windows"
      ? "cd C:\\path\\to\\localians\nnpm install; npm run tunnel:build\ncd tunnel\\cli; npm link"
      : "cd ~/path/to/localians\nnpm install && npm run tunnel:build\ncd tunnel/cli && npm link";
  const trustCli =
    os === "windows"
      ? '$env:NODE_EXTRA_CA_CERTS = "C:\\path\\to\\localians\\.localians-dev\\certs\\ca.crt"'
      : "export NODE_EXTRA_CA_CERTS=~/path/to/localians/.localians-dev/certs/ca.crt";
  const trustBrowser =
    os === "windows"
      ? 'Import-Certificate -FilePath "C:\\path\\to\\localians\\.localians-dev\\certs\\ca.crt" -CertStoreLocation Cert:\\CurrentUser\\Root'
      : os === "macos"
        ? "sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain .localians-dev/certs/ca.crt"
        : 'sudo cp .localians-dev/certs/ca.crt /usr/local/share/ca-certificates/localians-dev.crt && sudo update-ca-certificates\ncertutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Localians dev CA" -i .localians-dev/certs/ca.crt';

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = OS_ORDER.indexOf(os);
    const next = e.key === "ArrowRight" ? OS_ORDER[(i + 1) % 3] : e.key === "ArrowLeft" ? OS_ORDER[(i + 2) % 3] : null;
    if (!next) return;
    e.preventDefault();
    setOs(next);
    document.getElementById(`${id}-${next}`)?.focus();
  }

  return (
    <details className="group rounded-xl border border-line bg-tint/[0.015]" open={defaultOpen}>
      <summary className={cn(summaryClasses, "flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13.5px] text-fg-2 transition-colors hover:bg-tint/[0.02]")}>
        <span>
          <strong className="font-medium text-fg">Don&apos;t have the Localians command yet?</strong> One-time setup (beta)
        </span>
        <DisclosureChevron className="size-3.5" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-4 text-[13px] leading-relaxed text-fg-2">
        <p>
          This server uses a locally built CLI, so install it once from a Localians checkout (Node.js 20+). The published
          <code className="font-mono text-[12px]"> npx localians</code> package talks to localians.com instead:
        </p>
        <div role="tablist" aria-label="Operating system" className="flex w-fit rounded-lg border border-line-strong bg-tint/[0.03] p-0.5">
          {OS_ORDER.map((value) => (
            <button
              key={value}
              id={`${id}-${value}`}
              type="button"
              role="tab"
              aria-selected={os === value}
              aria-controls={`${id}-panel`}
              tabIndex={os === value ? 0 : -1}
              onClick={() => setOs(value)}
              onKeyDown={onTabKey}
              className={cn("rounded-md px-2.5 py-1 text-[12.5px]", os === value ? "bg-tint/[0.09] font-medium text-fg" : "text-fg-2 hover:text-fg")}
            >
              {OS_LABEL[value]}
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${os}`} className="flex flex-col gap-3">
          <Command value={install} label="Copy install commands" />
          {localGateway ? (
            <>
              <p>
                This server uses a <strong className="font-medium text-fg">local development</strong> gateway with its own certificate. Trust it
                for the CLI (in the terminal you share from) and for your browsers — don&apos;t click through warnings. Production previews
                don&apos;t need this.
              </p>
              <Command value={trustCli} label="Copy CLI certificate command" />
              <Command value={trustBrowser} label="Copy browser certificate command" />
            </>
          ) : null}
        </div>
      </div>
    </details>
  );
}
