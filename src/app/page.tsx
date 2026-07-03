"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { nanoid } from "nanoid";
import { Download, FolderOpen, Minimize2, Save, Upload, X } from "lucide-react";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { CanvasNode } from "@/components/canvas/CanvasNode";
import { CanvasGroupRegion } from "@/components/canvas/CanvasGroupRegion";
import { ContextMenu } from "@/components/canvas/ContextMenu";
import { FloatingToolbar } from "@/components/canvas/FloatingToolbar";
import { useCanvasStore } from "@/lib/canvas/store";
import { arrangeNodes } from "@/lib/canvas/arrange";
import { clearBlobs, deleteBlob, listBlobKeys, loadBlob, saveBlob, listBoardRecords, loadBoardRecord, saveBoardRecord, type SavedBoardRecord } from "@/lib/canvas/storage";
import type { CanvasGroup, FileNode, PersistedFileNode, Viewport } from "@/lib/canvas/types";

const META_KEY = "cd-meta2";
const GROUPS_KEY = "cd-groups1";
const AUTO_RESTORE_LIMIT_BYTES = 256 * 1024 * 1024;
const AUTO_RESTORE_LIMIT_ITEMS = 80;
const VIDEO_RESTORE_LIMIT_BYTES = 80 * 1024 * 1024;
const FULLSCREEN_PADDING = 64;
const VIEWPORT_RENDER_PADDING = 900;
const BOARD_EMBED_LIMIT_BYTES = 32 * 1024 * 1024;
const SUPPORTED_FILE_RE = /\.(mp4|m4v|webm|mov|jpg|jpeg|png|gif|webp|bmp|svg)$/i;

function isSupportedFile(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/") || SUPPORTED_FILE_RE.test(file.name);
}

function revokeNodeUrls(nodes: FileNode[]) {
  for (const node of nodes) {
    if (node.blobUrl) URL.revokeObjectURL(node.blobUrl);
  }
}

function nodeToPersisted(node: FileNode, size?: number): PersistedFileNode {
  const { blobUrl, ...persisted } = node;
  void blobUrl;
  return size !== undefined ? { ...persisted, size } : persisted;
}

async function persist(nodes: FileNode[], groups: CanvasGroup[]) {
  if (!nodes.length) {
    try { localStorage.removeItem(META_KEY); } catch {}
    try { localStorage.removeItem(GROUPS_KEY); } catch {}
    await clearBlobs();
    return;
  }
  const meta: PersistedFileNode[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      meta.push(nodeToPersisted(n));
      continue;
    }
    try {
      const r = await fetch(n.blobUrl ?? "");
      const blob = await r.blob();
      await saveBlob(n.id, blob);
      meta.push(nodeToPersisted(n, blob.size));
    } catch {
      meta.push(nodeToPersisted(n));
    }
  }
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
  try {
    if (groups.length) localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    else localStorage.removeItem(GROUPS_KEY);
  } catch {}
}

async function serializeCanvas(nodes: FileNode[], groups: CanvasGroup[]) {
  let skippedMedia = 0;
  const items = await Promise.all(nodes.map(async (node) => {
    if (node.type === "text") return { ...node };
    if (!node.blobUrl) return { ...node, blobData: "" };
    const blob = await (await fetch(node.blobUrl)).blob();
    if (blob.size > BOARD_EMBED_LIMIT_BYTES) {
      skippedMedia += 1;
      return { ...node, blobUrl: undefined, blobData: "", size: blob.size, skippedBlob: true };
    }
    const blobData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { ...node, blobUrl: undefined, blobData, mime: blob.type, size: blob.size };
  }));

  return { data: JSON.stringify({ version: 1, savedAt: Date.now(), nodes: items, groups }), skippedMedia };
}

async function deserializeCanvas(data: string) {
  const parsed = JSON.parse(data) as { nodes?: Array<FileNode & { blobData?: string }>; groups?: CanvasGroup[] };
  const restoredNodes: FileNode[] = [];
  for (const node of parsed.nodes ?? []) {
    if (node.type === "text") {
      restoredNodes.push({ ...node, blobUrl: undefined });
      continue;
    }
    if (!node.blobData) continue;
    const blob = await (await fetch(node.blobData)).blob();
    restoredNodes.push({ ...node, blobUrl: URL.createObjectURL(blob) });
  }
  const nodeIds = new Set(restoredNodes.map((node) => node.id));
  const restoredGroups = (parsed.groups ?? [])
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => nodeIds.has(id)) }))
    .filter((group) => group.nodeIds.length >= 2);
  return { nodes: restoredNodes, groups: restoredGroups };
}

type RestoreResult =
  | { status: "empty"; nodes: FileNode[]; groups: CanvasGroup[]; totalBytes: number; itemCount: number }
  | { status: "loaded"; nodes: FileNode[]; groups: CanvasGroup[]; totalBytes: number; itemCount: number }
  | { status: "blocked"; nodes: FileNode[]; groups: CanvasGroup[]; totalBytes: number; itemCount: number; reason: string };

function parseStoredMeta(): PersistedFileNode[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storedBytes(meta: PersistedFileNode[]) {
  return meta.reduce((sum, n) => sum + (Number.isFinite(n.size) ? n.size ?? 0 : 0), 0);
}

function parseStoredGroups(): CanvasGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((group): group is CanvasGroup => typeof group?.id === "string" && Array.isArray(group.nodeIds))
      .map((group) => ({
        id: group.id,
        nodeIds: group.nodeIds.filter((id) => typeof id === "string"),
        color: typeof group.color === "string" ? group.color : "#0891b2",
        note: typeof group.note === "string" ? group.note : "",
      }));
  } catch {
    return [];
  }
}

function restoreNodeMeta(meta: PersistedFileNode): Omit<FileNode, "blobUrl"> {
  const { size, ...node } = meta;
  return {
    ...node,
    sourceName: node.sourceName ?? node.name,
    sourceSize: node.sourceSize ?? size,
    sourceWidth: node.sourceWidth ?? node.naturalWidth,
    sourceHeight: node.sourceHeight ?? node.naturalHeight,
    sourceKind: node.sourceKind ?? (node.type === "text" ? "text" : "drop"),
  };
}

async function restore(options: { force?: boolean } = {}): Promise<RestoreResult> {
  const meta = parseStoredMeta();
  const totalBytes = storedBytes(meta);
  if (!meta.length) return { status: "empty", nodes: [], groups: [], totalBytes: 0, itemCount: 0 };
  const largeVideo = meta.find((n) => n.type === "video" && (n.size ?? 0) > VIDEO_RESTORE_LIMIT_BYTES);
  if (!options.force && (meta.length > AUTO_RESTORE_LIMIT_ITEMS || totalBytes > AUTO_RESTORE_LIMIT_BYTES || largeVideo)) {
    const reason = largeVideo
      ? `Saved video "${largeVideo.name}" is too large to auto-restore safely.`
      : `Saved canvas is ${formatBytes(totalBytes)} across ${meta.length} files.`;
    return { status: "blocked", nodes: [], groups: [], totalBytes, itemCount: meta.length, reason };
  }
  const out: FileNode[] = [];
  for (const m of meta) {
    const node = restoreNodeMeta(m);
    if (m.type === "text") {
      out.push({ ...node, text: node.text ?? "", blobUrl: undefined });
      continue;
    }

    const b = await loadBlob(m.id);
    if (b) {
      out.push({ ...node, blobUrl: URL.createObjectURL(b) });
    }
  }
  const loadedIds = new Set(out.map((node) => node.id));
  const groups = parseStoredGroups()
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => loadedIds.has(id)) }))
    .filter((group) => group.nodeIds.length >= 2);
  return { status: "loaded", nodes: out, groups, totalBytes, itemCount: meta.length };
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_") || "canvas-file";
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

function formatDuration(seconds?: number) {
  if (!Number.isFinite(seconds) || !seconds) return "Unknown";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function sourceTypeLabel(node: FileNode) {
  if (node.type === "text") return "Canvas text note";
  if (node.sourceType) return node.sourceType;
  return node.type === "video" ? "Video file" : "Image file";
}

function sourceKindLabel(node: FileNode) {
  if (node.sourceKind === "paste") return "Pasted file";
  if (node.sourceKind === "capture") return "Captured frame";
  if (node.sourceKind === "text") return "Canvas text";
  return "Dropped file";
}

async function readImageMetadata(url: string, fallback: { width: number; height: number }) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || fallback.width, height: img.naturalHeight || fallback.height });
    img.onerror = () => resolve(fallback);
    img.src = url;
  });
}

async function readVideoMetadata(url: string, fallback: { width: number; height: number }) {
  return new Promise<{ width: number; height: number; duration?: number }>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth || fallback.width,
        height: video.videoHeight || fallback.height,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
      });
    };
    video.onerror = () => {
      resolve(fallback);
    };
    video.src = url;
  });
}

function fitMediaSize(width: number, height: number, fallback: { width: number; height: number }) {
  if (!width || !height) return fallback;
  const max = 400;
  if (width > max || height > max) {
    const ratio = Math.min(max / width, max / height);
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
  }
  return { width, height };
}

function screenToWorld(clientX: number, clientY: number, viewport: Viewport) {
  return {
    x: (clientX - viewport.x) / viewport.k,
    y: (clientY - viewport.y) / viewport.k,
  };
}

function getVisibleWorldRect(viewport: Viewport) {
  const padding = VIEWPORT_RENDER_PADDING / viewport.k;
  return {
    left: -viewport.x / viewport.k - padding,
    top: -viewport.y / viewport.k - padding,
    right: (window.innerWidth - viewport.x) / viewport.k + padding,
    bottom: (window.innerHeight - viewport.y) / viewport.k + padding,
  };
}

function isNodeVisible(node: FileNode, rect: { left: number; top: number; right: number; bottom: number }) {
  return (
    node.position.x + node.width >= rect.left &&
    node.position.x <= rect.right &&
    node.position.y + node.height >= rect.top &&
    node.position.y <= rect.bottom
  );
}

async function createFileNode(
  file: File,
  index: number,
  sourceKind: "drop" | "paste",
  spacing: number,
  position?: { x: number; y: number },
): Promise<FileNode> {
  const isVideo = file.type.startsWith("video/") || /\.(mp4|m4v|webm|mov)$/i.test(file.name);
  const url = URL.createObjectURL(file);
  const fallback = isVideo ? { width: 320, height: 180 } : { width: 280, height: 200 };
  const source: { width: number; height: number; duration?: number } = isVideo ? await readVideoMetadata(url, fallback) : await readImageMetadata(url, fallback);
  const size = fitMediaSize(source.width, source.height, fallback);
  const base = position ?? { x: 100, y: 100 };

  return {
    id: nanoid(),
    type: isVideo ? "video" : "image",
    name: file.name || (isVideo ? "Pasted video" : "Pasted image"),
    blobUrl: url,
    sourceName: file.name || (isVideo ? "Pasted video" : "Pasted image"),
    sourceType: file.type || (isVideo ? "video/*" : "image/*"),
    sourceSize: file.size,
    sourceLastModified: file.lastModified || undefined,
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceDuration: source.duration,
    sourceKind,
    position: { x: base.x + index * spacing, y: base.y + index * spacing },
    width: size.width,
    height: size.height,
    naturalWidth: source.width,
    naturalHeight: source.height,
  };
}

export default function Page() {
  const nodes = useCanvasStore((s) => s.nodes);
  const groups = useCanvasStore((s) => s.groups);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const selectedGroupId = useCanvasStore((s) => s.selectedGroupId);

  const [ready, setReady] = useState(false);
  const [restoreBlocked, setRestoreBlocked] = useState<Extract<RestoreResult, { status: "blocked" }> | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [infoNode, setInfoNode] = useState<FileNode | null>(null);
  const [savedBoards, setSavedBoards] = useState<SavedBoardRecord[]>([]);
  const [showBoards, setShowBoards] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const zoomRef = useRef(100);
  const statusTimerRef = useRef<number | null>(null);
  const fullscreenNode = nodes.find((node) => node.id === fullscreenId) ?? null;
  const selectionTouchesGroup = groups.some((group) => selectedIds.some((id) => group.nodeIds.includes(id)));
  const visibleWorldRect = useMemo(() => (ready ? getVisibleWorldRect(viewport) : null), [ready, viewport]);
  const visibleNodes = useMemo(() => {
    if (!visibleWorldRect) return [];
    const selected = new Set(selectedIds);
    return nodes.filter((node) => selected.has(node.id) || isNodeVisible(node, visibleWorldRect));
  }, [nodes, selectedIds, visibleWorldRect]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleGroups = useMemo(() => groups.filter((group) => group.nodeIds.some((id) => visibleNodeIds.has(id) || selectedIds.includes(id))), [groups, selectedIds, visibleNodeIds]);

  const setVP = useCallback((vp: Viewport) => {
    setViewport(vp);
    zoomRef.current = Math.round(vp.k * 100);
  }, []);

  const showStatus = useCallback((message: string, timeout = 1800) => {
    setStatus(message);
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, timeout);
  }, []);

  const loadSavedCanvas = useCallback(async (force = false) => {
    const result = await restore({ force });
    if (result.status === "blocked") {
      setRestoreBlocked(result);
    } else {
      setRestoreBlocked(null);
      if (result.nodes.length) useCanvasStore.setState({ nodes: result.nodes, groups: result.groups, selectedIds: [], selectedGroupId: null, historyPast: [], historyFuture: [] });
    }
    setReady(true);
  }, []);

  const clearSavedCanvas = useCallback(async () => {
    revokeNodeUrls(useCanvasStore.getState().nodes);
    useCanvasStore.setState({ nodes: [], groups: [], selectedIds: [], selectedGroupId: null, historyPast: [], historyFuture: [] });
    try { localStorage.removeItem(META_KEY); } catch {}
    await clearBlobs();
    setRestoreBlocked(null);
    setReady(true);
  }, []);

  const refreshBoards = useCallback(async () => {
    setSavedBoards(await listBoardRecords());
  }, []);

  const saveCurrentBoard = useCallback(async () => {
    const s = useCanvasStore.getState();
    if (!s.nodes.length) return;
    const savedAt = Date.now();
    showStatus("Saving canvas...", 6000);
    const { data, skippedMedia } = await serializeCanvas(s.nodes, s.groups);
    await saveBoardRecord({
      id: `board-${savedAt}`,
      name: `Canvas ${new Date(savedAt).toLocaleString()}`,
      savedAt,
      nodeCount: s.nodes.length,
      groupCount: s.groups.length,
      data,
    });
    await persist(s.nodes, s.groups);
    await refreshBoards();
    showStatus(skippedMedia ? `Canvas saved · ${skippedMedia} large media skipped in board snapshot` : "Canvas saved");
  }, [refreshBoards, showStatus]);

  const loadSavedBoard = useCallback(async (id: string) => {
    const record = await loadBoardRecord(id);
    if (!record) return;
    const restored = await deserializeCanvas(record.data);
    revokeNodeUrls(useCanvasStore.getState().nodes);
    useCanvasStore.setState({ nodes: restored.nodes, groups: restored.groups, selectedIds: [], selectedGroupId: null, historyPast: [], historyFuture: [] });
    await persist(restored.nodes, restored.groups);
    setShowBoards(false);
    showStatus("Canvas loaded");
  }, [showStatus]);

  const exportSelected = useCallback(async () => {
    const s = useCanvasStore.getState();
    const node = s.nodes.find((n) => s.selectedIds.includes(n.id));
    if (!node) return;
    if (node.type === "text") {
      downloadBlob(new Blob([node.text ?? ""], { type: "text/plain" }), `${safeFilename(node.name)}.txt`);
      return;
    }
    if (!node.blobUrl) return;
    const blob = await (await fetch(node.blobUrl)).blob();
    downloadBlob(blob, safeFilename(node.name));
  }, []);

  const showSelectedInfo = useCallback(async () => {
    const s = useCanvasStore.getState();
    const node = s.nodes.find((n) => s.selectedIds.includes(n.id));
    if (node) setInfoNode(node);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSavedCanvas(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSavedCanvas]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshBoards(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshBoards]);
  useEffect(() => { const h = () => { const s = useCanvasStore.getState(); void persist(s.nodes, s.groups); }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, []);
  useEffect(() => {
    const cleanup = async () => {
      const activeIds = new Set(useCanvasStore.getState().nodes.map((n) => n.id));
      const storedIds = await listBlobKeys();
      await Promise.all(storedIds.filter((id) => !activeIds.has(id)).map(deleteBlob));
    };
    void cleanup();
  }, [nodes.length]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const fs = droppedFiles.filter(isSupportedFile);
    const skipped = droppedFiles.length - fs.length;
    if (!fs.length) {
      if (skipped) showStatus(`Unsupported file${skipped > 1 ? "s" : ""}: ${skipped}`);
      return;
    }
    showStatus(`Importing ${fs.length} file${fs.length > 1 ? "s" : ""}...`, 6000);
    const dropPosition = screenToWorld(e.clientX, e.clientY, viewport);
    const ns = await Promise.all(fs.map((file, index) => createFileNode(file, index, "drop", 30, dropPosition)));
    useCanvasStore.getState().addNodes(ns);
    showStatus(skipped ? `Imported ${ns.length} · skipped ${skipped} unsupported` : `Imported ${ns.length} file${ns.length > 1 ? "s" : ""}`);
  }, [showStatus, viewport]);

  useEffect(() => {
    const h = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items).filter((it) => it.type.startsWith("image/") || it.type.startsWith("video/"));
      if (!items.length) return; e.preventDefault();
      showStatus(`Pasting ${items.length} item${items.length > 1 ? "s" : ""}...`, 6000);
      const ns: FileNode[] = [];
      for (let i = 0; i < items.length; i++) {
        const file = items[i].getAsFile();
        if (file) ns.push(await createFileNode(file, i, "paste", 40));
      }
      if (ns.length) useCanvasStore.getState().addNodes(ns);
      if (ns.length) showStatus(`Pasted ${ns.length} item${ns.length > 1 ? "s" : ""}`);
    };
    document.addEventListener("paste", h); return () => document.removeEventListener("paste", h);
  }, [showStatus]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
      revokeNodeUrls(useCanvasStore.getState().nodes);
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (fullscreenId && e.key === "Escape") { e.preventDefault(); setFullscreenId(null); return; }
      const s = useCanvasStore.getState(), ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); s.undo(); forceUpdate((n) => n + 1); return; }
      if ((ctrl && e.shiftKey && e.key.toLowerCase() === "z") || (ctrl && e.key.toLowerCase() === "y")) { e.preventDefault(); s.redo(); forceUpdate((n) => n + 1); return; }
      if (ctrl && e.key === "a") { e.preventDefault(); s.selectAll(); }
      if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); s.duplicateSelected(); }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "g") { e.preventDefault(); if (s.selectedGroupId) s.removeGroup(s.selectedGroupId); return; }
      if (ctrl && e.key.toLowerCase() === "g") { e.preventDefault(); s.createGroupFromSelection(); }
      if (ctrl && e.key === "]") { e.preventDefault(); s.bringSelectedToFront(); }
      if (ctrl && e.key === "[") { e.preventDefault(); s.sendSelectedToBack(); }
      if (ctrl && e.key.toLowerCase() === "l") { e.preventDefault(); const allLocked = s.selectedIds.length > 0 && s.selectedIds.every((id) => s.nodes.find((n) => n.id === id)?.locked); s.setSelectedLocked(!allLocked); }
      if (e.key === "Delete" || e.key === "Backspace") { if (s.selectedIds.length) s.removeNodes(s.selectedIds); }
      if (e.key === "Escape") { s.clearSelection(); setMenu(null); }
      if (e.key === "f" && !ctrl) { e.preventDefault(); if (!s.nodes.length) return; const n = s.nodes, xs = n.map((x) => x.position.x), ys = n.map((y) => y.position.y); const w = Math.max(...n.map((n2, i) => xs[i] + n2.width)) - Math.min(...xs) + 120; const h = Math.max(...n.map((n2, i) => ys[i] + n2.height)) - Math.min(...ys) + 120; const k = Math.min(window.innerWidth / w, window.innerHeight / h, 2); setVP({ x: (window.innerWidth - w * k) / 2 - Math.min(...xs) * k + 60 * k, y: (window.innerHeight - h * k) / 2 - Math.min(...ys) * k + 60 * k, k: Math.max(k, 0.05) }); }
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key) && s.selectedIds.length) { e.preventDefault(); const step = e.shiftKey ? 10 : 1; s.moveSelectedBy(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0); forceUpdate((n) => n + 1); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [fullscreenId, setVP]);

  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setFullscreenId(id);
    };
    window.addEventListener("canvas-node-fullscreen", h);
    return () => window.removeEventListener("canvas-node-fullscreen", h);
  }, []);

  const handleBoxSel = useCallback((r: { x: number; y: number; w: number; h: number }) => {
    const ids = useCanvasStore.getState().nodes.filter((n) => { const cx = n.position.x + n.width / 2, cy = n.position.y + n.height / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; }).map((n) => n.id);
    useCanvasStore.getState().setSelectedIds(ids);
  }, []);

  if (!ready) return <div className="flex h-screen items-center justify-center bg-[#2b2b2f] text-sm text-zinc-500">Loading...</div>;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#2b2b2f]"
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}>
      <InfiniteCanvas viewport={viewport} onViewportChange={setVP} onCanvasClick={() => useCanvasStore.getState().clearSelection()} onBoxSelect={handleBoxSel}>
        {visibleGroups.map((group) => <CanvasGroupRegion key={group.id} group={group} nodes={nodes} isSelected={selectedGroupId === group.id} scale={viewport.k} />)}
        {visibleNodes.map((n) => <CanvasNode key={n.id} node={n} isSelected={selectedIds.includes(n.id)} scale={viewport.k} isVisible />)}
      </InfiniteCanvas>

      <button
        className="absolute right-4 top-4 z-30 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-400 shadow-lg shadow-black/20 backdrop-blur-md hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => void clearSavedCanvas()}
      >
        Clear saved canvas
      </button>
      <div className="absolute right-4 top-16 z-30 flex gap-2">
        <button className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-400 shadow-lg shadow-black/20 backdrop-blur-md hover:bg-zinc-800 hover:text-zinc-100" onClick={() => void saveCurrentBoard()}>
          <Save size={13} /> Save Canvas
        </button>
        <button className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-400 shadow-lg shadow-black/20 backdrop-blur-md hover:bg-zinc-800 hover:text-zinc-100" onClick={() => { void refreshBoards(); setShowBoards(true); }}>
          <FolderOpen size={13} /> Load
        </button>
      </div>
      {status && <div className="absolute right-4 top-[6.6rem] z-30 rounded-lg border border-cyan-400/20 bg-cyan-950/80 px-3 py-2 text-xs text-cyan-100 shadow-lg shadow-black/20">{status}</div>}

      {restoreBlocked && nodes.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/95 p-5 text-center shadow-2xl shadow-black/40">
            <h1 className="text-base font-semibold text-zinc-100">Saved canvas paused</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {restoreBlocked.reason} Auto-restore was skipped to prevent another memory spike.
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {restoreBlocked.itemCount} files · {formatBytes(restoreBlocked.totalBytes)}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={() => { setReady(false); void loadSavedCanvas(true); }}>
                Restore anyway
              </button>
              <button className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white" onClick={() => void clearSavedCanvas()}>
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {dragOver && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-zinc-900/60"><div className="flex flex-col items-center gap-2 text-zinc-400"><Upload size={32} /><span className="text-sm">Drop files here</span></div></div>}

      {nodes.length === 0 && !dragOver && <div className="pointer-events-none absolute inset-0 z-10 flex select-none flex-col items-center justify-center"><p className="text-sm text-zinc-500">Drop images &amp; videos · Ctrl+V to paste</p></div>}

      {menu && <ContextMenu x={menu.x} y={menu.y} hasSelection={selectedIds.length > 0} hasSelectedGroup={Boolean(selectedGroupId)} canRemoveFromGroup={selectionTouchesGroup}
        onClose={() => setMenu(null)}
        onDelete={() => useCanvasStore.getState().removeNodes(selectedIds)}
        onDuplicate={() => useCanvasStore.getState().duplicateSelected()}
        onBringToFront={() => useCanvasStore.getState().bringSelectedToFront()}
        onSendToBack={() => useCanvasStore.getState().sendSelectedToBack()}
        onLock={() => useCanvasStore.getState().setSelectedLocked(true)}
        onUnlock={() => useCanvasStore.getState().setSelectedLocked(false)}
        onShowInfo={() => void showSelectedInfo()}
        onSaveAs={() => void exportSelected()}
        onAddText={() => {
          if (!menu) return;
          useCanvasStore.getState().addTextNode({ x: (menu.x - viewport.x) / viewport.k, y: (menu.y - viewport.y) / viewport.k });
        }}
        onCreateGroup={() => useCanvasStore.getState().createGroupFromSelection()}
        onUngroup={() => { const id = useCanvasStore.getState().selectedGroupId; if (id) useCanvasStore.getState().removeGroup(id); }}
        onRemoveFromGroup={() => useCanvasStore.getState().removeNodesFromGroups(selectedIds)}
        onArrange={() => { const s = useCanvasStore.getState(); if (!s.selectedIds.length) return; const p = arrangeNodes(s.nodes, s.selectedIds, (window.innerWidth / 2 - viewport.x) / viewport.k, (window.innerHeight / 2 - viewport.y) / viewport.k); s.updateNodePositions(p); forceUpdate((n) => n + 1); }}
        onFitToView={() => { const s = useCanvasStore.getState(); if (!s.nodes.length) return; const n = s.nodes, xs = n.map((x) => x.position.x), ys = n.map((y) => y.position.y); const w = Math.max(...n.map((n2, i) => xs[i] + n2.width)) - Math.min(...xs) + 120; const h = Math.max(...n.map((n2, i) => ys[i] + n2.height)) - Math.min(...ys) + 120; const k = Math.min(window.innerWidth / w, window.innerHeight / h, 2); setVP({ x: (window.innerWidth - w * k) / 2 - Math.min(...xs) * k + 60 * k, y: (window.innerHeight - h * k) / 2 - Math.min(...ys) * k + 60 * k, k: Math.max(k, 0.05) }); }}
        onSelectAll={() => useCanvasStore.getState().selectAll()} />}

      {infoNode && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-6" onClick={() => setInfoNode(null)}>
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-100">File Info</h2>
              <button className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => setInfoNode(null)}><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Source File</h3>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                  <span className="text-zinc-500">Name</span>
                  <span className="min-w-0 break-words text-zinc-100">{infoNode.sourceName ?? infoNode.name}</span>
                  <span className="text-zinc-500">Kind</span>
                  <span>{sourceKindLabel(infoNode)}</span>
                  <span className="text-zinc-500">MIME</span>
                  <span className="min-w-0 break-words">{sourceTypeLabel(infoNode)}</span>
                  <span className="text-zinc-500">Size</span>
                  <span>{infoNode.sourceSize !== undefined ? formatBytes(infoNode.sourceSize) : "Unknown"}</span>
                  <span className="text-zinc-500">Modified</span>
                  <span>{formatDate(infoNode.sourceLastModified)}</span>
                  <span className="text-zinc-500">Dimensions</span>
                  <span>{Math.round(infoNode.sourceWidth ?? infoNode.naturalWidth)} x {Math.round(infoNode.sourceHeight ?? infoNode.naturalHeight)}</span>
                  {infoNode.type === "video" && (
                    <>
                      <span className="text-zinc-500">Duration</span>
                      <span>{formatDuration(infoNode.sourceDuration)}</span>
                    </>
                  )}
                  {infoNode.type === "text" && (
                    <>
                      <span className="text-zinc-500">Text</span>
                      <span>{infoNode.text?.length ?? 0} chars</span>
                    </>
                  )}
                </div>
              </section>
              <section className="space-y-2 border-t border-zinc-800 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Canvas</h3>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                  <span className="text-zinc-500">Display name</span>
                  <span className="min-w-0 break-words">{infoNode.name}</span>
                  <span className="text-zinc-500">Canvas type</span>
                  <span>{infoNode.type}</span>
                  <span className="text-zinc-500">Canvas size</span>
                  <span>{Math.round(infoNode.width)} x {Math.round(infoNode.height)}</span>
                  <span className="text-zinc-500">Position</span>
                  <span>{Math.round(infoNode.position.x)}, {Math.round(infoNode.position.y)}</span>
                  <span className="text-zinc-500">Locked</span>
                  <span>{infoNode.locked ? "Yes" : "No"}</span>
                </div>
              </section>
            </div>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white" onClick={() => { setInfoNode(null); void exportSelected(); }}>
              <Download size={15} /> Save As...
            </button>
          </div>
        </div>
      )}

      {showBoards && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-6" onClick={() => setShowBoards(false)}>
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-100">Saved Canvases</h2>
              <button className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => setShowBoards(false)}><X size={16} /></button>
            </div>
            <div className="max-h-80 space-y-2 overflow-auto">
              {savedBoards.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 p-4 text-center text-zinc-500">No saved canvases yet.</div>
              ) : savedBoards.map((board) => (
                <button key={board.id} className="block w-full rounded-lg border border-zinc-800 p-3 text-left hover:bg-zinc-800" onClick={() => void loadSavedBoard(board.id)}>
                  <div className="font-medium text-zinc-100">{board.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{board.nodeCount} items · {board.groupCount} groups · {new Date(board.savedAt).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {fullscreenNode && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950/92 p-8 backdrop-blur-sm"
          onClick={() => setFullscreenId(null)}
        >
          <div className="absolute left-5 top-4 max-w-[calc(100vw-10rem)] truncate text-xs text-zinc-400">
            {fullscreenNode.name}
          </div>
          <button
            className="absolute right-5 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            title="Close fullscreen"
            onClick={(e) => { e.stopPropagation(); setFullscreenId(null); }}
          >
            <X size={18} />
          </button>
          <button
            className="absolute right-16 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            title="Exit fullscreen"
            onClick={(e) => { e.stopPropagation(); setFullscreenId(null); }}
          >
            <Minimize2 size={17} />
          </button>
          {fullscreenNode.type === "text" ? (
            <div
              className="max-h-full max-w-full whitespace-pre-wrap p-6"
              style={{
                width: Math.min(fullscreenNode.width * 1.5, window.innerWidth - FULLSCREEN_PADDING),
                maxWidth: `calc(100vw - ${FULLSCREEN_PADDING}px)`,
                maxHeight: `calc(100vh - ${FULLSCREEN_PADDING}px)`,
                color: fullscreenNode.fontColor ?? "#ffffff",
                fontSize: fullscreenNode.fontSize ?? 50,
                lineHeight: `${Math.round((fullscreenNode.fontSize ?? 50) * 1.35)}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {fullscreenNode.text}
            </div>
          ) : fullscreenNode.type === "image" ? (
            // Blob URLs are local user files; next/image cannot optimize them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fullscreenNode.blobUrl ?? ""}
              alt={fullscreenNode.name}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl shadow-black/60"
              style={{
                maxWidth: `calc(100vw - ${FULLSCREEN_PADDING}px)`,
                maxHeight: `calc(100vh - ${FULLSCREEN_PADDING}px)`,
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={fullscreenNode.blobUrl ?? ""}
              className="max-h-full max-w-full rounded-lg shadow-2xl shadow-black/60"
              style={{
                maxWidth: `calc(100vw - ${FULLSCREEN_PADDING}px)`,
                maxHeight: `calc(100vh - ${FULLSCREEN_PADDING}px)`,
              }}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      <FloatingToolbar viewport={viewport} setVP={setVP} refresh={() => forceUpdate((n) => n + 1)} />
    </div>
  );
}
