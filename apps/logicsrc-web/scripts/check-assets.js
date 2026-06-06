import { accessSync } from "node:fs";

for (const file of ["index.html", "public/manifest.webmanifest", "public/icon.svg", "public/service-worker.js", "public/sitemap.xml", "public/blog/rss.xml", "src/main.ts", "src/styles.css"]) {
  accessSync(new URL(`../${file}`, import.meta.url));
}

console.log("logicsrc-web assets verified");
