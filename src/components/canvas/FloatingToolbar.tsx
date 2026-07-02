"use client";

import {
  BringToFront,
  Copy,
  Grid3X3,
  Group,
  Lock,
  Maximize2,
  Minus,
  Plus,
  SendToBack,
  Type,
  Ungroup,
  Unlock,
} from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/store";
import { arrangeNodes } from "@/lib/canvas/arrange";
import type { Viewport } from "@/lib/canvas/types";

type Props = { viewport: Viewport; setVP: (vp: Viewport) => void; refresh: () => void };

export function FloatingToolbar({ viewport, setVP, refresh }: Props) {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedGroupId = useCanvasStore((s) => s.selectedGroupId);
  const selectedCount = selectedIds.length;
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
  const allSelectedLocked = selectedNodes.length > 0 && selectedNodes.every((n) => n.locked);

  const zoomIn = () => setVP({ ...viewport, k: Math.min(5, viewport.k * 1.2) });
  const zoomOut = () => setVP({ ...viewport, k: Math.max(0.05, viewport.k / 1.2) });
  const run = (fn: () => void) => {
    fn();
    refresh();
  };

  const arrange = () => {
    const st = useCanvasStore.getState(); if (!st.selectedIds.length) return;
    const p = arrangeNodes(st.nodes, st.selectedIds, (window.innerWidth / 2 - viewport.x) / viewport.k, (window.innerHeight / 2 - viewport.y) / viewport.k);
    st.updateNodePositions(p);
    refresh();
  };

  const addText = () => {
    const x = (window.innerWidth / 2 - viewport.x) / viewport.k - 120;
    const y = (window.innerHeight / 2 - viewport.y) / viewport.k - 60;
    run(() => useCanvasStore.getState().addTextNode({ x, y }));
  };

  const fit = () => {
    const st = useCanvasStore.getState(); if (!st.nodes.length) return;
    const n = st.nodes, xs = n.map((x) => x.position.x), ys = n.map((y) => y.position.y);
    const w = Math.max(...n.map((n2, i) => xs[i] + n2.width)) - Math.min(...xs) + 120;
    const h = Math.max(...n.map((n2, i) => ys[i] + n2.height)) - Math.min(...ys) + 120;
    const k = Math.min(window.innerWidth / w, window.innerHeight / h, 2);
    setVP({ x: (window.innerWidth - w * k) / 2 - Math.min(...xs) * k + 60 * k, y: (window.innerHeight - h * k) / 2 - Math.min(...ys) * k + 60 * k, k: Math.max(k, 0.05) });
  };

  return (
    <div data-menu className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-md">
      <button className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={zoomOut}><Minus size={14} /></button>
      <span className="w-12 text-center text-xs font-medium text-zinc-400 tabular-nums">{Math.round(viewport.k * 100)}%</span>
      <button className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={zoomIn}><Plus size={14} /></button>
      <div className="mx-1 h-5 w-px bg-zinc-800" />
      <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={addText}><Type size={13} />Text</button>
      <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" disabled={selectedCount === 0} onClick={arrange}><Grid3X3 size={13} />Arrange</button>
      {selectedGroupId ? (
        <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => run(() => useCanvasStore.getState().removeGroup(selectedGroupId))}><Ungroup size={13} />Ungroup</button>
      ) : (
        <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" disabled={selectedCount < 2} onClick={() => run(() => useCanvasStore.getState().createGroupFromSelection())}><Group size={13} />Group</button>
      )}
      <button className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" disabled={selectedCount === 0} onClick={() => run(() => useCanvasStore.getState().duplicateSelected())} title="Duplicate"><Copy size={13} /></button>
      <button className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" disabled={selectedCount === 0} onClick={() => run(() => useCanvasStore.getState().bringSelectedToFront())} title="Bring to front"><BringToFront size={13} /></button>
      <button className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" disabled={selectedCount === 0} onClick={() => run(() => useCanvasStore.getState().sendSelectedToBack())} title="Send to back"><SendToBack size={13} /></button>
      <button className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" disabled={selectedCount === 0} onClick={() => run(() => useCanvasStore.getState().setSelectedLocked(!allSelectedLocked))} title={allSelectedLocked ? "Unlock" : "Lock"}>{allSelectedLocked ? <Unlock size={13} /> : <Lock size={13} />}</button>
      <div className="mx-1 h-5 w-px bg-zinc-800" />
      <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={fit}><Maximize2 size={13} />Fit</button>
    </div>
  );
}
