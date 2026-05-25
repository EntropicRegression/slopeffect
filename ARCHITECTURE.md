# Slopeffect 影片編輯軟體基本開發架構書

版本：0.2  
架構修訂：由 .NET Framework / WPF 改為 Rust + Tauri  
目標平台：Windows Desktop 優先，後續再評估 macOS / Linux

## 1. 架構方向重新審視

原本以 .NET Framework + WPF 為主的設計，適合快速建立 Windows 桌面 UI，但影片編輯器長期會遇到幾個問題：

- 跨平台能力有限。
- 高效能媒體處理與 GPU compositing 需要較多 native interop。
- 外掛與底層媒體 pipeline 若想跨平台，C#/.NET Framework 生態不是最理想基底。
- WPF 很適合傳統桌面 UI，但大型時間軸、即時預覽、GPU 特效與未來跨平台會逐漸吃力。

改用 Rust + Tauri 後，建議把系統切成兩層：

- Tauri frontend：負責 UI、時間軸互動、preview panel、屬性面板、素材管理畫面。
- Rust backend/core：負責專案狀態、timeline evaluation、媒體分析、渲染規劃、輸出、外掛 API。

關鍵原則：

- Rust backend 是專案狀態的唯一權威來源。
- Frontend 不直接保存完整業務狀態，只保存 UI selection、panel 狀態與短期互動狀態。
- Tauri IPC 用於 command、事件、進度與小型資料傳遞，不傳 raw video frames。
- 預覽與輸出必須共用同一套 timeline evaluation，避免畫面預覽與輸出結果不一致。

## 2. 技術基底

### 2.1 桌面框架

建議：

- Tauri v2
- Rust stable toolchain
- Frontend：TypeScript + React + Vite
- Package manager：pnpm
- 專案管理：Cargo workspace

React 不是 Tauri 必需條件，但影片編輯器會有大量狀態化 UI、timeline drag/drop、inspector 表單、hotkey、panel docking。React + TypeScript 的工具鏈與元件生態較容易支撐第一版。

可替代方案：

- Svelte + TypeScript：bundle 小、語法簡潔。
- Solid + TypeScript：細粒度 reactivity，適合高互動 UI。
- Vue + TypeScript：團隊熟悉 Vue 時可考慮。

### 2.2 媒體與渲染候選

第一階段建議務實使用：

- FFmpeg / ffprobe sidecar：media metadata、thumbnail、proxy、final export。
- Rust `serde`：project file serialization。
- Rust `uuid`：穩定物件 Id。
- Rust `image`：PNG / JPG 基本讀取、metadata 與 image processing。
- `usvg` / `resvg`：SVG parsing 與 rasterization。
- `wgpu`：後續 GPU compositor 候選，不建議第一個 milestone 就完整導入。

後續若要做更高效能的即時預覽，可評估：

- GStreamer Rust bindings。
- FFmpeg native bindings。
- wgpu native compositor。
- 獨立 preview process 或 native preview surface。

## 3. 初始功能範圍

第一版仍以原需求為核心：

1. 圖層功能。
2. 簡單影片時間軸編輯，包含段落切割與合成。
3. 音軌與影片軌分開編輯。
4. 基本 keyframe，可編輯 position、rotation、scale、opacity。
5. 可新增簡單形狀，支援 path、SVG、JPG、PNG 作為圖層。

第一版不建議包含：

- 多機位剪輯。
- nested sequence。
- speed ramp。
- 複雜轉場編輯器。
- 即時 GPU shader effect 編輯器。
- 完整 DAW 級音訊編輯。

## 4. 高階架構

```text
Tauri Application
  |
  +-- WebView Frontend
  |     |
  |     +-- React / TypeScript UI
  |     +-- Timeline Panel
  |     +-- Preview Panel
  |     +-- Inspector Panel
  |     +-- Asset Library Panel
  |
  +-- Rust Core Process
        |
        +-- App State / Project Store
        +-- Command Service / Undo Redo
        +-- Timeline Evaluator
        +-- Media Service
        +-- Preview Service
        +-- Export Service
        +-- Plugin Host
        |
        +-- Sidecars / Workers
              |
              +-- ffmpeg
              +-- ffprobe
              +-- future render worker
```

Tauri 的 WebView 適合做 UI，不應被當成影片編輯器的完整媒體引擎。真正的專案狀態、輸出與可測試邏輯應放在 Rust crates。

## 5. 建議 Repository 結構

```text
slopeffect/
  apps/
    desktop/
      package.json
      pnpm-lock.yaml
      vite.config.ts
      index.html
      src/
        app/
        components/
        features/
          assets/
          inspector/
          preview/
          timeline/
        ipc/
        state/
        styles/
      src-tauri/
        Cargo.toml
        tauri.conf.json
        capabilities/
          desktop.json
        src/
          main.rs
          lib.rs
          commands.rs
          events.rs
          app_state.rs
  crates/
    slopeffect-core/
      src/
        timeline/
        layer/
        keyframe/
        command/
        eval/
    slopeffect-project/
      src/
        document.rs
        load.rs
        save.rs
        migration.rs
    slopeffect-media/
      src/
        asset.rs
        probe.rs
        thumbnail.rs
        proxy.rs
    slopeffect-render/
      src/
        frame_plan.rs
        compositor.rs
        shape.rs
        svg.rs
    slopeffect-audio/
      src/
        waveform.rs
        mix.rs
    slopeffect-export/
      src/
        job.rs
        ffmpeg.rs
        profile.rs
    slopeffect-plugin-api/
      src/
        importer.rs
        exporter.rs
        effect.rs
  docs/
    architecture.md
    project-format.md
    ipc-api.md
    plugin-api.md
```

第一階段可以先簡化：

```text
apps/desktop
crates/slopeffect-core
crates/slopeffect-project
crates/slopeffect-media
crates/slopeffect-export
```

`slopeffect-render`、`slopeffect-audio`、`slopeffect-plugin-api` 可在 milestone 2 或 3 拆出。

## 6. Frontend / Backend 分工

### 6.1 Frontend 負責

- 顯示 timeline。
- 顯示素材庫。
- 顯示 preview panel。
- 顯示 layer inspector。
- 處理 drag/drop、選取、hotkey、context menu。
- 將使用者操作轉成 command，透過 Tauri invoke 傳給 Rust。
- 接收 Rust event 或 state patch，更新 UI。

Frontend 不負責：

- 專案檔真實狀態。
- undo/redo 真實堆疊。
- media probing。
- final export。
- 檔案系統任意存取。
- raw frame decode。

### 6.2 Rust backend 負責

- ProjectDocument store。
- Command execution。
- Undo/redo。
- Timeline evaluation。
- Asset metadata。
- Thumbnail / waveform cache。
- Preview frame plan。
- Export render job。
- FFmpeg / ffprobe process 管理。
- Plugin discovery 與 plugin sandbox 策略。

## 7. Tauri IPC 設計

### 7.1 Command API

Frontend 對 Rust 的操作都走明確 command。

範例：

```rust
#[tauri::command]
async fn execute_editor_command(
    state: tauri::State<'_, AppState>,
    command: EditorCommandDto,
) -> Result<ProjectPatchDto, AppErrorDto> {
    state.command_service.execute(command).await
}
```

初始 command：

- `project.create`
- `project.open`
- `project.save`
- `asset.import`
- `timeline.add_clip`
- `timeline.move_clip`
- `timeline.trim_clip`
- `timeline.split_clip`
- `timeline.delete_clip`
- `layer.add`
- `layer.update_transform`
- `keyframe.add`
- `keyframe.update`
- `keyframe.delete`
- `export.start`
- `export.cancel`

### 7.2 Event / Channel API

Rust 到 frontend 的資料分三類：

- 小型通知：使用 Tauri event，例如 selection changed、project dirty changed。
- 長任務進度：使用 channel，例如 export progress、thumbnail generation progress。
- 大量媒體資料：不要走 JSON event，也不要走一般 IPC。

大量媒體資料應改用：

- cache file path。
- custom protocol URL。
- local preview server。
- 後續 native preview surface。

### 7.3 IPC DTO 原則

Rust domain model 不直接暴露給 frontend。需建立 DTO：

- Domain model 可保留強型別與內部 invariants。
- DTO 使用 camelCase，方便 TypeScript。
- DTO schema 可由 Rust 產生，或維護 TypeScript mirror type。

建議加上：

- `specta` 或類似工具產生 TypeScript types。
- `serde` 控制 JSON shape。
- `thiserror` / `anyhow` 管理錯誤。

## 8. 核心資料模型

### 8.1 ProjectDocument

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ProjectDocument {
    pub id: ProjectId,
    pub schema_version: u32,
    pub name: String,
    pub settings: ProjectSettings,
    pub assets: AssetLibrary,
    pub timeline: Timeline,
}
```

### 8.2 Timeline

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Timeline {
    pub id: TimelineId,
    pub timebase: Timebase,
    pub duration: TimelineTime,
    pub video_tracks: Vec<VideoTrack>,
    pub audio_tracks: Vec<AudioTrack>,
}
```

### 8.3 Track

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct VideoTrack {
    pub id: TrackId,
    pub name: String,
    pub enabled: bool,
    pub locked: bool,
    pub clips: Vec<LayerClip>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AudioTrack {
    pub id: TrackId,
    pub name: String,
    pub enabled: bool,
    pub locked: bool,
    pub muted: bool,
    pub solo: bool,
    pub clips: Vec<AudioClip>,
}
```

### 8.4 LayerClip

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct LayerClip {
    pub id: ClipId,
    pub layer_id: LayerId,
    pub asset_id: Option<AssetId>,
    pub start: TimelineTime,
    pub duration: TimelineDuration,
    pub in_point: TimelineDuration,
    pub z_index: i32,
}
```

### 8.5 Layer

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Layer {
    pub id: LayerId,
    pub name: String,
    pub enabled: bool,
    pub source: LayerSource,
    pub transform: TransformState,
    pub opacity: f32,
    pub keyframes: Vec<KeyframeTrack>,
    pub effects: Vec<EffectInstance>,
}
```

### 8.6 LayerSource

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LayerSource {
    Video { asset_id: AssetId },
    Image { asset_id: AssetId },
    Svg { asset_id: AssetId },
    Shape { shape: ShapeDefinition },
}
```

## 9. 時間表示策略

影片編輯器不應以 `f64 seconds` 作為核心時間單位。

建議：

- UI 可顯示秒數、frame number、timecode。
- Core 使用 `TimelineTime` 與 `TimelineDuration`。
- 內部用整數 ticks 或 rational frame 表示。
- 對 audio 另保留 sample-accurate 表示能力。

```rust
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord,
    serde::Serialize, serde::Deserialize
)]
pub struct TimelineTime {
    pub ticks: i64,
}

#[derive(Copy, Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Timebase {
    pub fps_num: u32,
    pub fps_den: u32,
    pub ticks_per_second: i64,
    pub audio_sample_rate: u32,
}
```

第一階段建議：

- 預設 `ticks_per_second = 1_000_000_000`。
- frame 對齊透過 `Timebase` 轉換。
- UI 拖曳時可暫存浮點座標，但提交 command 前必須轉成 `TimelineTime`。

## 10. 圖層與合成模型

### 10.1 Layer 類型

初始 Layer 類型：

- VideoLayer
- ImageLayer
- SvgLayer
- ShapeLayer

預留：

- TextLayer
- AdjustmentLayer
- GroupLayer
- GeneratedLayer

### 10.2 共用屬性

- `enabled`
- `start`
- `duration`
- `z_index`
- `position`
- `rotation`
- `scale`
- `anchor`
- `opacity`
- `blend_mode`
- `effects`
- `keyframes`

### 10.3 ShapeLayer

支援：

- Rectangle
- Ellipse
- Line
- Polygon
- Path

Shape style：

- Fill
- Stroke
- Stroke width
- Join
- Cap
- Opacity

### 10.4 SVG

第一階段 SVG 支援範圍：

- 靜態 SVG。
- 不執行 script。
- 不讀 external resource。
- 不支援 SVG animation。
- 複雜 SVG 先 rasterize 成 cache。

建議 pipeline：

```text
SVG file
  -> usvg parse / normalize
  -> internal vector model or raster cache
  -> render plan
  -> preview / export
```

## 11. Keyframe 設計

### 11.1 初始可動畫化屬性

- `transform.position.x`
- `transform.position.y`
- `transform.rotation`
- `transform.scale.x`
- `transform.scale.y`
- `opacity`

### 11.2 KeyframeTrack

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct KeyframeTrack {
    pub target: AnimatableProperty,
    pub keyframes: Vec<Keyframe>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Keyframe {
    pub time: TimelineTime,
    pub value: AnimValue,
    pub interpolation: Interpolation,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub enum Interpolation {
    Hold,
    Linear,
}
```

後續可加：

- EaseIn
- EaseOut
- EaseInOut
- Bezier
- Step

### 11.3 Evaluation

```text
TimelineTime
  -> find active tracks
  -> find active clips
  -> resolve layer source
  -> evaluate keyframes
  -> apply transform/effects
  -> produce FramePlan
```

`FramePlan` 是預覽與輸出的共同輸入。

## 12. Timeline Editing

初始編輯能力：

- Add clip。
- Move clip。
- Trim start。
- Trim end。
- Split clip。
- Delete clip。
- Link / unlink video and audio。
- Track mute / solo。
- Track lock。

所有操作都必須透過 command service：

```rust
pub trait EditorCommand {
    fn name(&self) -> &'static str;
    fn execute(&self, ctx: &mut EditorContext) -> Result<CommandUndo, EditorError>;
}
```

Undo 不建議依賴 frontend diff。Rust backend 應保存：

- command history。
- inverse operation。
- 或 before/after patch。

## 13. Media Pipeline

### 13.1 Asset Import

流程：

```text
User selects files
  -> frontend calls asset.import
  -> Rust validates paths through allowed scope
  -> ffprobe reads metadata
  -> AssetLibrary stores metadata
  -> background thumbnail/waveform job
  -> frontend receives asset list patch
```

Asset metadata：

- id
- original path
- file type
- container
- duration
- width
- height
- fps
- sample rate
- channels
- rotation metadata
- has audio
- has video

### 13.2 Thumbnail / Proxy

建議建立 cache directory：

```text
AppData/
  slopeffect/
    cache/
      thumbnails/
      waveforms/
      proxies/
      svg/
```

第一階段：

- thumbnail 用 ffmpeg 產生 PNG/JPG。
- waveform 用 ffmpeg 或 Rust audio decode 產生 compact peaks。
- proxy 可先不做自動產生，但 metadata 模型先預留。

### 13.3 Preview

第一階段建議採混合策略：

- Frontend 顯示 preview surface 與 transform handles。
- Rust 提供目前播放頭的 `FramePlan`。
- 影片 frame 來源優先使用 browser/WebView 可播放的 media URL 或 proxy。
- 圖片、SVG、shape 可由 frontend canvas 初步繪製。
- Export 仍以 Rust/FFmpeg pipeline 為準。

此策略能快速做出可用 UI，但有風險：preview 與 final export 可能出現像素差異。

為降低差異，必須遵守：

- 所有 timeline/keyframe evaluation 只在 Rust core 實作。
- Frontend 只照 Rust 回傳的 evaluated values 繪製。
- Export 使用同一份 `FramePlan`。
- 對 transform、opacity、z-order 做 snapshot tests。

第二階段建議：

- 建立 Rust `slopeffect-render` compositor。
- 使用 wgpu 或其他 native rendering backend。
- Preview 與 export 都使用同一套 compositor。

## 14. Export Pipeline

第一階段目標：輸出單一 MP4。

流程：

```text
export.start
  -> create ExportJob
  -> lock project snapshot
  -> evaluate timeline frame range
  -> render visual stream
  -> mix audio stream
  -> ffmpeg encode
  -> emit progress through channel
  -> write output file
```

MVP 可以先用 FFmpeg filter graph 或 intermediate image sequence：

方案 A：FFmpeg filter graph

- 優點：速度較好，不產生大量中間檔。
- 缺點：動態 keyframe、shape、SVG、複雜 compositing 的 filter graph 生成會變複雜。

方案 B：image sequence + audio mixdown

- 優點：架構簡單，容易確保每一 frame 可控。
- 缺點：慢、吃磁碟。

建議第一版採方案 B，因為可測試、可 debug；等核心穩定再最佳化。

## 15. Audio Pipeline

初始能力：

- AudioTrack 與 VideoTrack 分離。
- linked / unlinked audio clip。
- mute。
- solo。
- volume。
- waveform cache。
- export mixdown。

AudioClip：

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AudioClip {
    pub id: ClipId,
    pub asset_id: AssetId,
    pub start: TimelineTime,
    pub duration: TimelineDuration,
    pub in_point: TimelineDuration,
    pub volume: f32,
    pub muted: bool,
    pub keyframes: Vec<KeyframeTrack>,
}
```

第一階段音訊 keyframe 可先只支援：

- volume。

## 16. 專案檔格式

建議副檔名：

- `.slopeproj`

格式：

- JSON。
- UTF-8。
- 不內嵌大型媒體。
- 保存相對路徑與原始絕對路徑。
- 保存 schema version。

基本結構：

```json
{
  "schemaVersion": 1,
  "id": "project-id",
  "name": "Untitled",
  "settings": {
    "width": 1920,
    "height": 1080,
    "fpsNum": 30000,
    "fpsDen": 1001,
    "sampleRate": 48000
  },
  "assets": [],
  "timeline": {
    "videoTracks": [],
    "audioTracks": []
  }
}
```

需要有 migration pipeline：

```rust
pub trait ProjectMigration {
    fn from_version(&self) -> u32;
    fn to_version(&self) -> u32;
    fn migrate(&self, value: serde_json::Value) -> Result<serde_json::Value, MigrationError>;
}
```

## 17. 安全模型

Tauri 的安全模型比 Electron 更細，但仍需要明確設計。

要求：

- Frontend 不取得任意 shell 權限。
- Frontend 不直接讀寫任意檔案。
- 檔案操作透過 Rust command。
- Tauri capabilities 只開必要權限。
- ffmpeg path 由 Rust backend 控制，不接受 frontend 傳入任意 executable。
- 匯入素材時檢查檔案存在、大小與副檔名。
- SVG 不執行 script，不允許外部 URL resource。
- project file load 時做 schema validation。

`src-tauri/capabilities/desktop.json` 應保持最小權限，避免為了方便一次開完整 filesystem 或 shell scope。

## 18. 外掛擴充架構

Rust 的 runtime dynamic plugin 比 C#/.NET 複雜，不能直接假設「載入 DLL 後呼叫 Rust trait」就是穩定方案。Rust trait ABI 不穩定，跨版本動態載入會有維護風險。

建議分三個階段：

### 18.1 第一階段：內建擴充點

先設計 traits，但只允許 app 內建註冊：

```rust
pub trait MediaImporter: Send + Sync {
    fn id(&self) -> &'static str;
    fn supported_extensions(&self) -> &[&'static str];
    fn probe(&self, path: &std::path::Path) -> Result<AssetMetadata, ImportError>;
}
```

這能先穩住架構，不急著開放第三方外掛。

### 18.2 第二階段：WASM plugin

適合：

- metadata importer。
- project transformer。
- batch command。
- simple generator。
- 非即時效果。

優點：

- sandbox 較清楚。
- 跨平台。
- ABI 比 Rust dylib 穩定。

限制：

- 不適合高吞吐 raw frame processing，除非設計 shared memory 或專門 host API。

### 18.3 第三階段：Native plugin / sidecar

適合：

- 高效能 video effect。
- hardware encoder integration。
- specialized importer/exporter。

可選：

- C ABI。
- IPC sidecar process。
- gRPC / JSON-RPC。
- Cap'n Proto / FlatBuffers。

建議先從 sidecar process 開始，避免 plugin crash 直接拖垮主程式。

## 19. UI 架構

### 19.1 主要畫面

- AppShell
- TopMenu
- Toolbar
- AssetPanel
- PreviewPanel
- TimelinePanel
- InspectorPanel
- ExportDialog

### 19.2 Frontend State

Frontend state 分三類：

- Server state：Rust project snapshot / patch。
- UI state：目前選取、panel size、zoom、scroll。
- Interaction state：拖曳中的 clip ghost、rubber band selection、hotkey mode。

建議：

- Project state 以 Rust 回傳 snapshot/patch 為準。
- UI state 可放 Zustand 或 Redux Toolkit。
- Timeline 大型 list 需 virtualization。
- Preview overlay 可用 Canvas / SVG / Konva 類型方案。

### 19.3 Timeline UI

TimelinePanel 需要支援：

- track header。
- ruler。
- playhead。
- clip blocks。
- waveform。
- keyframe lane。
- zoom。
- horizontal/vertical scroll。
- snapping。
- marquee selection。
- split tool。

UI 操作流程：

```text
drag clip in frontend
  -> frontend shows optimistic ghost
  -> mouse up sends timeline.move_clip command
  -> Rust validates collision/snap/range
  -> Rust returns accepted patch
  -> frontend applies official state
```

第一版可以先不做 full optimistic update，降低狀態同步難度。

## 20. Render Plan

`FramePlan` 是渲染核心中介格式。

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct FramePlan {
    pub time: TimelineTime,
    pub width: u32,
    pub height: u32,
    pub layers: Vec<EvaluatedLayer>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EvaluatedLayer {
    pub layer_id: LayerId,
    pub source: EvaluatedLayerSource,
    pub transform: TransformState,
    pub opacity: f32,
    pub z_index: i32,
    pub blend_mode: BlendMode,
}
```

預覽 renderer 與 export renderer 都吃 `FramePlan`。

## 21. 測試策略

Rust core 測試：

- Timeline split。
- Trim。
- Move。
- Clip overlap rules。
- Keyframe interpolation。
- Layer z-order。
- FramePlan generation。
- Project file migration。

Export 測試：

- 產生短影片。
- 驗證輸出存在。
- 驗證 duration。
- 驗證解析度。
- 驗證 audio stream。

Frontend 測試：

- timeline selection。
- clip drag。
- inspector editing。
- command DTO shape。

建議工具：

- Rust unit tests。
- Rust integration tests。
- TypeScript unit tests。
- Playwright 用於 frontend interaction。
- ffprobe 驗證輸出結果。

## 22. 開發里程碑

### Milestone 1：Rust Core + Tauri Skeleton

- 建立 Tauri desktop app。
- 建立 Cargo workspace。
- 建立 `slopeffect-core`。
- ProjectDocument / Timeline / Track / Clip / Layer / Keyframe model。
- JSON save/load。
- command service。
- undo/redo。
- 基礎 unit tests。

### Milestone 2：Frontend 編輯器骨架

- React + TypeScript UI。
- AssetPanel。
- PreviewPanel placeholder。
- TimelinePanel，可顯示 tracks/clips。
- InspectorPanel，可編輯 transform/opacity。
- Tauri invoke command plumbing。

### Milestone 3：媒體匯入與基本剪輯

- 使用 ffprobe 讀 metadata。
- 匯入 video/image/svg。
- 加入 timeline。
- clip move / trim / split。
- thumbnail cache。
- project save/open。

### Milestone 4：Keyframe 與圖層

- position / rotation / scale / opacity keyframe。
- FramePlan evaluation。
- image layer。
- SVG layer。
- shape layer。
- z-order。

### Milestone 5：音訊軌

- audio track。
- linked/unlinked audio clip。
- waveform。
- volume/mute。
- basic audio mixdown。

### Milestone 6：輸出

- export dialog。
- MP4 export。
- progress channel。
- cancel export。
- ffprobe output validation。

### Milestone 7：外掛 API 初版

- importer registry。
- exporter registry。
- internal effect registry。
- plugin-api.md。
- 範例內建 plugin。

## 23. 主要風險與對策

### 23.1 WebView 不等於媒體引擎

風險：不同平台 WebView 的媒體能力與 rendering 行為可能不同。

對策：

- Windows 優先。
- Export 以 Rust/FFmpeg pipeline 為準。
- 不把 raw frame processing 放在 frontend。
- 第二階段導入 Rust compositor。

### 23.2 IPC 傳輸瓶頸

風險：Tauri IPC 不適合高頻大量影像資料。

對策：

- IPC 只傳 commands、patches、progress、FramePlan。
- frame data 走 cache file、local protocol、preview server 或 native surface。

### 23.3 FFmpeg 散佈與授權

風險：FFmpeg binary 散佈、codec、授權會影響發佈。

對策：

- 初期開發可要求本機安裝 FFmpeg。
- 發佈前決定 bundled binary 或 user-provided binary。
- 建立 license review。

### 23.4 Rust 外掛 ABI

風險：Rust dynamic plugin 不像 C# assembly 載入那麼直接。

對策：

- 第一階段只做內建 registry。
- 第二階段評估 WASM plugin。
- 高效能外掛走 sidecar 或 C ABI。

### 23.5 Preview / Export 不一致

風險：frontend canvas preview 與 FFmpeg export 畫面不同。

對策：

- timeline evaluation 統一在 Rust。
- `FramePlan` 作為共同中介。
- snapshot tests。
- 長期建立 Rust compositor。

## 24. 建議優先決策

開發前需先決定：

1. 第一版只支援 Windows，還是一開始就要求跨平台。
2. Frontend 採 React、Svelte、Vue 或 Solid。
3. FFmpeg 是 bundled sidecar 還是要求使用者安裝。
4. Preview 第一版接受 WebView canvas / video hybrid，還是直接投入 Rust compositor。
5. `.slopeproj` 是否作為正式副檔名。
6. 外掛第一版是否只做內建 registry。

本架構建議的保守答案：

- Windows first。
- Tauri v2 + React + TypeScript + Vite。
- 開發期使用 user-provided FFmpeg，發佈前再處理 bundling。
- Preview MVP 用 WebView hybrid，export 以 FFmpeg/image sequence 為準。
- Project file 使用 `.slopeproj`。
- 外掛第一版只做 internal registry。

## 25. 參考資料

- Tauri Architecture: https://v2.tauri.app/concept/architecture/
- Tauri Process Model: https://v2.tauri.app/concept/process-model/
- Tauri Start / Why Tauri: https://v2.tauri.app/start/
- Tauri Plugins and Features: https://v2.tauri.app/plugin/
- Tauri Calling Frontend from Rust: https://v2.tauri.app/develop/calling-frontend/
- Tauri Security: https://v2.tauri.app/security/
- FFmpeg Documentation: https://www.ffmpeg.org/documentation.html
- FFprobe Documentation: https://ffmpeg.org/ffprobe.html
- GStreamer Rust Bindings: https://gstreamer.freedesktop.org/documentation/rust/stable/latest/docs/gstreamer/
- wgpu Documentation: https://wgpu.rs/doc/wgpu/
- Rust image crate: https://github.com/image-rs/image
- usvg Documentation: https://doc.servo.org/usvg/
- Konva Overview: https://new.konvajs.org/docs/overview.html
