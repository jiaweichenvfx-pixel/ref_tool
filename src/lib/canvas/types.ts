export type Position = { x: number; y: number };
export type Viewport = { x: number; y: number; k: number };

export type FileNode = {
  id: string;
  type: "image" | "video" | "text";
  name: string;
  blobUrl?: string;
  text?: string;
  fontSize?: number;
  fontColor?: string;
  sourceName?: string;
  sourceType?: string;
  sourceSize?: number;
  sourceLastModified?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceDuration?: number;
  sourceKind?: "drop" | "paste" | "capture" | "text";
  position: Position;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  locked?: boolean;
};

export type CanvasGroup = {
  id: string;
  nodeIds: string[];
  color: string;
  note: string;
};

export type PersistedFileNode = Omit<FileNode, "blobUrl"> & {
  size?: number;
};
