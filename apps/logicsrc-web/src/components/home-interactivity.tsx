"use client";

import { useEffect } from "react";

// Client-side behavior for the LogicSRC page, ported from the legacy Vite
// main.ts: register the service worker, wire the hire-us project form, reflect
// CoinPay connection status on the Connect button, and scroll to the section
// that matches the current path. The markup these hooks target is rendered on
// the server by `renderPageMarkup`.
export function HomeInteractivity(): null {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    }

    const buildParagraph = (text: string): HTMLParagraphElement => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      return paragraph;
    };

    const form = document.querySelector<HTMLFormElement>("#project-request-form");
    const onSubmit = async (event: Event): Promise<void> => {
      event.preventDefault();
      const button = document.querySelector<HTMLButtonElement>("#project-request-button");
      const result = document.querySelector<HTMLDivElement>("#project-request-result");
      const contact = document.querySelector<HTMLInputElement>("#project-contact");
      const project = document.querySelector<HTMLTextAreaElement>("#project-description");
      if (!button || !result || !contact || !project) return;

      button.disabled = true;
      button.textContent = "Submitting...";
      result.replaceChildren(buildParagraph("Submitting project request."));

      try {
        const response = await fetch("/api/hire-us/project-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contact: contact.value, project: project.value })
        });
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Project request could not be submitted.");
        }

        result.replaceChildren(
          buildParagraph("Request received. If it is a fit, we will send a $250/week recurring CoinPay invoice.")
        );
      } catch (error) {
        result.replaceChildren(
          buildParagraph(error instanceof Error ? error.message : "Project request could not be submitted.")
        );
      } finally {
        button.disabled = false;
        button.textContent = "Request review";
      }
    };
    form?.addEventListener("submit", onSubmit);

    // Scroll to the section that matches the current path (mirrors the SPA).
    const { pathname } = window.location;
    if (pathname === "/agent-swarm") {
      document.querySelector("#agent-swarm")?.scrollIntoView();
    } else if (pathname === "/agentbyte") {
      document.querySelector("#agentbyte")?.scrollIntoView();
    } else {
      const pageRoute = pathname.slice(1);
      if (
        ["docs", "blog", "openspec", "credential-sharing", "hire-us", "about", "terms", "privacy"].includes(pageRoute)
      ) {
        document.querySelector(`#${pageRoute}`)?.scrollIntoView();
      }
    }

    // CoinPay OAuth connection status: clean the query param and reflect state.
    const coinpayParam = new URLSearchParams(window.location.search).get("coinpay_oauth");
    if (coinpayParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("coinpay_oauth");
      url.searchParams.delete("error");
      history.replaceState(null, "", url.pathname + (url.search || ""));
    }

    const updateCoinPayButton = async (): Promise<void> => {
      const connectBtn = document.querySelector<HTMLAnchorElement>(
        ".hero-actions a[href='/api/oauth/coinpay/start']"
      );
      if (!connectBtn) return;

      try {
        const res = await fetch("/api/oauth/coinpay/session");
        const data = await res.json();

        if (data.authenticated && data.user) {
          const label = data.user.email || data.user.name || data.user.sub || "CoinPay";
          connectBtn.textContent = `Connected: ${label}`;
          connectBtn.style.background = "#3a9e7e";
          connectBtn.removeAttribute("href");
          connectBtn.style.cursor = "default";
          connectBtn.title = `Connected via CoinPay since ${new Date(data.user.connected_at).toLocaleDateString()}`;
        } else if (coinpayParam === "connected") {
          connectBtn.textContent = "CoinPay Connected";
          connectBtn.style.background = "#3a9e7e";
        } else if (coinpayParam === "error") {
          connectBtn.textContent = "Connect CoinPay (retry)";
        }
      } catch {
        // session check failed — leave button as-is
      }
    };
    void updateCoinPayButton();

    return () => {
      form?.removeEventListener("submit", onSubmit);
    };
  }, []);

  return null;
}
