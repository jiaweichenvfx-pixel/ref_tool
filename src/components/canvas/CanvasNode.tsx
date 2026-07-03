"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { FileNode } from "@/lib/canvas/types";
import {
  Camera,
  Maximize2,
  Lock,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Trash2,
  Type,
  Volume2,
  VolumeX,
} from "lucide-react";
import { nanoid } from "nanoid";

type Corner = "br" | "bl" | "tr" | "tl";

type DragState = {
  kind: "" | "move" | "resize";
  corner: Corner;
  sx: number; sy: number;
  nx0: number; ny0: number;
  ow: number; oh: number;
  ratio: number;
  moved: boolean;
};

const FRAME_STEP = 1 / 24;
const PLAY_BUTTON_SIZE = 40;
const NODE_HIT_PADDING = 10;
const RESIZE_HANDLE_SIZE = 18;
const RESIZE_HANDLE_HIT_SIZE = 28;
const MIN_MEDIA_SIZE = 40;
const MIN_TEXT_WIDTH = 120;
const MIN_TEXT_FONT_SIZE = 8;
const MAX_TEXT_FONT_SIZE = 96;
const DEFAULT_TEXT_FONT_SIZE = 50;
const DEFAULT_TEXT_COLOR = "#ffffff";
const TEXT_VERTICAL_PADDING = 16;
const TEXT_COLORS = ["#ffffff", "#f87171", "#facc15", "#4ade80", "#38bdf8", "#c084fc"];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getTextLineHeight(fontSize: number) {
  return Math.round(fontSize * 1.35);
}

function getTextLineCount(text: string) {
  return Math.max(1, text.split("\n").length);
}

function getTextHeight(text: string, fontSize: number) {
  return getTextLineCount(text) * getTextLineHeight(fontSize) + TEXT_VERTICAL_PADDING;
}

function getResizedBox(
  d: DragState,
  dx: number,
  dy: number,
  options: { keepRatio: boolean; minWidth: number; minHeight: number },
) {
  const { corner, ow, oh, ratio } = d;
  let nw = corner.includes("r") ? ow + dx : ow - dx;
  let nh = corner.includes("b") ? oh + dy : oh - dy;

  if (options.keepRatio) {
    const widthScale = nw / ow;
    const heightScale = nh / oh;
    const dominantScale = Math.abs(widthScale - 1) > Math.abs(heightScale - 1) ? widthScale : heightScale;
    const nextScale = Math.max(
      options.minWidth / ow,
      options.minHeight / oh,
      dominantScale,
    );
    nw = ow * nextScale;
    nh = nw / Math.max(ratio, 0.1);
  }

  nw = Math.max(options.minWidth, nw);
  nh = Math.max(options.minHeight, nh);

  let nx = d.nx0;
  let ny = d.ny0;
  if (corner.includes("l")) nx = d.nx0 + (ow - nw);
  if (corner.includes("t")) ny = d.ny0 + (oh - nh);

  return { nx, ny, nw, nh };
}

export function CanvasNode({ node, isSelected, scale, isVisible }: { node: FileNode; isSelected: boolean; scale: number; isVisible: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [editingText, setEditingText] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dRef = useRef<DragState>({ kind: "", corner: "br", sx: 0, sy: 0, nx0: 0, ny0: 0, ow: 0, oh: 0, ratio: 1, moved: false });
  const textFontSize = node.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
  const textColor = node.fontColor ?? DEFAULT_TEXT_COLOR;
  const minNodeHeight = node.type === "text" ? getTextHeight(node.text ?? "", textFontSize) : MIN_MEDIA_SIZE;
  const shouldMountVideo = node.type === "video" && isVisible;

  const toggleVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const syncVideoState = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime || 0);
    setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    setPlaying(!v.paused);
  }, []);

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max = Number.isFinite(v.duration) ? v.duration : 0;
    v.currentTime = Math.min(Math.max(time, 0), max || time);
    setCurrentTime(v.currentTime);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    seekTo(v.currentTime + delta);
  }, [seekTo]);

  const setVideoMuted = useCallback((nextMuted: boolean) => {
    const v = videoRef.current;
    if (v) v.muted = nextMuted;
    setMuted(nextMuted);
  }, []);

  const setVideoLoop = useCallback((nextLoop: boolean) => {
    const v = videoRef.current;
    if (v) v.loop = nextLoop;
    setLoop(nextLoop);
  }, []);

  const setVideoRate = useCallback((nextRate: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }, []);

  const captureFrame = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const max = 400;
    const ratio = Math.min(max / v.videoWidth, max / v.videoHeight, 1);
    const width = Math.round(v.videoWidth * ratio);
    const height = Math.round(v.videoHeight * ratio);

    useCanvasStore.getState().addNodes([{
      id: nanoid(),
      type: "image",
      name: `${node.name} @ ${formatTime(v.currentTime)}.png`,
      blobUrl: URL.createObjectURL(blob),
      sourceName: `${node.name} @ ${formatTime(v.currentTime)}.png`,
      sourceType: "image/png",
      sourceSize: blob.size,
      sourceWidth: v.videoWidth,
      sourceHeight: v.videoHeight,
      sourceKind: "capture",
      position: { x: node.position.x + node.width + 24, y: node.position.y },
      width,
      height,
      naturalWidth: v.videoWidth,
      naturalHeight: v.videoHeight,
    }]);
  }, [node]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [node.blobUrl]);

  useEffect(() => {
    if (!editingText) return;
    textRef.current?.focus();
    textRef.current?.select();
  }, [editingText]);

  const expandTextHeightForLines = useCallback((value: string) => {
    const nextHeight = getTextHeight(value, textFontSize);
    if (nextHeight <= node.height) return;
    if (elRef.current) elRef.current.style.height = `${nextHeight}px`;
    useCanvasStore.getState().updateNodeSize(node.id, node.width, nextHeight, node.position);
  }, [node.height, node.id, node.position, node.width, textFontSize]);

  const onPD = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (node.locked) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-action]")) return;

    const rc = t.closest("[data-resize]") as HTMLElement | null;
    if (rc) {
      e.stopPropagation(); e.preventDefault();
      elRef.current!.setPointerCapture(e.pointerId);
      dRef.current = { kind: "resize", corner: rc.dataset.resize as Corner, sx: e.clientX, sy: e.clientY, nx0: node.position.x, ny0: node.position.y, ow: node.width, oh: node.height, ratio: node.width / (node.height || 1), moved: false };
      return;
    }
    if (t.closest("[data-play]")) return;

    e.stopPropagation(); e.preventDefault();
    elRef.current!.setPointerCapture(e.pointerId);
    dRef.current = { kind: "move", corner: "br", sx: e.clientX, sy: e.clientY, nx0: node.position.x, ny0: node.position.y, ow: 0, oh: 0, ratio: 1, moved: false };

    const s = useCanvasStore.getState();
    const self = s.selectedIds.includes(node.id), add = e.shiftKey || e.metaKey;
    if (!self) s.selectNode(node.id, add);
    else if (add) s.selectNode(node.id, true);
  }, [node]);

  const onPM = useCallback((e: React.PointerEvent) => {
    const d = dRef.current; if (!d.kind) return;
    d.moved = true;
    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale;

    if (d.kind === "move") {
      elRef.current!.style.transform = `translate(${d.nx0 + dx}px, ${d.ny0 + dy}px)`;
      const sids = useCanvasStore.getState().selectedIds;
      if (sids.length > 1) {
        const ns = useCanvasStore.getState().nodes;
        document.querySelectorAll<HTMLElement>("[data-nd]").forEach((nd) => {
          const nid = nd.dataset.nodeId; if (!nid || nid === node.id || !sids.includes(nid)) return;
          const n2 = ns.find((x) => x.id === nid);
          if (n2) nd.style.transform = `translate(${n2.position.x + dx}px, ${n2.position.y + dy}px)`;
        });
      }
      return;
    }

    const { nx, ny, nw, nh } = getResizedBox(d, dx, dy, {
      keepRatio: node.type !== "text",
      minWidth: node.type === "text" ? MIN_TEXT_WIDTH : MIN_MEDIA_SIZE,
      minHeight: minNodeHeight,
    });
    elRef.current!.style.transform = `translate(${nx}px, ${ny}px)`;
    elRef.current!.style.width = `${nw}px`;
    elRef.current!.style.height = `${nh}px`;
  }, [minNodeHeight, node.id, node.type, scale]);

  const onPU = useCallback((e: React.PointerEvent) => {
    const d = dRef.current; if (!d.kind) return;
    const kind = d.kind;
    dRef.current = { kind: "", corner: "br", sx: 0, sy: 0, nx0: 0, ny0: 0, ow: 0, oh: 0, ratio: 1, moved: false };
    elRef.current!.releasePointerCapture(e.pointerId);
    if (!d.moved) return;

    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale;
    const s = useCanvasStore.getState();

    if (kind === "move") {
      if (s.selectedIds.length <= 1) {
        s.updateNodePosition(node.id, { x: d.nx0 + dx, y: d.ny0 + dy });
        useCanvasStore.getState().absorbNodesIntoContainingGroups([node.id]);
      } else {
        const movedIds = [...s.selectedIds];
        s.moveSelectedBy(dx, dy);
        useCanvasStore.getState().absorbNodesIntoContainingGroups(movedIds);
      }
    } else {
      const { nx, ny, nw, nh } = getResizedBox(d, dx, dy, {
        keepRatio: node.type !== "text",
        minWidth: node.type === "text" ? MIN_TEXT_WIDTH : MIN_MEDIA_SIZE,
        minHeight: minNodeHeight,
      });
      s.updateNodeSize(node.id, nw, nh, { x: nx, y: ny });
      useCanvasStore.getState().absorbNodesIntoContainingGroups([node.id]);
    }
  }, [minNodeHeight, node.id, node.type, scale]);

	  const openFullscreen = useCallback(() => {
	    if (node.type === "text") return;
	    window.dispatchEvent(new CustomEvent("canvas-node-fullscreen", { detail: { id: node.id } }));
	  }, [node.id, node.type]);

  return (
    <div ref={elRef} data-nd data-node-id={node.id}
      className={`absolute overflow-visible rounded-lg ${isSelected ? "z-10 ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#2b2b2f] shadow-[0_0_0_1px_rgba(8,145,178,0.9),0_0_24px_rgba(103,232,249,0.5)]" : hovered ? "shadow-[0_0_0_1px_rgba(255,255,255,0.22)]" : "shadow-none"}`}
      style={{ width: node.width, height: node.height, transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
      onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}
      onContextMenu={(e) => {
        const add = e.shiftKey || e.metaKey;
        const s = useCanvasStore.getState();
        if (!s.selectedIds.includes(node.id) || add) s.selectNode(node.id, add);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-action], [data-resize]")) return;
        e.stopPropagation();
        if (node.type === "text") {
          useCanvasStore.getState().selectNode(node.id);
          window.setTimeout(() => setEditingText(true), 0);
          return;
        }
        openFullscreen();
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute rounded-xl"
        style={{
          inset: -NODE_HIT_PADDING / scale,
          cursor: node.locked ? "default" : "move",
        }}
      />
      <div className={`relative h-full w-full rounded-lg ${node.type === "text" ? "bg-transparent" : "overflow-hidden bg-zinc-900/20"}`}>
	        {node.type === "text" ? (
            <>
	            <textarea
	              ref={textRef}
	              key={`${node.id}:${node.text ?? ""}`}
	              className={`h-full w-full resize-none border-0 bg-transparent p-2 text-white outline-none placeholder:text-white/35 focus:ring-0 ${editingText && isSelected ? "pointer-events-auto cursor-text" : "pointer-events-none cursor-move select-none"}`}
	              defaultValue={node.text ?? ""}
	              placeholder="Add note..."
	              readOnly={!editingText || !isSelected}
	              spellCheck={false}
                style={{
                  fontSize: textFontSize,
                  lineHeight: `${getTextLineHeight(textFontSize)}px`,
                  color: textColor,
                }}
                wrap="off"
	              onPointerDown={(e) => {
	                if (editingText) e.stopPropagation();
	              }}
                onInput={(e) => expandTextHeightForLines(e.currentTarget.value)}
	              onDoubleClick={(e) => {
	                e.stopPropagation();
	                setEditingText(true);
	              }}
	              onBlur={(e) => {
                  expandTextHeightForLines(e.currentTarget.value);
	                useCanvasStore.getState().updateNodeText(node.id, e.currentTarget.value);
	                setEditingText(false);
	              }}
	            />
              {isSelected && !node.locked && (
                <div
                  data-action
                  className="absolute -top-9 left-0 z-30 flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-950/90 px-2 py-1 text-xs text-zinc-200 shadow-lg shadow-black/35 backdrop-blur-md"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Type size={12} className="text-zinc-400" />
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30"
                    disabled={textFontSize <= MIN_TEXT_FONT_SIZE}
                    onClick={() => useCanvasStore.getState().updateNodeFontSize(node.id, textFontSize - 2)}
                    title="Smaller text"
                  >
                    -
                  </button>
                  <input
                    aria-label="Text size"
                    className="h-5 w-12 rounded border border-white/10 bg-zinc-900 px-1 text-center text-[11px] text-zinc-100 outline-none focus:border-cyan-300/70"
                    type="number"
                    min={MIN_TEXT_FONT_SIZE}
                    max={MAX_TEXT_FONT_SIZE}
                    value={textFontSize}
                    onChange={(e) => useCanvasStore.getState().updateNodeFontSize(node.id, Number(e.currentTarget.value))}
                  />
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30"
                    disabled={textFontSize >= MAX_TEXT_FONT_SIZE}
                    onClick={() => useCanvasStore.getState().updateNodeFontSize(node.id, textFontSize + 2)}
                    title="Larger text"
                  >
                    +
                  </button>
                  <div className="mx-1 h-4 w-px bg-white/10" />
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`h-5 w-5 rounded-full border ${textColor.toLowerCase() === color ? "border-cyan-300" : "border-white/20"} hover:scale-110`}
                      style={{ backgroundColor: color }}
                      onClick={() => useCanvasStore.getState().updateNodeFontColor(node.id, color)}
                      title={`Text color ${color}`}
                    />
                  ))}
                  <input
                    aria-label="Text color"
                    className="h-5 w-6 cursor-pointer rounded border border-white/10 bg-transparent p-0"
                    type="color"
                    value={textColor}
                    onChange={(e) => useCanvasStore.getState().updateNodeFontColor(node.id, e.currentTarget.value)}
                    title="Custom text color"
                  />
                </div>
              )}
            </>
	        ) : node.type === "image" ? (
	          // Blob URLs are local user files; next/image cannot optimize them.
	          // eslint-disable-next-line @next/next/no-img-element
	          <img src={node.blobUrl ?? ""} alt={node.name} draggable={false} className="pointer-events-none h-full w-full" style={{ objectFit: "fill" }} />
	        ) : (
	          <>
              {shouldMountVideo ? (
	              <video ref={videoRef} src={node.blobUrl ?? ""} preload="metadata" playsInline draggable={false}
                className="pointer-events-none h-full w-full" style={{ objectFit: "fill" }}
                muted={muted}
                loop={loop}
                onLoadedMetadata={syncVideoState}
                onDurationChange={syncVideoState}
                onTimeUpdate={syncVideoState}
                onPlay={() => setPlaying(true)}
                onEnded={() => setPlaying(false)}
                onPause={() => setPlaying(false)} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-950/50 text-xs font-medium text-zinc-500">
                  Video
                </div>
              )}
            {shouldMountVideo && !playing && (
              <button
                data-action
                aria-label="Play video"
                className="absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white/90 shadow-lg shadow-black/30 hover:scale-110 hover:bg-black/70"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVideo();
                }}
                style={{
                  width: PLAY_BUTTON_SIZE / scale,
                  height: PLAY_BUTTON_SIZE / scale,
                  minWidth: PLAY_BUTTON_SIZE,
                  minHeight: PLAY_BUTTON_SIZE,
                }}
              >
                <Play size={20 / scale} fill="white" />
              </button>
            )}
            {shouldMountVideo && (hovered || isSelected || playing) && (
              <div
                data-action
                className="absolute inset-x-2 bottom-2 z-20 rounded-lg border border-white/10 bg-zinc-950/75 px-2 py-1.5 text-white shadow-xl shadow-black/40 backdrop-blur-md"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <input
                  aria-label="Video progress"
                  className="mb-1 h-1 w-full cursor-pointer accent-cyan-300"
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.01}
                  value={Math.min(currentTime, duration || currentTime)}
                  onChange={(e) => seekTo(Number(e.currentTarget.value))}
                />
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                  <button className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10" onClick={toggleVideo} title={playing ? "Pause" : "Play"}>
                    {playing ? <Pause size={13} /> : <Play size={13} fill="white" />}
                  </button>
                  <button className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10" onClick={() => seekBy(-FRAME_STEP)} title="Previous frame">
                    <SkipBack size={13} />
                  </button>
                  <button className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10" onClick={() => seekBy(FRAME_STEP)} title="Next frame">
                    <SkipForward size={13} />
                  </button>
                  <span className="min-w-16 tabular-nums text-zinc-400">{formatTime(currentTime)} / {formatTime(duration)}</span>
                  <button className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10" onClick={() => setVideoMuted(!muted)} title={muted ? "Unmute" : "Mute"}>
                    {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <button className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10 ${loop ? "bg-cyan-400/20 text-cyan-200" : ""}`} onClick={() => setVideoLoop(!loop)} title="Loop">
                    <Repeat size={13} />
                  </button>
                  <select
                    aria-label="Playback speed"
                    className="h-6 rounded-md border border-white/10 bg-zinc-900 px-1 text-[10px] text-zinc-200 outline-none"
                    value={playbackRate}
                    onChange={(e) => setVideoRate(Number(e.currentTarget.value))}
                  >
                    {[0.25, 0.5, 1, 1.5, 2].map((rate) => (
                      <option key={rate} value={rate}>{rate}x</option>
                    ))}
                  </select>
                  <button className="ml-auto flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10" onClick={() => void captureFrame()} title="Capture current frame">
                    <Camera size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {node.locked && (
        <div className="pointer-events-none absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-cyan-200 shadow-md shadow-black/30">
          <Lock size={12} />
        </div>
      )}
      {isSelected && (["br","bl","tr","tl"] as Corner[]).map((c) => {
        const handleSize = RESIZE_HANDLE_SIZE / scale;
        const hitSize = RESIZE_HANDLE_HIT_SIZE / scale;
        return (
          <div
            key={c}
            data-resize={c}
            className={`absolute z-30 flex items-center justify-center ${c.includes("b") ? "bottom-0 translate-y-1/2" : "top-0 -translate-y-1/2"} ${c.includes("r") ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"} ${c === "br" || c === "tl" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
            style={{ width: hitSize, height: hitSize }}
          >
            <span
              className="rounded-sm border border-white/80 bg-zinc-800 shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_0_10px_rgba(103,232,249,0.4)] hover:bg-cyan-300"
              style={{ width: handleSize, height: handleSize }}
            />
          </div>
        );
      })}
      {hovered && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
            <span className="truncate text-[10px] text-white/80">{node.name}</span>
          </div>
          <button data-action className="absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
            onClick={(e) => { e.stopPropagation(); useCanvasStore.getState().removeNodes([node.id]); }}>
            <Trash2 size={11} />
          </button>
          <button data-action className="absolute -right-1 top-5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/90 text-white ring-1 ring-white/20 hover:bg-zinc-800"
            title="Fullscreen"
            onClick={(e) => { e.stopPropagation(); openFullscreen(); }}>
            <Maximize2 size={11} />
          </button>
        </>
      )}
    </div>
  );
}
