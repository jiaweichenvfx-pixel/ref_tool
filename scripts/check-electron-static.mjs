import fs from "node:fs";

const mainProcessSource = fs.readFileSync("electron/main.cjs", "utf8");

const checks = [
  [
    "packaged app loads exported Next files from app.asar",
    /app\.isPackaged[\s\S]*app\.getAppPath\(\)/.test(mainProcessSource),
  ],
  [
    "custom protocol reads static files directly",
    /fs\.readFile/.test(mainProcessSource) && /new Response/.test(mainProcessSource),
  ],
  [
    "missing static routes fall back to index.html",
    /fileExists/.test(mainProcessSource) && /index\.html/.test(mainProcessSource),
  ],
  [
    "unexpected file drops cannot navigate away from the app",
    /will-navigate/.test(mainProcessSource) && /preventDefault/.test(mainProcessSource),
  ],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length > 0) {
  console.error("Electron desktop regression check failed:");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Electron desktop regression check passed");
