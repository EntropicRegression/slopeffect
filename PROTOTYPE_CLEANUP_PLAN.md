# Prototype Cleanup Plan

## Goal

Remove prototype and placeholder leftovers from the production desktop path, keep the React/Tauri/Rust application maintainable, and avoid UI flows that imply finished backend behavior before it exists.

This plan does not require building a full video compositor immediately. The first priority is to make the app honest about what is implemented, remove stale mockup entry points, and replace fake data paths with explicit unsupported or error states.

## Phase 1: Isolate The Old Static Mockup

1. Confirm that the production desktop entry point is `apps/desktop`.
2. Move or mark the old root-level prototype files as archived:
   - `index.html`
   - `app.js`
   - `style.css`
   - root `package.json`
   - root `package-lock.json`
3. If the static mockup must be kept for reference, move it under `archive/mockup/` and document that it is not part of the production build.
4. Acceptance criteria:
   - The root directory no longer looks like the active app entry point.
   - Searches for `simulateCommand`, `importPredefined`, and static mockup export flows are limited to an archived folder or removed entirely.

## Phase 2: Replace Fake Export Flow With An Explicit Backend Stub

1. Remove the frontend-only export simulation in `apps/desktop/src/App.tsx`.
2. Replace the current `setInterval` progress flow with an explicit unsupported state until a real backend export command exists.
3. Avoid status text that implies real work, such as:
   - `assembling MP4`
   - `saving through sidecar`
   - fake progress completion
4. Define the future backend contract before implementation:
   - `start_export_project`
   - `cancel_export`
   - `export_progress` event
   - success/failure payload shape
5. Acceptance criteria:
   - Clicking export no longer pretends to produce an MP4.
   - The UI clearly says export is not connected to the backend yet, or calls a real backend command.

## Phase 3: Fix Media Import And Probe

1. Stop passing only `file.name` to `probe_media_file`.
2. Use a Tauri file picker to obtain an actual filesystem path that Rust and ffprobe can read.
3. Remove frontend fallback metadata such as:
   - `12.4s`
   - `8.5s`
   - `1920x1080`
   - fake sample rates
4. On probe failure, surface a clear import error instead of inventing metadata.
5. Decide whether `get_media_thumbnail` is needed now:
   - If yes, wire it into the asset thumbnail UI.
   - If no, remove or leave it behind a clearly unused backend boundary.
6. Acceptance criteria:
   - Imported media metadata comes from ffprobe.
   - Failed imports fail visibly and do not create fake assets.

## Phase 4: Remove Rust Media Placeholders

1. Update `crates/slopeffect-media/src/lib.rs` so missing ffprobe returns an error instead of simulated metadata.
2. Remove `get_simulated_metadata`.
3. Replace thumbnail fallback behavior:
   - Do not write `SIMULATED_THUMBNAIL_JPEG_DATA_PLACEHOLDER`.
   - Either return an error or write a real, valid placeholder image.
4. Replace the quick simulated hash with a stable file key strategy:
   - Use a real hash crate, or
   - Use a deterministic standard-library hasher with clear collision expectations.
5. Acceptance criteria:
   - The media crate never returns fabricated metadata.
   - Thumbnail cache files are valid images or errors.

## Phase 5: Unify Project Persistence

1. Audit the two current project persistence paths:
   - Frontend raw JSON: `save_rich_project` / `load_rich_project`
   - Rust project model: `create_project`, `open_project`, `save_project_to_path`, `execute_editor_command`
2. Choose one source of truth for `.slopeproj`.
3. Short-term option:
   - Keep the frontend store schema.
   - Remove or mark unused Rust project commands.
4. Medium-term option:
   - Make Rust own the `.slopeproj` schema.
   - Have the frontend send DTOs through IPC.
5. Acceptance criteria:
   - There is one project file format.
   - The frontend and backend do not maintain parallel project models that drift.

## Phase 6: Clean Template And Unused Assets

1. Remove unused Vite/template assets if they are not referenced:
   - `apps/desktop/src/assets/react.svg`
   - `apps/desktop/src/assets/vite.svg`
   - `apps/desktop/src/assets/hero.png`
   - `apps/desktop/src/assets/ocean_thumb.png`
2. Check whether `apps/desktop/public/icons.svg` is used. Remove it if unused.
3. Replace `apps/desktop/README.md`, which still contains Vite template content.
4. Update the root README to describe the real app structure and current limitations.
5. Acceptance criteria:
   - No Vite template README remains.
   - Unused demo assets are removed.

## Phase 7: Normalize UI Status Text

1. Standardize status states across import, save, and export:
   - `ready`
   - `running`
   - `unsupported`
   - `failed`
   - `completed`
2. Keep valid empty states such as:
   - `Untitled.slopeproj`
   - `Scene 1`
   - no selected layer placeholder
3. Remove or rewrite copy that implies unimplemented backend behavior.
4. Acceptance criteria:
   - UI text reflects real application behavior.
   - Placeholder wording is limited to genuine empty states.

## Final Verification

Run:

```powershell
npm run build
cargo check
```

Search for leftover prototype markers:

```powershell
rg -n "mockup|simulateCommand|SIMULATED_THUMBNAIL|fallback to simulation|my_awesome_edit_v1|C:/Projects/Slopeffect/Exports" .
```

Manual checks:

1. Create a new project.
2. Save and reopen a project.
3. Import a valid media file and verify metadata comes from ffprobe.
4. Import an invalid or unsupported file and verify a clear error appears.
5. Open export and verify it either calls a real backend flow or clearly says export is not implemented yet.
