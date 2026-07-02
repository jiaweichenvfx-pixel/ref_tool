import { create } from "zustand";
import type { CanvasGroup, FileNode, Position } from "./types";
import { nanoid } from "nanoid";

const ALIGN_GAP = 12;
const HISTORY_LIMIT = 80;
const GROUP_HIT_PAD = 18;
const GROUP_HIT_HEADER = 40;
const DEFAULT_TEXT_FONT_SIZE = 50;
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_TEXT_WIDTH = 640;
const TEXT_VERTICAL_PADDING = 16;

function getTextLineHeight(fontSize: number) {
  return Math.round(fontSize * 1.35);
}

function getTextLineCount(text?: string) {
  return Math.max(1, (text ?? "").split("\n").length);
}

function getTextNodeHeight(text: string | undefined, fontSize: number) {
  return getTextLineCount(text) * getTextLineHeight(fontSize) + TEXT_VERTICAL_PADDING;
}

type CanvasSnapshot = {
  nodes: FileNode[];
  groups: CanvasGroup[];
  selectedIds: string[];
  selectedGroupId: string | null;
};

function cloneNode(node: FileNode): FileNode {
  return {
    ...node,
    position: { ...node.position },
  };
}

function snapshot(s: Pick<Store, "nodes" | "groups" | "selectedIds" | "selectedGroupId">): CanvasSnapshot {
  return {
    nodes: s.nodes.map(cloneNode),
    groups: s.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] })),
    selectedIds: [...s.selectedIds],
    selectedGroupId: s.selectedGroupId,
  };
}

function withHistory(s: Store, next: Partial<Pick<Store, "nodes" | "groups" | "selectedIds" | "selectedGroupId">>) {
  return {
    ...next,
    historyPast: [...s.historyPast.slice(-(HISTORY_LIMIT - 1)), snapshot(s)],
    historyFuture: [],
  };
}

function getAlignedPositions(
  nodes: FileNode[],
  mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom",
) {
  const left = Math.min(...nodes.map((n) => n.position.x));
  const right = Math.max(...nodes.map((n) => n.position.x + n.width));
  const top = Math.min(...nodes.map((n) => n.position.y));
  const bottom = Math.max(...nodes.map((n) => n.position.y + n.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const verticalAlign = mode === "left" || mode === "centerX" || mode === "right";
  const sorted = [...nodes].sort((a, b) =>
    verticalAlign
      ? a.position.y - b.position.y || a.position.x - b.position.x
      : a.position.x - b.position.x || a.position.y - b.position.y,
  );

  let cursor = -Infinity;
  return new Map(
    sorted.map((n) => {
      const position = { ...n.position };

      if (mode === "left") position.x = left;
      if (mode === "centerX") position.x = centerX - n.width / 2;
      if (mode === "right") position.x = right - n.width;
      if (mode === "top") position.y = top;
      if (mode === "centerY") position.y = centerY - n.height / 2;
      if (mode === "bottom") position.y = bottom - n.height;

      if (verticalAlign) {
        position.y = Math.max(position.y, cursor);
        cursor = position.y + n.height + ALIGN_GAP;
      } else {
        position.x = Math.max(position.x, cursor);
        cursor = position.x + n.width + ALIGN_GAP;
      }

      return [n.id, position];
    }),
  );
}

type Store = {
  nodes: FileNode[];
  groups: CanvasGroup[];
  selectedIds: string[];
  selectedGroupId: string | null;
  historyPast: CanvasSnapshot[];
  historyFuture: CanvasSnapshot[];
  addNodes: (ns: FileNode[]) => void;
  addTextNode: (position?: Position) => void;
  removeNodes: (ids: string[]) => void;
  duplicateSelected: () => void;
  createGroupFromSelection: () => void;
  updateGroup: (id: string, patch: Partial<Pick<CanvasGroup, "color" | "note" | "nodeIds">>) => void;
  removeGroup: (id: string) => void;
  removeNodesFromGroups: (nodeIds: string[]) => void;
  selectGroup: (id: string) => void;
  updateNodePosition: (id: string, p: { x: number; y: number }) => void;
  updateNodePositions: (positions: { id: string; x: number; y: number }[]) => void;
  updateNodeSize: (id: string, w: number, h: number, p?: { x: number; y: number }) => void;
  updateNodeText: (id: string, text: string) => void;
  updateNodeFontSize: (id: string, fontSize: number) => void;
  updateNodeFontColor: (id: string, fontColor: string) => void;
  setSelectedLocked: (locked: boolean) => void;
  bringSelectedToFront: () => void;
  sendSelectedToBack: () => void;
  alignSelected: (mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") => void;
  distributeSelected: (axis: "x" | "y") => void;
  selectNode: (id: string, add?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectedIds: (ids: string[]) => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  absorbNodesIntoContainingGroups: (nodeIds: string[]) => void;
  undo: () => void;
  redo: () => void;
};

function getGroupBounds(group: CanvasGroup, nodes: FileNode[]) {
  const members = nodes.filter((node) => group.nodeIds.includes(node.id));
  if (members.length < 2) return null;
  const left = Math.min(...members.map((node) => node.position.x));
  const top = Math.min(...members.map((node) => node.position.y));
  const right = Math.max(...members.map((node) => node.position.x + node.width));
  const bottom = Math.max(...members.map((node) => node.position.y + node.height));
  return {
    left: left - GROUP_HIT_PAD,
    top: top - GROUP_HIT_HEADER - GROUP_HIT_PAD,
    right: right + GROUP_HIT_PAD,
    bottom: bottom + GROUP_HIT_PAD,
  };
}

export const useCanvasStore = create<Store>((set) => ({
  nodes: [],
  groups: [],
  selectedIds: [],
  selectedGroupId: null,
  historyPast: [],
  historyFuture: [],
  addNodes: (ns) => set((s) => withHistory(s, { nodes: [...s.nodes, ...ns], selectedIds: ns.map((n) => n.id), selectedGroupId: null })),
  addTextNode: (position) => set((s) => {
    const node: FileNode = {
      id: nanoid(),
      type: "text",
      name: "Text note",
      text: "New note",
      fontSize: DEFAULT_TEXT_FONT_SIZE,
      fontColor: DEFAULT_TEXT_COLOR,
      sourceName: "Canvas text note",
      sourceType: "text/plain",
      sourceKind: "text",
      position: position ?? { x: 120, y: 120 },
      width: DEFAULT_TEXT_WIDTH,
      height: getTextNodeHeight("New note", DEFAULT_TEXT_FONT_SIZE),
      naturalWidth: DEFAULT_TEXT_WIDTH,
      naturalHeight: getTextNodeHeight("New note", DEFAULT_TEXT_FONT_SIZE),
    };
    return withHistory(s, { nodes: [...s.nodes, node], selectedIds: [node.id], selectedGroupId: null });
  }),
  removeNodes: (ids) => set((s) => {
    const removable = new Set(s.nodes.filter((n) => ids.includes(n.id) && !n.locked).map((n) => n.id));
    if (!removable.size) return {};
    const groups = s.groups
      .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !removable.has(id)) }))
      .filter((group) => group.nodeIds.length >= 2);
    const selectedGroupId = groups.some((group) => group.id === s.selectedGroupId) ? s.selectedGroupId : null;
    return {
      ...withHistory(s, {
        nodes: s.nodes.filter((n) => !removable.has(n.id)),
        groups,
        selectedIds: s.selectedIds.filter((id) => !removable.has(id)),
        selectedGroupId,
      }),
    };
  }),
  duplicateSelected: () => set((s) => {
    const selected = s.nodes.filter((n) => s.selectedIds.includes(n.id));
    if (!selected.length) return {};
    const copies = selected.map((n) => ({
      ...n,
      id: nanoid(),
      name: `${n.name} copy`,
      locked: false,
      position: { x: n.position.x + 24, y: n.position.y + 24 },
    }));
    return withHistory(s, { nodes: [...s.nodes, ...copies], selectedIds: copies.map((n) => n.id), selectedGroupId: null });
  }),
  createGroupFromSelection: () => set((s) => {
    const nodeIds = s.selectedIds.filter((id) => s.nodes.some((n) => n.id === id));
    if (nodeIds.length < 2) return {};
    const group: CanvasGroup = {
      id: nanoid(),
      nodeIds,
      color: "#0891b2",
      note: "",
    };
    return withHistory(s, { groups: [...s.groups, group], selectedIds: nodeIds, selectedGroupId: group.id });
  }),
  updateGroup: (id, patch) => set((s) => {
    const current = s.groups.find((group) => group.id === id);
    if (!current) return {};
    const nextGroup = {
      ...current,
      ...patch,
      nodeIds: patch.nodeIds ? [...patch.nodeIds] : current.nodeIds,
    };
    if (current.color === nextGroup.color && current.note === nextGroup.note && current.nodeIds.join("\0") === nextGroup.nodeIds.join("\0")) return {};
    return withHistory(s, { groups: s.groups.map((group) => (group.id === id ? nextGroup : group)) });
  }),
  removeGroup: (id) => set((s) => {
    if (!s.groups.some((group) => group.id === id)) return {};
    return withHistory(s, { groups: s.groups.filter((group) => group.id !== id), selectedGroupId: s.selectedGroupId === id ? null : s.selectedGroupId });
  }),
  removeNodesFromGroups: (nodeIds) => set((s) => {
    const ids = new Set(nodeIds);
    if (!ids.size) return {};
    const groups = s.groups
      .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !ids.has(id)) }))
      .filter((group) => group.nodeIds.length >= 2);
    const changed = groups.length !== s.groups.length || groups.some((group, index) => group.nodeIds.length !== s.groups[index]?.nodeIds.length);
    if (!changed) return {};
    const selectedGroupId = groups.some((group) => group.id === s.selectedGroupId) ? s.selectedGroupId : null;
    return withHistory(s, { groups, selectedGroupId });
  }),
  selectGroup: (id) => set((s) => {
    const group = s.groups.find((g) => g.id === id);
    if (!group) return {};
    const activeIds = new Set(s.nodes.map((n) => n.id));
    return { selectedIds: group.nodeIds.filter((nodeId) => activeIds.has(nodeId)), selectedGroupId: id };
  }),
  updateNodePosition: (id, p) => set((s) => {
    const target = s.nodes.find((n) => n.id === id && !n.locked);
    if (!target || (target.position.x === p.x && target.position.y === p.y)) return {};
    return withHistory(s, { nodes: s.nodes.map((n) => (n.id === id && !n.locked ? { ...n, position: p } : n)) });
  }),
  updateNodePositions: (positions) => set((s) => {
    const targets = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
    const changed = s.nodes.some((n) => {
      const p = targets.get(n.id);
      return p && !n.locked && (n.position.x !== p.x || n.position.y !== p.y);
    });
    if (!changed) return {};
    return withHistory(s, {
      nodes: s.nodes.map((n) => {
        const p = targets.get(n.id);
        return p && !n.locked ? { ...n, position: p } : n;
      }),
    });
  }),
  updateNodeSize: (id, w, h, p) => set((s) => {
    const target = s.nodes.find((n) => n.id === id && !n.locked);
    if (!target) return {};
    const nextPosition = p ?? target.position;
    if (target.width === w && target.height === h && target.position.x === nextPosition.x && target.position.y === nextPosition.y) return {};
    return withHistory(s, { nodes: s.nodes.map((n) => (n.id === id && !n.locked ? { ...n, width: w, height: h, position: nextPosition } : n)) });
  }),
  updateNodeText: (id, text) => set((s) => {
    const target = s.nodes.find((n) => n.id === id && n.type === "text" && !n.locked);
    if (!target) return {};
    const minHeight = getTextNodeHeight(text, target.fontSize ?? DEFAULT_TEXT_FONT_SIZE);
    if ((target.text ?? "") === text && target.height >= minHeight) return {};
    return withHistory(s, {
      nodes: s.nodes.map((n) => (
        n.id === id && n.type === "text" && !n.locked
          ? { ...n, text, height: Math.max(n.height, minHeight), naturalHeight: Math.max(n.naturalHeight, minHeight) }
          : n
      )),
    });
  }),
  updateNodeFontSize: (id, fontSize) => set((s) => {
    const nextFontSize = Math.min(96, Math.max(8, Math.round(fontSize)));
    const target = s.nodes.find((n) => n.id === id && n.type === "text" && !n.locked);
    if (!target || (target.fontSize ?? DEFAULT_TEXT_FONT_SIZE) === nextFontSize) return {};
    const minHeight = getTextNodeHeight(target.text, nextFontSize);
    return withHistory(s, {
      nodes: s.nodes.map((n) => (
        n.id === id && n.type === "text" && !n.locked
          ? { ...n, fontSize: nextFontSize, height: Math.max(n.height, minHeight), naturalHeight: Math.max(n.naturalHeight, minHeight) }
          : n
      )),
    });
  }),
  updateNodeFontColor: (id, fontColor) => set((s) => {
    const target = s.nodes.find((n) => n.id === id && n.type === "text" && !n.locked);
    if (!target || (target.fontColor ?? DEFAULT_TEXT_COLOR) === fontColor) return {};
    return withHistory(s, { nodes: s.nodes.map((n) => (n.id === id && n.type === "text" && !n.locked ? { ...n, fontColor } : n)) });
  }),
  setSelectedLocked: (locked) => set((s) => {
    const changed = s.nodes.some((n) => s.selectedIds.includes(n.id) && n.locked !== locked);
    if (!changed) return {};
    return withHistory(s, { nodes: s.nodes.map((n) => (s.selectedIds.includes(n.id) ? { ...n, locked } : n)) });
  }),
  bringSelectedToFront: () => set((s) => {
    const selected = s.nodes.filter((n) => s.selectedIds.includes(n.id));
    if (!selected.length) return {};
    const rest = s.nodes.filter((n) => !s.selectedIds.includes(n.id));
    return withHistory(s, { nodes: [...rest, ...selected] });
  }),
  sendSelectedToBack: () => set((s) => {
    const selected = s.nodes.filter((n) => s.selectedIds.includes(n.id));
    if (!selected.length) return {};
    const rest = s.nodes.filter((n) => !s.selectedIds.includes(n.id));
    return withHistory(s, { nodes: [...selected, ...rest] });
  }),
  alignSelected: (mode) => set((s) => {
    const ids = new Set(s.selectedIds);
    const editable = s.nodes.filter((n) => ids.has(n.id) && !n.locked);
    if (editable.length < 2) return {};

    const targets = getAlignedPositions(editable, mode);

    return withHistory(s, {
      nodes: s.nodes.map((n) => {
        const position = targets.get(n.id);
        return position ? { ...n, position } : n;
      }),
    });
  }),
  distributeSelected: (axis) => set((s) => {
    const ids = new Set(s.selectedIds);
    const editable = s.nodes.filter((n) => ids.has(n.id) && !n.locked);
    if (editable.length < 3) return {};

    const sorted = [...editable].sort((a, b) => axis === "x" ? a.position.x - b.position.x : a.position.y - b.position.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstCenter = axis === "x" ? first.position.x + first.width / 2 : first.position.y + first.height / 2;
    const lastCenter = axis === "x" ? last.position.x + last.width / 2 : last.position.y + last.height / 2;
    const gap = (lastCenter - firstCenter) / (sorted.length - 1);
    const targets = new Map(sorted.map((n, i) => [n.id, firstCenter + gap * i]));

    return withHistory(s, {
      nodes: s.nodes.map((n) => {
        const target = targets.get(n.id);
        if (target == null || n.locked) return n;
        return axis === "x"
          ? { ...n, position: { ...n.position, x: target - n.width / 2 } }
          : { ...n, position: { ...n.position, y: target - n.height / 2 } };
      }),
    });
  }),
  selectNode: (id, add) => set((s) => ({ selectedIds: add ? (s.selectedIds.includes(id) ? s.selectedIds.filter((i) => i !== id) : [...s.selectedIds, id]) : [id], selectedGroupId: null })),
  selectAll: () => set((s) => ({ selectedIds: s.nodes.map((n) => n.id), selectedGroupId: null })),
  clearSelection: () => set({ selectedIds: [], selectedGroupId: null }),
  setSelectedIds: (ids) => set({ selectedIds: ids, selectedGroupId: null }),
  moveSelectedBy: (dx, dy) => set((s) => {
    const changed = s.nodes.some((n) => s.selectedIds.includes(n.id) && !n.locked);
    if (!changed || (dx === 0 && dy === 0)) return {};
    return withHistory(s, { nodes: s.nodes.map((n) => (s.selectedIds.includes(n.id) && !n.locked ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)) });
  }),
  absorbNodesIntoContainingGroups: (nodeIds) => set((s) => {
    const ids = new Set(nodeIds);
    if (!ids.size || !s.groups.length) return {};

    const nextGroups = s.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] }));
    let changed = false;

    for (const node of s.nodes) {
      if (!ids.has(node.id)) continue;
      const centerX = node.position.x + node.width / 2;
      const centerY = node.position.y + node.height / 2;
      const targetGroup = nextGroups.find((group) => {
        if (group.nodeIds.includes(node.id)) return false;
        const bounds = getGroupBounds(group, s.nodes);
        if (!bounds) return false;
        return centerX >= bounds.left && centerX <= bounds.right && centerY >= bounds.top && centerY <= bounds.bottom;
      });
      if (targetGroup) {
        targetGroup.nodeIds.push(node.id);
        changed = true;
      }
    }

    if (!changed) return {};
    return withHistory(s, { groups: nextGroups });
  }),
  undo: () => set((s) => {
    const previous = s.historyPast.at(-1);
    if (!previous) return {};
    return {
      nodes: previous.nodes.map(cloneNode),
      groups: previous.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] })),
      selectedIds: [...previous.selectedIds],
      selectedGroupId: previous.selectedGroupId,
      historyPast: s.historyPast.slice(0, -1),
      historyFuture: [snapshot(s), ...s.historyFuture].slice(0, HISTORY_LIMIT),
    };
  }),
  redo: () => set((s) => {
    const next = s.historyFuture[0];
    if (!next) return {};
    return {
      nodes: next.nodes.map(cloneNode),
      groups: next.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] })),
      selectedIds: [...next.selectedIds],
      selectedGroupId: next.selectedGroupId,
      historyPast: [...s.historyPast.slice(-(HISTORY_LIMIT - 1)), snapshot(s)],
      historyFuture: s.historyFuture.slice(1),
    };
  }),
}));
