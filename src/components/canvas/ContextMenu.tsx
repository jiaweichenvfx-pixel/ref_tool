"use client";

import { useEffect, useRef } from "react";
import {
  Trash2,
  Copy,
  Grid3X3,
  Download,
  Group,
  Info,
  Maximize2,
  List,
  X,
  BringToFront,
  SendToBack,
  Lock,
  Type,
  Ungroup,
  Unlock,
} from "lucide-react";

type Props = {
  x: number;
  y: number;
  hasSelection: boolean;
  hasSelectedGroup: boolean;
  canRemoveFromGroup: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onShowInfo: () => void;
  onSaveAs: () => void;
  onAddText: () => void;
  onCreateGroup: () => void;
  onUngroup: () => void;
  onRemoveFromGroup: () => void;
  onArrange: () => void;
  onFitToView: () => void;
  onSelectAll: () => void;
};

export function ContextMenu({
  x,
  y,
  hasSelection,
  hasSelectedGroup,
  canRemoveFromGroup,
  onClose,
  onDelete,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onLock,
  onUnlock,
  onShowInfo,
  onSaveAs,
  onAddText,
  onCreateGroup,
  onUngroup,
  onRemoveFromGroup,
  onArrange,
  onFitToView,
  onSelectAll,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay to avoid the same right-click closing immediately
    setTimeout(() => {
      window.addEventListener("mousedown", handler);
      window.addEventListener("keydown", keydown);
    }, 0);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keydown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-menu
      className="fixed z-[200] min-w-[180px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 py-1 shadow-2xl shadow-black/40"
      style={{ left: x, top: y }}
    >
      <MenuItem
        icon={<Trash2 size={14} />}
        label="Delete"
        shortcut="Del"
        disabled={!hasSelection}
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
      <MenuItem
        icon={<Copy size={14} />}
        label="Duplicate"
        shortcut="Ctrl+D"
        disabled={!hasSelection}
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      />
      <MenuItem icon={<BringToFront size={14} />} label="Bring to Front" shortcut="Ctrl+]" disabled={!hasSelection} onClick={() => { onBringToFront(); onClose(); }} />
      <MenuItem icon={<SendToBack size={14} />} label="Send to Back" shortcut="Ctrl+[" disabled={!hasSelection} onClick={() => { onSendToBack(); onClose(); }} />
      <MenuItem icon={<Lock size={14} />} label="Lock" shortcut="Ctrl+L" disabled={!hasSelection} onClick={() => { onLock(); onClose(); }} />
      <MenuItem icon={<Unlock size={14} />} label="Unlock" disabled={!hasSelection} onClick={() => { onUnlock(); onClose(); }} />
      <MenuItem icon={<Info size={14} />} label="File Info" disabled={!hasSelection} onClick={() => { onShowInfo(); onClose(); }} />
      <MenuItem icon={<Download size={14} />} label="Save As..." disabled={!hasSelection} onClick={() => { onSaveAs(); onClose(); }} />
      <MenuItem icon={<Type size={14} />} label="Add Text" onClick={() => { onAddText(); onClose(); }} />
      <MenuItem icon={<Group size={14} />} label="Create Group" shortcut="Ctrl+G" disabled={!hasSelection} onClick={() => { onCreateGroup(); onClose(); }} />
      <MenuItem icon={<Ungroup size={14} />} label="Ungroup" shortcut="Ctrl+Shift+G" disabled={!hasSelectedGroup} onClick={() => { onUngroup(); onClose(); }} />
      <MenuItem icon={<Ungroup size={14} />} label="Remove from Group" disabled={!canRemoveFromGroup} onClick={() => { onRemoveFromGroup(); onClose(); }} />
      <div className="mx-2 my-1 border-t border-zinc-800" />
      <MenuItem
        icon={<Grid3X3 size={14} />}
        label="Arrange"
        disabled={!hasSelection}
        onClick={() => {
          onArrange();
          onClose();
        }}
      />
      <MenuItem
        icon={<Maximize2 size={14} />}
        label="Fit to View"
        onClick={() => {
          onFitToView();
          onClose();
        }}
      />
      <MenuItem
        icon={<List size={14} />}
        label="Select All"
        shortcut="Ctrl+A"
        onClick={() => {
          onSelectAll();
          onClose();
        }}
      />
      <div className="mx-2 my-1 border-t border-zinc-800" />
      <MenuItem
        icon={<X size={14} />}
        label="Close Menu"
        shortcut="Esc"
        onClick={onClose}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
        disabled
          ? "cursor-not-allowed text-zinc-600"
          : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex w-4 items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-xs text-zinc-600">{shortcut}</span>
      )}
    </button>
  );
}
