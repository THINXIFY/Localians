import { ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";

/** The download button: a link only when the GitHub Release is public; otherwise a disabled button that says so. */
export function VsixDownloadButton({ size = "lg", className }: { size?: "md" | "lg"; className?: string }) {
  const { vsix } = vscodeExtension;
  if (vscodeAvailability().downloadable) {
    return (
      <a href={vsix.url} download={vsix.fileName} className={buttonClasses({ variant: "secondary", size, className })} data-testid="vsix-download">
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
 * The manual-install file at a glance: name, version, publisher, supported VS Code versions, size and SHA-256, with the
 * download button. Always shown (also before the release is public: the button is then disabled and says why).
 */
export function VsixDownload({ className }: { className?: string }) {
  const { vsix } = vscodeExtension;
  const { downloadable } = vscodeAvailability();
  const facts: [string, string][] = [
    ["Extension", vscodeExtension.displayName],
    ["Version", vsix.version],
    ["Publisher", `${vscodeExtension.publisherName} (${vscodeExtension.id})`],
    ["Requires", `VS Code ${vscodeExtension.minVscode} or newer`],
    ["File", `${vsix.fileName} · ${vsix.size}`],
  ];
  return (
    <div className={cn("surface hairline-top p-5 sm:p-7", className)} data-testid="vsix-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">Localians for VS Code {vsix.version}</h3>
        <span
          className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]", downloadable ? "border-accent/30 bg-accent/10 text-accent" : "border-line-strong text-fg-3")}
          data-testid="vsix-status"
        >
          {downloadable ? "Available" : "Release pending"}
        </span>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[12px] text-fg-3">{k}</dt>
            <dd className="mt-0.5 break-words text-[14.5px] text-fg">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 min-w-0">
        <p className="flex items-center gap-1.5 text-[12px] text-fg-3">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          SHA-256 checksum
        </p>
        <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-line bg-black/30 px-3 py-2.5">
          <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed text-fg" data-testid="vsix-sha256">
            {vsix.sha256}
          </code>
          <CopyButton value={vsix.sha256} label="Copy SHA-256 checksum" />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <VsixDownloadButton className="w-full sm:w-auto" />
        {downloadable ? (
          <a href={`https://github.com/THINXIFY/Localians/releases/tag/vscode-v${vsix.version}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 text-[13.5px] text-fg-3 underline-offset-4 hover:text-fg hover:underline">
            Release notes on GitHub <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        ) : (
          <p className="text-[13px] leading-relaxed text-fg-3">The download opens when the first release is published. Nothing to download yet.</p>
        )}
      </div>
    </div>
  );
}

/** How to install the file by hand, how to verify it, and what that means for updates. Shared by the page and the docs. */
export function VsixInstallSteps({ className }: { className?: string }) {
  const { vsix } = vscodeExtension;
  return (
    <div className={cn("flex flex-col gap-5", className)} data-testid="vsix-steps">
      <ol className="list-decimal space-y-3 pl-5 text-[14.5px] leading-relaxed text-fg-2 marker:text-fg-3">
        <li>
          <strong className="font-medium text-fg">Download</strong> <code className="font-mono text-[13px] text-fg">{vsix.fileName}</code> from the button above and save it somewhere you can find it.
        </li>
        <li>
          <strong className="font-medium text-fg">Check it (recommended).</strong> The file&apos;s SHA-256 must equal the checksum shown above.
          <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-black/40 p-3 font-mono text-[12.5px] leading-relaxed text-fg">{`# Windows PowerShell
Get-FileHash .\\${vsix.fileName} -Algorithm SHA256

# macOS / Linux
shasum -a 256 ${vsix.fileName}`}</pre>
        </li>
        <li>
          <strong className="font-medium text-fg">Open VS Code → Extensions</strong> (<kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg">Ctrl</kbd>+<kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg">Shift</kbd>+
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg">X</kbd>, or <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg">Cmd</kbd>+
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg">Shift</kbd>+<kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[12px] text-fg">X</kbd> on a Mac).
        </li>
        <li>
          Click the <strong className="font-medium text-fg">… (Views and More Actions)</strong> menu at the top right of the Extensions panel, choose <strong className="font-medium text-fg">Install from VSIX…</strong>,
          and select the downloaded file. (Or run <strong className="font-medium text-fg">Extensions: Install from VSIX…</strong> from the Command Palette.)
        </li>
        <li>
          <strong className="font-medium text-fg">Connect.</strong> Open the Localians view in the activity bar and click <strong className="font-medium text-fg">Connect to Localians</strong>. Reload VS Code first if it asks you to.
        </li>
      </ol>
      <div className="rounded-xl border border-line bg-tint/[0.02] p-4 text-[13.5px] leading-relaxed text-fg-2" data-testid="vsix-updates-note">
        <strong className="font-medium text-fg">About updates.</strong> An extension installed from a .vsix file does <strong className="font-medium text-fg">not</strong> receive automatic updates from the
        Marketplace by default. To update, download the newer .vsix and install it the same way (it replaces the old one). Once the extension is on the Marketplace, install it from there to get automatic
        updates.
      </div>
    </div>
  );
}
