# Slopeffect Desktop Host

This directory contains the production-grade frontend and Tauri integration shell for **Slopeffect** — a premium desktop video editing workspace.

## Technology Stack

- **Framework**: [React](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- **Build Engine**: [Vite](https://vite.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Tauri Shell**: [Tauri v2](https://v2.tauri.app/) (delivering seamless OS-level window management and native performance)
- **Styling**: Harmony HSL variables and rich visual CSS tokens with premium glassmorphism interfaces.

## Key Subdirectories

- `/src`: Active React application core.
  - `/src/store`: Zustand unified editor state management (`editorStore.ts`).
  - `/src/services`: Tauri IPC safe communication bridges.
  - `/src/types`: Strongly-typed definitions for project documents, scenes, layers, tracks, keyframes, and multi-effect stacks.
- `/src-tauri`: Rust-powered host environment.
  - `/src-tauri/src/main.rs`: IPC commands (e.g. `probe_media_file`, `pick_media_file`) and event handling loops.

## Active Scripts

Run these scripts from this subdirectory:

- `npm run dev`: Starts the Vite client dev server.
- `npm run build`: Type-checks TypeScript (`tsc -b`) and builds production assets (`vite build`).
- `npm run lint`: Performs lint analysis (`eslint .`).
- `npm run preview`: Previews built assets locally.
