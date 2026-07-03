# Ref Tool

Ref Tool is a desktop-friendly reference canvas inspired by PureRef, with first-class support for videos. It lets artists and visual workers drop images, videos, and notes onto an infinite canvas, arrange them quickly, group related references, and save boards for later use.

The project is currently built with Next.js, React, and Electron so the same canvas UI can run in a browser during development and as a packaged desktop app on macOS / Windows.

## Features

- Drag and drop images and videos onto an infinite canvas.
- Pan, zoom, select, multi-select, resize, duplicate, lock, and reorder items.
- Play videos directly on the canvas.
- Double-click a media item to view it in a larger fullscreen overlay.
- Add text notes with editable text, font size, and color.
- Use `Arrange` to lay selected items out without stacking them together.
- Create groups from selected items, move grouped items together, change group color, and add group notes.
- Auto-add items to a group when they are dragged into a group region.
- Remove selected items from a group through the context menu.
- Use visible marquee selection when dragging across empty canvas space.
- Use undo / redo for canvas edits.
- Show source file information from the right-click menu.
- Save a source file copy with `Save As`.
- Save and open `.reftool` project files in the desktop app.

## Supported Files

Ref Tool accepts common image and video formats:

- Images: `jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `svg`
- Videos: `mp4`, `m4v`, `webm`, `mov`

Browser playback support still depends on the system/browser codec support. For the most reliable playback, use `mp4` / H.264 or `webm`.

## Persistence Model

The app is designed to avoid pushing large videos into browser-style storage whenever the desktop shell can access the original file.

In the Electron desktop app:

- Dropped media is saved as a source file path plus metadata.
- `.reftool` project files store layout, groups, text, notes, thumbnails, and source references.
- Large source videos stay on disk instead of being embedded inside the project file.
- Reopened projects load media through the local source path.

In the browser/dev mode:

- Small media can be restored from IndexedDB/local browser storage.
- Large videos may be skipped from automatic restore to avoid memory spikes.
- Desktop project save/open features require Electron.

This means the preferred long-term workflow is: keep source files on disk, save the board as `.reftool`, and move both together if sharing or archiving a project.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the web development server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Run the Electron app against the dev server:

```bash
npm run dev
npm run desktop:dev
```

Build and run the desktop app:

```bash
npm run desktop
```

## Build Commands

Create a static Next.js build:

```bash
npm run build
```

Package for macOS:

```bash
npm run dist:mac
```

Package for Windows:

```bash
npm run dist:win
```

Generated app packages are written to:

```text
release/
```

`release/` is intentionally ignored by git. GitHub should store the source code; release artifacts such as `.app`, `.dmg`, `.zip`, or `.exe` should be uploaded separately through GitHub Releases or shared manually.

## Verification

Run the static canvas checks:

```bash
npm run check:canvas
```

Run the Electron/persistence checks:

```bash
npm run check:electron
```

Run lint:

```bash
npm run lint
```

Recommended pre-push verification:

```bash
npm run check:canvas
npm run check:electron
npm run lint
npm run build
```

## Desktop Distribution Notes

Current packages are unsigned development builds. They can be tested locally, but macOS may show security warnings when the app is shared with other people.

For a more professional distribution flow:

1. Build the app with `npm run dist:mac` or `npm run dist:win`.
2. Upload the generated installer/archive from `release/` to GitHub Releases.
3. For macOS public sharing, add Apple Developer signing and notarization later.

The app does not need to be listed on the Mac App Store to be shared with friends, but signing and notarization make the install experience much smoother.

## Tech Stack

- Next.js 16
- React 19
- Zustand
- Tailwind CSS
- Electron
- Electron Builder

## Project Structure

```text
electron/
  main.cjs          Electron main process, local protocols, save/open dialogs
  preload.cjs       Safe desktop API exposed to the renderer

src/app/
  page.tsx          Main canvas app
  globals.css       Global styling

src/components/canvas/
  CanvasNode.tsx          Image/video/text item rendering
  InfiniteCanvas.tsx      Pan/zoom/selection canvas shell
  CanvasGroupRegion.tsx   Group region rendering and editing
  FloatingToolbar.tsx     Main floating canvas toolbar
  ContextMenu.tsx         Right-click actions

src/lib/canvas/
  store.ts          Canvas state, history, grouping, alignment
  arrange.ts        Arrange layout logic
  storage.ts        Browser-side persistence helpers
  types.ts          Canvas data types

scripts/
  check-*.mjs       Static regression checks
```

## Roadmap

- Relink missing source files when a `.reftool` project is moved.
- Add app icon and polished app metadata.
- Add signed/notarized macOS builds.
- Add Windows packaging verification.
- Add better thumbnail cache management for large projects.
- Add export/share workflow for bundling `.reftool` plus source media.
