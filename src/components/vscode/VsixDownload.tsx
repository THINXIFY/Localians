import { ArrowUpRight, Download, Package, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";

const releaseUrl = `https://github.com/THINXIFY/Localians/releases/tag/vscode-v${vscodeExtension.vsix.version}`;

/** The download button: a link to the verified file when there is one; otherwise a disabled button that says so. */
export function VsixDownloadButton({ size = "lg", variant = "secondary", className }: { size?: "md" | "lg"; variant?: "primary" | "secondary"; className?: string }) {
  const { vsix } = vscodeExtension;
  const { downloadable, downloadHref } = vscodeAvailability();
  if (downloadable) {
    return (
      <a href={downloadHref} download={vsix.fileName} className={buttonClasses({ variant, size, className })} data-testid="vsix-download">
        <Download className="size-4" aria-hidden="true" />
        Download VSIX
      </a>
    );
  }
  return (
    <button type="button" disabled className={cn("inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-line px-6 font-medium text-fg-3", size === "lg" ? "h-12 text-[15px]" : "h-11 text-[14.5px]", className)} data-testid="vsix-disabled">
      <Download className="size-4" aria-hidden="true" />
      Download VSIX · Soon
    </button>
  );
}

/**
 * The manual-install file at a glance: what it is and the download (left), its details (right) and the SHA-256 to check
 * it against (bottom). Stacks on narrow screens; also used inside the docs' narrower column.
 */
export function VsixDownload({ className }: { className?: string }) {
  const { vsix } = vscodeExtension;
  const { downloadable, githubMirror } = vscodeAvailability();
  const facts: [string, string][] = [
    ["Extension", vscodeExtension.displayName],
    ["Version", vsix.version],
    ["Publisher", `${vscodeExtension.publisherName} (${vscodeExtension.id})`],
    ["Requires", `VS Code ${vscodeExtension.minVscode} or newer`],
    ["File", `${vsix.fileName} · ${vsix.size}`],
  ];
  return (
    <div className={cn("surface hairline-top @container overflow-hidden", className)} data-testid="vsix-card">
      <div className="grid grid-cols-[minmax(0,1fr)] @2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent" aria-hidden="true">
              <Package className="size-5" />
            </span>
            <span
              className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]", downloadable ? "border-accent/30 bg-accent/10 text-accent" : "border-line-strong text-fg-3")}
              data-testid="vsix-status"
            >
              {downloadable ? "Available" : "Release pending"}
            </span>
          </div>
          <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.02em] text-fg sm:text-[22px]">Localians for VS Code {vsix.version}</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">Free · Windows, macOS and Linux · installs in VS Code with Install from VSIX.</p>

          <div className="mt-6 flex flex-col gap-3 @md:flex-row @md:flex-wrap @md:items-center">
            <VsixDownloadButton variant="primary" className="w-full @md:w-auto" />
            {githubMirror ? (
              <a href={vsix.url} download={vsix.fileName} className={buttonClasses({ variant: "ghost", size: "lg", className: "w-full @md:w-auto" })} data-testid="vsix-github">
                GitHub mirror <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-fg-3">
            {downloadable ? (
              <>
                {vsix.size}, downloaded from this site.{" "}
                {githubMirror ? (
                  <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-fg hover:underline">
                    Release notes on GitHub
                  </a>
                ) : (
                  "A GitHub Releases mirror follows."
                )}
              </>
            ) : (
              "The download opens when the first release is published. Nothing to download yet."
            )}
          </p>
        </div>

        <dl className="min-w-0 divide-y divide-line border-t border-line bg-tint/[0.02] px-5 sm:px-7 @2xl:border-l @2xl:border-t-0 @2xl:py-3">
          {facts.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 py-3 @sm:flex-row @sm:items-baseline @sm:justify-between @sm:gap-4">
              <dt className="shrink-0 text-[12.5px] text-fg-3">{k}</dt>
              <dd className="min-w-0 break-words text-[14px] text-fg @sm:text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-t border-line px-5 py-4 sm:px-7">
        <p className="flex items-center gap-1.5 text-[12px] text-fg-3">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          SHA-256 checksum
        </p>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-black/30 py-1.5 pl-3 pr-1.5">
          <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed text-fg" data-testid="vsix-sha256">
            {vsix.sha256}
          </code>
          <CopyButton value={vsix.sha256} label="Copy SHA-256 checksum" />
        </div>
      </div>
    </div>
  );
}

const kbd = "rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="surface flex min-w-0 flex-col p-5">
      <span className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-mono text-[12px] text-accent" aria-hidden="true">
          {n}
        </span>
        <span className="text-[15px] font-semibold text-fg">{title}</span>
      </span>
      <div className="mt-3 min-w-0 text-[14px] leading-relaxed text-fg-2">{children}</div>
    </li>
  );
}

/** How to install the file by hand, how to verify it, and what that means for updates. Shared by the page and the docs. */
export function VsixInstallSteps({ className }: { className?: string }) {
  const { vsix } = vscodeExtension;
  return (
    <div className={cn("@container flex flex-col gap-4", className)} data-testid="vsix-steps">
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Step n={1} title="Download">
          Save <code className="break-all font-mono text-[13px] text-fg">{vsix.fileName}</code> with the Download VSIX button.
        </Step>
        <Step n={2} title="Check it (recommended)">
          Its SHA-256 must equal the checksum above.
          <pre className="mt-2.5 overflow-x-auto rounded-xl border border-line bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-fg">{`# Windows PowerShell
Get-FileHash .\\${vsix.fileName} -Algorithm SHA256

# macOS / Linux
shasum -a 256 ${vsix.fileName}`}</pre>
        </Step>
        <Step n={3} title="Install from VSIX">
          Open <strong className="font-medium text-fg">Extensions</strong> (<kbd className={kbd}>Ctrl</kbd>+<kbd className={kbd}>Shift</kbd>+<kbd className={kbd}>X</kbd>, or <kbd className={kbd}>Cmd</kbd>+
          <kbd className={kbd}>Shift</kbd>+<kbd className={kbd}>X</kbd> on a Mac), click the <strong className="font-medium text-fg">… (Views and More Actions)</strong> menu at the top right, choose{" "}
          <strong className="font-medium text-fg">Install from VSIX…</strong> and select the file. Or run <strong className="font-medium text-fg">Extensions: Install from VSIX…</strong> from the Command Palette.
        </Step>
        <Step n={4} title="Connect">
          Open the Localians view in the activity bar and click <strong className="font-medium text-fg">Connect to Localians</strong>. Reload VS Code first if it asks you to.
        </Step>
      </ol>
      <div className="rounded-xl border border-line bg-tint/[0.02] p-4 text-[13.5px] leading-relaxed text-fg-2" data-testid="vsix-updates-note">
        <strong className="font-medium text-fg">About updates.</strong> An extension installed from a .vsix file does <strong className="font-medium text-fg">not</strong> receive automatic updates from the
        Marketplace by default. To update, download the newer .vsix and install it the same way (it replaces the old one). Once the extension is on the Marketplace, install it from there to get automatic
        updates.
      </div>
    </div>
  );
}
