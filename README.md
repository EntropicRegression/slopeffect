# Slopeffect: Premium Desktop Video Editing Workspace

Slopeffect is a high-performance desktop video editor host designed to deliver premium keyframe-driven timeline editing, multi-track layering, compositing, and visual effect stacking.

## Core Features

- **Multi-Track Timeline**: Independent layering for Video, Audio, and SVG Vector assets.
- **Advanced Keyframing (Graph Editor)**: High-fidelity Bezier, ease-in, ease-out, and linear animation channel drawers.
- **Composable Multi-Effects Stack**: Real-time visual effects stack (e.g. Blur, Brightness, Contrast, Grayscale, Sepia, Hue Rotate, Invert, Drop Shadow).
- **Windows Native Pickers & Media Probing**: Zero-browser-sandbox limitations using native Windows dialogs and back-end `ffprobe` tech-metadata analysis.

---

## Architectural Layout

```
slopeffect/
├── apps/
│   └── desktop/           # React + TS + Vite frontend & Tauri Windows host wrapper
├── crates/
│   ├── slopeffect-core/   # Shared Rust types for clips, tracks, and scenes
│   ├── slopeffect-media/  # Native media analysis (ffprobe) & SipHasher Cache managers
│   └── slopeffect-project/# Unified Rust model persistence (.slopeproj)
└── archive/
    └── mockup/            # Historical prototype mockup preserved for reference
```

---

## Quick-Start Guide

### Prerequisites

1. Install **Node.js** (v18+)
2. Install **Rust & Cargo**
3. Ensure **ffprobe** and **ffmpeg** are installed and configured on your system PATH (required for native media imports and caching).

### Local Execution (Dev mode)

Run the desktop client in dev server mode:

```powershell
cd apps/desktop
npm install
npm run dev
```

To launch with the active Rust-Tauri container:

```powershell
cd apps/desktop
cargo tauri dev
```

### Building Production Releases

To compile and package the production binary for distribution:

```powershell
cd apps/desktop
npm run build
cargo tauri build
```

---

## Modern Refactoring Details

The repository recently underwent a major architectural cleanup (Phases 1-6 completed):
1. **Mockup Isolation**: Archived historical static mockup files under `archive/mockup/` and isolated production build paths.
2. **IPC Integration**: Replaced simulated web progress timers with a strongly-contracted Tauri IPC bridge stub (`start_export_project`, `cancel_export`).
3. **Native Media Inspector**: Integrated a Powershell-driven Windows OpenFileDialog (`pick_media_file`) and removed mock frontend metadata simulations in favor of real `ffprobe` output.
4. **Cache Key Security**: Reimplemented cached filename keys using the standard library's SipHasher (`DefaultHasher`) inside `slopeffect-media`.
5. **Unified State Truth**: Retired parallel/drifting backend project model structures and established the Zustand JSON store as the single source of truth for `.slopeproj` persistence.
