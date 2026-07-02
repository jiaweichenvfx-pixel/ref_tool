"use client";

import { useMemo, useRef, useState } from "react";
import { Ungroup } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { CanvasGroup, FileNode } from "@/lib/canvas/types";

const GROUP_COLORS = ["#0891b2", "#7c3aed", "#16a34a", "#ca8a04", "#dc2626", "#475569"];
const PAD = 18;
const HEADER = 40;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  boundsX: number;
  boundsY: number;
  moved: boolean;
  members: { id: string; x: number; y: number }[];
};

export function CanvasGroupRegion({
  group,
  nodes,
  isSelected,
  scale,
}: {
  group: CanvasGroup;
  nodes: FileNode[];
  isSelected: boolean;
  scale: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState({ groupId: group.id, note: group.note });
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftNote = draft.groupId === group.id ? draft.note : group.note;
  const members = useMemo(() => nodes.filter((node) => group.nodeIds.includes(node.id)), [group.nodeIds, nodes]);

  const bounds = useMemo(() => {
    if (members.length < 2) return null;
    const left = Math.min(...members.map((node) => node.position.x));
    const top = Math.min(...members.map((node) => node.position.y));
    const right = Math.max(...members.map((node) => node.position.x + node.width));
    const bottom = Math.max(...members.map((node) => node.position.y + node.height));
    return {
      x: left - PAD,
      y: top - HEADER - PAD,
      width: Math.max(120, right - left + PAD * 2),
      height: Math.max(90, bottom - top + HEADER + PAD * 2),
    };
  }, [members]);

  if (!bounds) return null;

  const showControls = hovered || isSelected;
  const selectGroup = () => useCanvasStore.getState().selectGroup(group.id);
  const commitNote = () => {
    if (draftNote !== group.note) useCanvasStore.getState().updateGroup(group.id, { note: draftNote });
  };
  const resetDragTransforms = () => {
    elRef.current?.style.removeProperty("transform");
    for (const member of dragRef.current?.members ?? []) {
      document.querySelector<HTMLElement>(`[data-node-id="${member.id}"]`)?.style.removeProperty("transform");
    }
  };
  const cancelDrag = () => {
    if (!dragRef.current) return;
    resetDragTransforms();
    dragRef.current = null;
  };

  return (
    <div
      ref={elRef}
      data-group
      className={`absolute cursor-grab rounded-xl border transition-shadow active:cursor-grabbing ${isSelected ? "shadow-[0_0_0_2px_rgba(103,232,249,0.55),0_0_24px_rgba(8,145,178,0.28)]" : "shadow-none"}`}
      style={{
        transform: `translate(${bounds.x}px, ${bounds.y}px)`,
        width: bounds.width,
        height: bounds.height,
        borderColor: `${group.color}${isSelected ? "ff" : "99"}`,
        backgroundColor: `${group.color}1f`,
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-group-action]")) return;
        e.stopPropagation();
        selectGroup();
        const movableMembers = members
          .filter((node) => !node.locked)
          .map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
        if (!movableMembers.length) return;
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          boundsX: bounds.x,
          boundsY: bounds.y,
          moved: false,
          members: movableMembers,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = (e.clientX - drag.startX) / scale;
        const dy = (e.clientY - drag.startY) / scale;
        if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        drag.moved = true;
        if (elRef.current) elRef.current.style.transform = `translate(${drag.boundsX + dx}px, ${drag.boundsY + dy}px)`;
        for (const member of drag.members) {
          const nodeEl = document.querySelector<HTMLElement>(`[data-node-id="${member.id}"]`);
          if (nodeEl) nodeEl.style.transform = `translate(${member.x + dx}px, ${member.y + dy}px)`;
        }
      }}
      onPointerUp={(e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = (e.clientX - drag.startX) / scale;
        const dy = (e.clientY - drag.startY) / scale;
        if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          dragRef.current = null;
          return;
        }
        const positions = drag.members.map((member) => ({ id: member.id, x: member.x + dx, y: member.y + dy }));
        resetDragTransforms();
        dragRef.current = null;
        useCanvasStore.getState().updateNodePositions(positions);
        useCanvasStore.getState().absorbNodesIntoContainingGroups(positions.map((position) => position.id));
      }}
      onPointerCancel={cancelDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute left-2 right-2 top-2 flex items-start gap-2">
        <textarea
          data-group-action
          className="min-h-7 flex-1 resize-none rounded-md border border-white/10 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-300/60"
          placeholder="Add note..."
          value={draftNote}
          rows={1}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft({ groupId: group.id, note: e.currentTarget.value })}
          onBlur={commitNote}
        />
        {showControls && (
          <button
            data-group-action
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-950/70 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="Ungroup"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              useCanvasStore.getState().removeGroup(group.id);
            }}
          >
            <Ungroup size={14} />
          </button>
        )}
      </div>
      {showControls && (
        <div data-group-action className="absolute -bottom-9 left-2 flex gap-1 rounded-lg border border-white/10 bg-zinc-950/85 p-1 shadow-lg shadow-black/30">
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              className={`h-5 w-5 rounded-md border ${group.color === color ? "border-white" : "border-white/20"}`}
              style={{ backgroundColor: color }}
              title="Group background color"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useCanvasStore.getState().updateGroup(group.id, { color });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
