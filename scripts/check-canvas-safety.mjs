import fs from "node:fs";

const pageSource = fs.readFileSync("src/app/page.tsx", "utf8");
const storeSource = fs.readFileSync("src/lib/canvas/store.ts", "utf8");

const checks = [
  [
    "large board snapshots skip embedded media blobs",
    /BOARD_EMBED_LIMIT_BYTES/.test(pageSource) && /skippedBlob/.test(pageSource),
  ],
  [
    "dropped unsupported files are reported to the user",
    /isSupportedFile/.test(pageSource) && /skipped \$\{skipped\} unsupported/.test(pageSource),
  ],
  [
    "imports show progress status",
    /Importing \$\{fs\.length\}/.test(pageSource) && /Pasting \$\{items\.length\}/.test(pageSource),
  ],
  [
    "object URLs are revoked through a shared cleanup helper",
    /function revokeNodeUrls/.test(pageSource) && /URL\.revokeObjectURL/.test(pageSource),
  ],
  [
    "undo history is capped more conservatively",
    /const HISTORY_LIMIT = 50;/.test(storeSource),
  ],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length > 0) {
  console.error("Canvas safety regression check failed:");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Canvas safety regression check passed");
