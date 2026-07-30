"use client";

import { useEffect } from "react";

// One delegated listener for every `[data-copy]` button on the page.
//
// Delegation rather than a handler per button because the markup these target
// is server-rendered in two different ways -- the homepage arrives as an HTML
// string through dangerouslySetInnerHTML, the rest as JSX -- and a listener on
// `document` does not care which. It also means a new copy button anywhere on
// the site needs no wiring, just the attribute.
export function CopyButtons(): null {
  useEffect(() => {
    const flash = (button: HTMLButtonElement, message: string): void => {
      const original = button.dataset.copyLabel ?? button.textContent ?? "Copy";
      button.dataset.copyLabel = original;
      button.textContent = message;
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, 1600);
    };

    // navigator.clipboard is undefined outside a secure context, which includes
    // plain-http previews and older Safari. Falling back to a throwaway
    // textarea keeps the button honest there instead of silently doing nothing.
    const legacyCopy = (text: string): boolean => {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      field.remove();
      return copied;
    };

    const onClick = async (event: MouseEvent): Promise<void> => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button[data-copy]");
      if (!button) return;

      const text = button.dataset.copy ?? "";
      if (!text) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          flash(button, "Copied");
          return;
        }
      } catch {
        // permission denied or a non-secure context -- fall through
      }
      flash(button, legacyCopy(text) ? "Copied" : "Press Ctrl+C");
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
