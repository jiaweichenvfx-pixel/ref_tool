import fs from "node:fs";

const pageSource = fs.readFileSync("src/app/page.tsx", "utf8");
const nodeSource = fs.readFileSync("src/components/canvas/CanvasNode.tsx", "utf8");

const checks = [
  [
    "drop node creation accepts an explicit position",
    /createFileNode\([\s\S]*position\?: \{ x: number; y: number \}/.test(pageSource),
  ],
  [
    "page computes visible nodes before rendering",
    /visibleNodes/.test(pageSource) && /isNodeVisible/.test(pageSource) && /visibleWorldRect/.test(pageSource),
  ],
  [
    "dragged files land at the drop pointer in world coordinates",
    /screenToWorld\(e\.clientX, e\.clientY, viewport\)/.test(pageSource),
  ],
  [
    "canvas node receives visibility state",
    /isVisible/.test(nodeSource) && /shouldMountVideo/.test(nodeSource),
  ],
  [
    "hidden videos unmount their media element when culled",
    /shouldMountVideo \?/.test(nodeSource) && /<video/.test(nodeSource),
  ],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length > 0) {
  console.error("Canvas optimization regression check failed:");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Canvas optimization regression check passed");
