import fs from "node:fs";

const pageSource = fs.readFileSync("src/app/page.tsx", "utf8");
const nodeSource = fs.readFileSync("src/components/canvas/CanvasNode.tsx", "utf8");
const typesSource = fs.readFileSync("src/lib/canvas/types.ts", "utf8");

const checks = [
  [
    "file nodes carry thumbnail data urls",
    /thumbnailDataUrl\?: string/.test(typesSource),
  ],
  [
    "import path generates image and video thumbnails",
    /createImageThumbnail/.test(pageSource) && /createVideoThumbnail/.test(pageSource),
  ],
  [
    "large board snapshots keep thumbnail data with skipped blobs",
    /thumbnailDataUrl/.test(pageSource) && /skippedBlob/.test(pageSource),
  ],
  [
    "canvas image preview can use thumbnails",
    /node\.thumbnailDataUrl \?\? mediaSrc/.test(nodeSource) &&
      /const mediaSrc = node\.sourceUrl \?\? node\.blobUrl/.test(nodeSource),
  ],
  [
    "video placeholder can show thumbnail frame",
    /node\.thumbnailDataUrl/.test(nodeSource) && /Video/.test(nodeSource),
  ],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length > 0) {
  console.error("Canvas thumbnail regression check failed:");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Canvas thumbnail regression check passed");
