// The one-line CLI install, rendered as HTML so the string-built homepage
// (page-markup.ts) and the React chrome (SiteShell) can share one definition.
// Two renderings of the same command is how a shipped hint ends up disagreeing
// with itself, so there is deliberately only one here.

/**
 * The command, verbatim.
 *
 * The flags are not decoration. Without `-f`, curl prints an HTTP error body
 * and exits 0, so a 404 gets piped into `sh`; without `-L` the install breaks
 * the moment the URL redirects. `-sS` keeps the progress meter out of the pipe
 * while leaving real errors visible. This is the form install.sh documents in
 * its own header.
 */
export const INSTALL_COMMAND = "curl -fsSL https://logicsrc.com/install.sh | sh";

/** Where the script itself lives, for people who read before they pipe. */
export const INSTALL_SCRIPT_PATH = "/install.sh";

/**
 * A copy button. The command is static and contains no markup-significant
 * characters, so it goes into the attribute as-is; `copy-buttons.tsx` reads it
 * back out. Keeping the text on the button means the clipboard can never
 * disagree with what is on screen.
 */
function copyButton(className: string): string {
  return `<button type="button" class="${className}" data-copy="${INSTALL_COMMAND}" aria-label="Copy the install command">Copy</button>`;
}

/**
 * @param variant - `hero` is the homepage's unmissable version; `rail` is the
 *   compact one that rides along in the site chrome on every other page.
 */
export function renderInstallCommand(variant: "hero" | "rail"): string {
  if (variant === "rail") {
    return `<div class="install-rail">
      <span class="install-rail-label">Install the CLI</span>
      <div class="install-rail-row">
        <code>${INSTALL_COMMAND}</code>
        ${copyButton("install-copy install-copy-sm")}
      </div>
    </div>`;
  }

  return `<div class="install-cta">
    <p class="install-cta-label">Get the CLI</p>
    <div class="install-cta-row">
      <code class="install-cta-cmd">${INSTALL_COMMAND}</code>
      ${copyButton("install-copy")}
    </div>
    <p class="install-cta-note">macOS and Linux · needs Node 18+ · <a href="${INSTALL_SCRIPT_PATH}">read the script first</a></p>
  </div>`;
}
