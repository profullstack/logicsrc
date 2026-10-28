// Page-wide behaviour that used to be inline script (the CSP now allows none):
// the service worker, and confirm() before destructive forms (data-confirm="…").
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
document.addEventListener("submit", (event) => {
  const form = event.target;
  const question = form instanceof HTMLFormElement ? form.dataset.confirm : null;
  if (question && !window.confirm(question)) event.preventDefault();
}, true);
