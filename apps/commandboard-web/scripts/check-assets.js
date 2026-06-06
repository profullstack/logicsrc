import { accessSync } from "node:fs";

for (const file of ["index.html", "manifest.webmanifest", "src/main.ts", "src/styles.css"]) {
  accessSync(new URL(`../${file}`, import.meta.url));
}

console.log("commandboard-web assets verified");
