"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Viewport } from "@/lib/canvas/types";

type Props = {
  viewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
  onCanvasClick?: () => void;
  onBoxSelect?: (r: { x: number; y: number; w: number; h: number }) => void;
  children: React.ReactNode;
};

export function InfiniteCanvas({ viewport, onViewportChange, onCanvasClick, onBoxSelect, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const vpRef = useRef(viewport);
  const cbRef = useRef({ onViewportChange, onCanvasClick, onBoxSelect });

  const pan = useRef({ on: false, sx: 0, sy: 0, ix: 0, iy: 0 });
  const box = useRef({ on: false, sx: 0, sy: 0, wx: 0, wy: 0, w: 0, h: 0 });
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    vpRef.current = viewport;
    cbRef.current = { onViewportChange, onCanvasClick, onBoxSelect };
  }, [viewport, onViewportChange, onCanvasClick, onBoxSelect]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const vp = vpRef.current;
    const f = Math.pow(1.1, -e.deltaY / 100);
    const nk = Math.min(Math.max(vp.k * f, 0.03), 5);
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const wx = (mx - vp.x) / vp.k, wy = (my - vp.y) / vp.k;
    cbRef.current.onViewportChange({ x: mx - wx * nk, y: my - wy * nk, k: nk });
  }, []);

  const onPD = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nd],[data-group],[data-menu]")) return;
    if (e.button === 1) { e.preventDefault(); pan.current = { on: true, sx: e.clientX, sy: e.clientY, ix: vpRef.current.x, iy: vpRef.current.y }; document.body.style.cursor = "grabbing"; return; }
    if (e.button === 0) {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      box.current = { on: true, sx: e.clientX, sy: e.clientY, wx: 0, wy: 0, w: 0, h: 0 };
      setSelectionBox({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 });
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    const move = (e: PointerEvent) => {
      if (pan.current.on) {
        const dx = e.clientX - pan.current.sx, dy = e.clientY - pan.current.sy;
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; cbRef.current.onViewportChange({ x: pan.current.ix + dx, y: pan.current.iy + dy, k: vpRef.current.k }); });
        return;
      }
      if (box.current.on) {
        const vp = vpRef.current;
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        const k = vp.k;
        box.current = { on: true, sx: box.current.sx, sy: box.current.sy, wx: Math.min((box.current.sx - r.left - vp.x) / k, (e.clientX - r.left - vp.x) / k), wy: Math.min((box.current.sy - r.top - vp.y) / k, (e.clientY - r.top - vp.y) / k), w: Math.abs(e.clientX - box.current.sx) / k, h: Math.abs(e.clientY - box.current.sy) / k };
        setSelectionBox({ x: Math.min(box.current.sx, e.clientX) - r.left, y: Math.min(box.current.sy, e.clientY) - r.top, w: Math.abs(e.clientX - box.current.sx), h: Math.abs(e.clientY - box.current.sy) });
      }
    };
    const up = () => {
      if (pan.current.on) { pan.current.on = false; document.body.style.cursor = ""; return; }
      if (box.current.on) { box.current.on = false; setSelectionBox(null); const b = box.current; if (b.w > 4 || b.h > 4) cbRef.current.onBoxSelect?.({ x: b.wx, y: b.wy, w: b.w, h: b.h }); else cbRef.current.onCanvasClick?.(); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const f = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", f, { passive: false });
    return () => el.removeEventListener("wheel", f);
  }, []);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-[#2b2b2f]" onPointerDown={onPD} onWheel={onWheel}>
      <div className="absolute origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})` }}>
        {children}
      </div>
      {selectionBox && (
        <div
          className="pointer-events-none absolute z-40 rounded-md border border-cyan-300 bg-cyan-300/15 shadow-[0_0_0_1px_rgba(8,145,178,0.5),0_0_24px_rgba(103,232,249,0.24)]"
          style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }}
        />
      )}
    </div>
  );
}
