import type { FileNode } from "./types";

const GAP = 16;
const MAX_WIDTH = 1200;
const SEARCH_STEP = 24;
const MAX_SEARCH_RADIUS = 2400;

type Rect = { x: number; y: number; width: number; height: number };

function overlaps(a: Rect, b: Rect, gap = GAP) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function resolveFreePosition(
  candidate: Rect,
  occupied: Rect[],
  anchorX: number,
  anchorY: number,
) {
  const isFree = (rect: Rect) => occupied.every((other) => !overlaps(rect, other));
  if (isFree(candidate)) return candidate;

  let best: Rect | null = null;
  let bestDistance = Infinity;

  for (let radius = SEARCH_STEP; radius <= MAX_SEARCH_RADIUS; radius += SEARCH_STEP) {
    for (let dx = -radius; dx <= radius; dx += SEARCH_STEP) {
      for (const dy of [-radius, radius]) {
        const rect = { ...candidate, x: candidate.x + dx, y: candidate.y + dy };
        if (!isFree(rect)) continue;
        const distance = Math.hypot(rect.x - anchorX, rect.y - anchorY);
        if (distance < bestDistance) {
          best = rect;
          bestDistance = distance;
        }
      }
    }

    for (let dy = -radius + SEARCH_STEP; dy <= radius - SEARCH_STEP; dy += SEARCH_STEP) {
      for (const dx of [-radius, radius]) {
        const rect = { ...candidate, x: candidate.x + dx, y: candidate.y + dy };
        if (!isFree(rect)) continue;
        const distance = Math.hypot(rect.x - anchorX, rect.y - anchorY);
        if (distance < bestDistance) {
          best = rect;
          bestDistance = distance;
        }
      }
    }

    if (best) return best;
  }

  return candidate;
}

/** PureRef-style grid arrange: rows of height-matched items, largest first */
export function arrangeNodes(
  nodes: FileNode[],
  selectedIds: string[],
  centerX: number,
  centerY: number,
): Array<{ id: string; x: number; y: number }> {
  const sel = nodes.filter((n) => selectedIds.includes(n.id));
  if (!sel.length) return [];
  const selectedIdSet = new Set(selectedIds);
  const occupied: Rect[] = nodes
    .filter((node) => !selectedIdSet.has(node.id))
    .map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.width,
      height: node.height,
    }));

  // sort by area descending, then by height descending
  const sorted = [...sel].sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height;
    if (Math.abs(areaDiff) > 100) return areaDiff;
    return b.height - a.height;
  });

  // Pack into rows
  type Row = { nodes: FileNode[]; h: number; w: number };
  const rows: Row[] = [];

  for (const node of sorted) {
    // try to fit into an existing row
    let placed = false;
    for (const row of rows) {
      const newWidth = row.w + GAP + node.width;
      if (newWidth <= MAX_WIDTH) {
        row.nodes.push(node);
        row.w = newWidth;
        row.h = Math.max(row.h, node.height);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push({ nodes: [node], h: node.height, w: node.width });
    }
  }

  // Compute positions — center-align the whole block
  const result: Array<{ id: string; x: number; y: number }> = [];
  let cy = 0; // local Y offset

  for (const row of rows) {
    // center the row horizontally
    let cx = 0; // local X offset within row
    for (const node of row.nodes) {
      // vertically center item within row height
      const yOff = (row.h - node.height) / 2;
      result.push({ id: node.id, x: cx, y: cy + yOff });
      cx += node.width + GAP;
    }
    cy += row.h + GAP;
  }

  // Now center the entire block at (centerX, centerY)
  const totalW = rows.reduce((m, r) => Math.max(m, r.w), 0);
  const totalH = cy - GAP; // last GAP is extra
  const offsetX = centerX - totalW / 2;
  const offsetY = centerY - totalH / 2;

  return result.map(({ id, x, y }) => {
    const node = sel.find((item) => item.id === id);
    if (!node) return { id, x: offsetX + x, y: offsetY + y };

    const desired = {
      x: offsetX + x,
      y: offsetY + y,
      width: node.width,
      height: node.height,
    };
    const resolved = resolveFreePosition(desired, occupied, desired.x, desired.y);
    occupied.push(resolved);
    return { id, x: resolved.x, y: resolved.y };
  });
}
