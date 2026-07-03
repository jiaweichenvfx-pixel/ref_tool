import fs from "node:fs";

const pageSource = fs.readFileSync("src/app/page.tsx", "utf8");
const nodeSource = fs.readFileSync("src/components/canvas/CanvasNode.tsx", "utf8");
const typesSource = fs.readFileSync("src/lib/canvas/types.ts", "utf8");
const mainSource = fs.readFileSync("electron/main.cjs", "utf8");
const preloadSource = fs.readFileSync("electron/preload.cjs", "utf8");

const checks = [
  [
    "file nodes can remember desktop source paths",
    /sourcePath\?: string/.test(typesSource) &&
      /sourceUrl\?: string/.test(typesSource) &&
      /sourceMissing\?: boolean/.test(typesSource) &&
      /sourceFingerprint\?: string/.test(typesSource),
  ],
  [
    "preload exposes safe desktop persistence APIs",
    /webUtils\.getPathForFile/.test(preloadSource) &&
      /registerMediaPath/.test(preloadSource) &&
      /saveProject/.test(preloadSource) &&
      /openProject/.test(preloadSource) &&
      /saveFileCopy/.test(preloadSource),
  ],
  [
    "main process owns project dialogs and local media protocol",
    /const mediaScheme = "ref-media"/.test(mainSource) &&
      /protocol\.handle\(mediaScheme/.test(mainSource) &&
      /parseRangeHeader/.test(mainSource) &&
      /content-range/.test(mainSource) &&
      /"accept-ranges": "bytes"/.test(mainSource) &&
      /dialog\.showSaveDialog/.test(mainSource) &&
      /dialog\.showOpenDialog/.test(mainSource) &&
      /createReadStream/.test(mainSource),
  ],
  [
    "project serialization prefers source paths over embedded media blobs",
    /persistedBy: "source-path"/.test(pageSource) &&
      /sourceLinkedMedia/.test(pageSource) &&
      /registerMediaPath/.test(pageSource) &&
      /saveProject/.test(pageSource) &&
      /openProject/.test(pageSource),
  ],
  [
    "source-linked media avoids IndexedDB blob persistence",
    /if \(n\.sourcePath\) \{[\s\S]*?deleteBlob\(n\.id\);[\s\S]*?nodeToPersisted\(n, n\.sourceSize\)/.test(pageSource) &&
      /!n\.sourcePath && Number\.isFinite\(n\.size\)/.test(pageSource) &&
      /!n\.sourcePath && \(n\.size \?\? 0\) > VIDEO_RESTORE_LIMIT_BYTES/.test(pageSource),
  ],
  [
    "canvas rendering can use registered desktop source urls",
    /node\.sourceUrl \?\? node\.blobUrl/.test(nodeSource) &&
      /sourceMissing/.test(nodeSource),
  ],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length > 0) {
  console.error("Desktop persistence regression check failed:");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Desktop persistence regression check passed");
