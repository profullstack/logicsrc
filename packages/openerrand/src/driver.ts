/**
 * The browser as the run loop sees it. {@link Driver} is an interface so the
 * loop (gates, outcomes, loop detection) is tested against a scripted fake;
 * {@link openCdpDriver} is the real one, on Chrome over CDP.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Browser, launchBrowser, plainUserAgent } from "./browser.js";
import type { Errand, Field, Page } from "./types.js";
import { ErrandError, sleep } from "./util.js";

export type FillAction = { kind: "text" | "select"; value: string } | { kind: "check" };

export interface DownloadedFile {
  url: string;
  filename: string;
  path: string;
}

export interface Driver {
  goto(url: string): Promise<void>;
  /** The current URL, read from the browser without running script on the page. */
  url(): Promise<string>;
  read(): Promise<Page>;
  /** Which of these CSS selectors find an element on the current page. */
  selectorHits(selectors: string[]): Promise<Record<string, boolean>>;
  fill(field: Field, action: FillAction): Promise<boolean>;
  /** Press the page's forward button. Returns its label, or `?a|b` with the buttons seen when none fits. */
  submit(): Promise<string>;
  /** Wait for the page that follows a submit to load. */
  settle(): Promise<void>;
  /** Files the site handed over during this run, completed. */
  downloads(): DownloadedFile[];
  /** Run script in the page. Used only by a captcha solver the errand allows; never on an identity provider's page. */
  evaluate(expression: string): Promise<unknown>;
  close(): Promise<void>;
}

const DEFAULT_LABELS = "^(submit|continue|next|send|verify|confirm|sign ?in|log ?in)$";
const DEFAULT_NEVER = "^(back|cancel|previous)$";
const DEFAULT_IGNORE = "#timer, .modal";

/** Every visible, enabled control, with the label a person would read for it. Values are never read. */
export function readPageScript(ignore: string): string {
  return `(() => {
  const IGNORE = ${JSON.stringify(ignore)};
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const clean = (s) => (s || '').replace(/\\*\\s*Required Field/gi, '').replace(/\\s+/g, ' ').trim();
  const ignored = (el) => { try { return !!el.closest(IGNORE); } catch { return false; } };
  const forLabel = (el) => el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
  const labelOf = (el) => {
    const byFor = forLabel(el);
    const wrap = el.closest('label');
    const group = el.closest('fieldset, .form-group, .row');
    const legend = group && group.querySelector('legend, .col-form-label');
    return clean((byFor && byFor.innerText) || el.getAttribute('aria-label') || (wrap && wrap.innerText) || (legend && legend.innerText) || el.placeholder || '');
  };
  const selectorOf = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]' + (el.type === 'radio' || el.type === 'checkbox' ? '[value="' + CSS.escape(el.value) + '"]' : '');
    return null;
  };
  const controls = [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => !['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(el.type) && !el.disabled && visible(el) && !ignored(el));
  let lastSelect = null;
  const fields = [];
  for (const el of controls) {
    if (el.tagName === 'SELECT') lastSelect = el;
    const selector = selectorOf(el);
    if (!selector) continue;
    const choice = el.type === 'radio' || el.type === 'checkbox';
    const own = clean(((el.closest('label') || forLabel(el) || {}).innerText) || '');
    const group = el.closest('fieldset, .form-group');
    const label = choice ? (own || labelOf(el)) : labelOf(el);
    const printed = group ? clean([...group.querySelectorAll('p, span, div')].map((n) => n.children.length ? '' : n.innerText).join(' ')) : '';
    fields.push({
      selector,
      id: el.id || '',
      name: el.name || '',
      type: el.type,
      label,
      required: el.required || el.getAttribute('aria-required') === 'true',
      options: el.tagName === 'SELECT' ? [...el.options].map((o) => ({ value: o.value, text: o.text.trim() })) : undefined,
      question: el.tagName !== 'SELECT' && !choice ? (lastSelect && lastSelect.selectedIndex > 0 ? lastSelect.options[lastSelect.selectedIndex].text.trim() : (printed || undefined)) : undefined,
      groupChecked: el.type === 'radio' && el.name ? !!document.querySelector('input[type=radio][name="' + CSS.escape(el.name) + '"]:checked') : undefined,
    });
  }
  const errors = [...document.querySelectorAll('.alert-danger, .validation-summary-errors li, .field-validation-error, .error-message, .invalid-feedback, [role=alert]')]
    .filter((n) => visible(n) && !ignored(n)).map((n) => clean(n.innerText)).filter(Boolean);
  return { url: location.href, title: document.title, text: clean(document.body ? document.body.innerText : '').slice(0, 6000), errors: [...new Set(errors)], fields };
})()`;
}

/** Set a value with the element's native setter, then fire input, change and blur so the page's own validation sees it. */
export function fillScript(selector: string, action: FillAction): string {
  const target = `document.querySelector(${JSON.stringify(selector)})`;
  if (action.kind === "check") {
    return `(() => { const el = ${target}; if (el && !el.checked) el.click(); return !!el && el.checked; })()`;
  }
  return `(() => {
    const el = ${target}; if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(action.value)});
    for (const type of ['input', 'change', 'blur']) el.dispatchEvent(new Event(type, { bubbles: true }));
    return el.value === ${JSON.stringify(action.value)};
  })()`;
}

/**
 * The page's own forward button: a label from `submit.labels`, else the only
 * other button; never one matching `submit.never` or inside `submit.ignore`.
 */
export function submitScript(submit: Errand["submit"]): string {
  const labels = submit?.labels ?? DEFAULT_LABELS;
  const never = submit?.never ?? DEFAULT_NEVER;
  const ignore = submit?.ignore ?? DEFAULT_IGNORE;
  return `(() => {
  const LABELS = new RegExp(${JSON.stringify(labels)}, 'i');
  const NEVER = new RegExp(${JSON.stringify(never)}, 'i');
  const IGNORE = ${JSON.stringify(ignore)};
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const ignored = (el) => { try { return !!el.closest(IGNORE); } catch { return false; } };
  const text = (b) => (b.innerText || b.value || '').replace(/\\s+/g, ' ').trim();
  const buttons = [...document.querySelectorAll('button, input[type=submit], input[type=button]')]
    .filter((b) => visible(b) && !b.disabled && !ignored(b) && text(b) && !NEVER.test(text(b)));
  const pick = buttons.find((b) => LABELS.test(text(b))) || (buttons.length === 1 ? buttons[0] : null);
  if (!pick) return '?' + buttons.map(text).join('|');
  pick.click();
  return text(pick);
})()`;
}

export interface CdpDriverOptions {
  errand: Errand;
  chrome?: string;
  headless: boolean;
  profile?: string;
  pageTimeoutMs: number;
  /** Where downloads land before they are filed. */
  downloadDir?: string;
  args?: string[];
  /** Pause after each load so a page's own scripts finish (default 1500 ms). */
  settleMs?: number;
}

/** The plain user agent of each Chrome binary, learned once per process. */
const plainAgents = new Map<string, string | null>();

export async function openCdpDriver(options: CdpDriverOptions): Promise<Driver> {
  const launch = (extra: string[]): Promise<Browser> =>
    launchBrowser({
      ...(options.chrome ? { chrome: options.chrome } : {}),
      ...(options.profile ? { profile: options.profile } : {}),
      headless: options.headless,
      timeoutMs: 30_000,
      args: [...(options.args ?? []), ...extra],
    });
  // Rule 11. A CDP user-agent override does not reach every request (a
  // navigation the page's own script starts still says HeadlessChrome), so
  // the plain string is given to Chrome at launch: the browser's own user
  // agent with "HeadlessChrome" replaced by "Chrome", and nothing else.
  const key = options.chrome ?? "default";
  let browser: Browser;
  if (options.headless && plainAgents.has(key)) {
    const plain = plainAgents.get(key);
    browser = await launch(plain ? [`--user-agent=${plain}`] : []);
  } else {
    browser = await launch([]);
    if (options.headless) {
      const { userAgent } = (await browser.cdp.send("Browser.getVersion")) as { userAgent: string };
      const plain = plainUserAgent(userAgent);
      plainAgents.set(key, plain);
      if (plain) {
        await browser.close();
        browser = await launch([`--user-agent=${plain}`]);
      }
    }
  }
  const { cdp } = browser;
  const settleMs = options.settleMs ?? 1_500;
  try {
    const { targetInfos } = (await cdp.send("Target.getTargets")) as { targetInfos: Array<{ targetId: string; type: string }> };
    let targetId = targetInfos.find((t) => t.type === "page")?.targetId;
    if (!targetId) ({ targetId } = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string });
    const { sessionId } = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
    await cdp.send("Page.enable", {}, sessionId);

    const downloads: DownloadedFile[] = [];
    if (options.downloadDir) {
      await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: options.downloadDir, eventsEnabled: true });
      const begun = new Map<string, { url: string; filename: string }>();
      cdp.on((event) => {
        if (event.method === "Browser.downloadWillBegin") {
          begun.set(String(event.params.guid), { url: String(event.params.url), filename: String(event.params.suggestedFilename) });
        } else if (event.method === "Browser.downloadProgress" && event.params.state === "completed") {
          const guid = String(event.params.guid);
          const meta = begun.get(guid);
          const path = join(options.downloadDir!, guid);
          if (meta && existsSync(path)) downloads.push({ ...meta, path });
        }
      });
    }

    const evaluate = async <T>(expression: string): Promise<T | null> => {
      try {
        const { result, exceptionDetails } = (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)) as {
          result: { value?: unknown };
          exceptionDetails?: unknown;
        };
        return exceptionDetails ? null : ((result.value ?? null) as T | null);
      } catch {
        return null;
      }
    };
    const ignore = options.errand.submit?.ignore ?? DEFAULT_IGNORE;
    let pending: Promise<void> | null = null;

    return {
      async goto(url) {
        const loaded = cdp.waitFor("Page.loadEventFired", sessionId, options.pageTimeoutMs).catch(() => undefined);
        const result = (await cdp.send("Page.navigate", { url }, sessionId)) as { errorText?: string };
        if (result.errorText) throw new ErrandError(`could not open ${url}: ${result.errorText}`);
        await loaded;
        await sleep(settleMs);
      },
      async url() {
        const { targetInfo } = (await cdp.send("Target.getTargetInfo", { targetId })) as { targetInfo: { url: string } };
        return targetInfo.url;
      },
      async read() {
        const page = await evaluate<Page>(readPageScript(ignore));
        if (!page) throw new ErrandError("could not read the page");
        return page;
      },
      async selectorHits(selectors) {
        if (!selectors.length) return {};
        const hits = await evaluate<Record<string, boolean>>(
          `(() => { const out = {}; for (const s of ${JSON.stringify(selectors)}) { try { out[s] = !!document.querySelector(s); } catch { out[s] = false; } } return out; })()`,
        );
        return hits ?? {};
      },
      async fill(field, action) {
        return (await evaluate<boolean>(fillScript(field.selector, action))) === true;
      },
      async submit() {
        const loaded = cdp.waitFor("Page.loadEventFired", sessionId, options.pageTimeoutMs).catch(() => undefined);
        const pressed = (await evaluate<string>(submitScript(options.errand.submit))) ?? "?";
        if (!pressed.startsWith("?")) pending = loaded;
        else void loaded;
        return pressed;
      },
      async settle() {
        await Promise.race([pending ?? Promise.resolve(), sleep(options.pageTimeoutMs)]);
        pending = null;
        await sleep(settleMs);
      },
      downloads: () => [...downloads],
      evaluate: (expression) => evaluate(expression),
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** A download is what its media type says, checked by its first bytes. Unknown types are refused. */
export function looksLike(type: string, head: Buffer): boolean {
  const starts = (bytes: number[]): boolean => bytes.every((b, i) => head[i] === b);
  if (type === "application/pdf") return starts([0x25, 0x50, 0x44, 0x46]);
  if (type === "image/png") return starts([0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (type === "application/zip") return starts([0x50, 0x4b, 0x03, 0x04]);
  if (type === "application/json") {
    try {
      JSON.parse(head.toString("utf8"));
      return true;
    } catch {
      return false;
    }
  }
  if (type.startsWith("text/")) return !head.includes(0);
  return false;
}
