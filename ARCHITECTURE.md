# Slopeffect 影片編輯軟體開發架構書

- **版本**：1.0 (Sprint 2 核心開發完成修訂版)
- **架構模式**：Tauri v2 + React + TS + Vite + Rust Stable Workspace
- **目標平台**：Windows Desktop 優先 (預留跨平台能力)

---

## 1. 專案進度與當前版圖

本專案定位為 AE 對標的專業級影片編輯桌面軟體。經過 **Sprint 1** 與 **Sprint 2** 的密集開發，系統已具備核心動畫引擎、關鍵影格緩動插值、圖層父子級聯動以及多重效果濾鏡堆疊等專業功能。

### 核心進度狀態
- **Sprint 1 (錨點 + 關鍵影格) — 100% 完成 ✅**：錨點 Crosshair 拖曳、Position/Scale/Rotation/Opacity 關鍵影格行、GripVertical 軌道拖曳排序。
- **Sprint 2 (特效堆疊 + 父子聯動) — 100% 完成 ✅**：Cubic 緩動插值播放、9種特效 Slider 微調與 Eye 開關、深度遞迴 Parent-Child 變形聯動、圓形引用死鎖防護。
- **Sprint 3 (進階貝氏動畫曲線 Graph Editor) — 100% 完成 ✅**：實作 Newton-Raphson 貝氏求解器、SVG 自適應數值網格、雙向控制柄 (Bezier Handles) 拖曳、線性/Hold/Easy Ease F9 預設。

---

## 2. 技術基底與 Repository 結構

### 2.1 技術棧
- **桌面外殼**：Tauri v2 (Rust 驅動)
- **前端 UI**：React + TypeScript + Vite + Zustand (強狀態化管理)
- **樣式系統**：Vanilla CSS (精緻暗黑學院風、微動畫、磨砂玻璃質感)
- **套件管理**：pnpm
- **後端模組**：Rust stable toolchain + FFmpeg/ffprobe sidecar (元數據與縮圖分析)

### 2.2 當前 Repository 結構
```text
slopeffect/
  apps/
    desktop/                 # 前端 UI 與 Tauri 外殼
      package.json
      vite.config.ts
      index.html
      src/
        App.tsx              # 編輯器主畫面與畫布渲染、Gizmo 控制
        index.css            # 核心磨砂暗黑樣式設計
        main.tsx
        store/
          editorStore.ts     # Zustand 狀態庫：關鍵影格插值算法與 effects/parenting actions
        types/
          editor.ts          # TypeScript 核心資料模型
        services/
          tauriIpc.ts        # Tauri IPC 通訊服務
      src-tauri/             # Tauri Rust 主程式
        Cargo.toml
        tauri.conf.json
        src/
          main.rs
  crates/                    # 獨立 Rust 業務庫 (為第二階段高效能 Compositor 預留)
    slopeffect-core/         # 時間軸與核心邏輯
    slopeffect-media/        # 媒體分析探針
    slopeffect-project/      # 專案序列化與存取
```

---

## 3. 前端與後端架構分工

### 3.1 前端負責
1. **動態渲染 (Canvas & Gizmo)**：實時繪製軌道片段，並基於插值與父子級聯動後的絕對世界座標渲染 bounding box 控制框與金色 Crosshair 錨點。
2. **多屬性 Inspector**：提供 Position/Scale/Rotation/Opacity/Anchor 的精準數值微調與關鍵影格「鬧鐘記錄鍵」。
3. **特效面板與父子關聯 UI**：提供新增/開啟效果卡片，以及安全過濾循環引用的 Parent 選擇器。
4. **狀態控制與樂觀更新**：利用 Zustand 全權接管播放頭 (ticks)、選取狀態與短期 UI 狀態。

### 3.2 後端 (Rust) 負責
1. **資產偵測 (Probing)**：調用 `ffprobe` 分析本機音視訊的 FPS、解析度、採樣率等中介資料。
2. **硬體與行程管理**：管制 FFmpeg 轉碼側載行程、背景渲染任務。
3. **檔案存取安全**：充當安全沙箱，全權接管 `.slopeproj` 格式的存檔與載入。

---

## 4. 核心資料結構

### 4.1 TypeScript 資料模型 (`types/editor.ts`)

#### 空間變形 (Transform)
```typescript
export interface Transform {
  posX: number;
  posY: number;
  anchorX: number;  // 0.0 ~ 1.0，預設 0.5 (中心點)
  anchorY: number;  // 0.0 ~ 1.0，預設 0.5
  scaleX: number;   // 寬度百分比，X 軸可獨立拉伸
  scaleY: number;   // 高度百分比，Y 軸可獨立拉伸
  rotation: number; // 角度 (°)
  opacity: number;  // 不透明度 (0 ~ 100)
  blendMode: string;// 混合模式：normal | screen | multiply | overlay | lighten
}
```

#### 關鍵影格 (Keyframe)
```typescript
export interface Keyframe {
  id: string;
  timeTicks: number; // 精準時間戳 (10^9 ticks = 1秒)
  property: 'posX' | 'posY' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'; // 緩動模式
}
```

#### 特效實例 (Effect)
```typescript
export interface Effect {
  id: string;
  type: 'blur' | 'brightness' | 'contrast' | 'grayscale' | 'sepia' | 'hueRotate' | 'saturate' | 'invert' | 'dropShadow';
  enabled: boolean;
  params: Record<string, number>; // 動態參數：如 blur.radius, dropShadow.offsetX 等
}
```

#### 影片剪輯 (Clip)
```typescript
export interface Clip {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'svg' | 'image';
  startTicks: number;
  durationTicks: number;
  assetId: string;
  trackId: string;
  transform: Transform;
  keyframes: KeyframesState; // 記錄各屬性是否啟用動畫記錄
  keyframeData: Keyframe[];  // 關鍵影格列表
  effects: Effect[];         // 特效堆疊
  parentClipId: string | null; // 父子級關聯指標
  enabled: boolean;
}
```

---

## 5. 已完成核心子系統詳解

### 5.1 錨點系統 (Anchor Point System) ✅
- **錨點作用**：`anchorX` / `anchorY` 為歸一化坐標 (0~1)，定義了所有旋轉 (rotation) 與縮放 (scale) 的旋轉軸心。
- **Canvas 畫布**：Transform overlay 的 CSS 屬性 `transform-origin` 設定為 `${anchorX * 100}% ${anchorY * 100}%`。新增金色 Crosshair (十字小圓圈)，支持滑鼠按住直接於畫布拖曳更新，實現如同 AE 般的「Pan Behind」操作。

### 5.2 關鍵影格緩動插值引擎 (Timeline Keyframes & Cubic Easing) ✅
- **高精準時間 ticks**：系統以每秒 `1,000,000,000` (10億)  ticks 作為精度基準，避免浮點運算累積誤差。
- **立方緩動算法 (`evaluatePropertyAtTime`)**：
  - 當前播放頭落在兩個關鍵影格區間時，會根據前一個影格的緩動屬性套用三次方插值公式：
    - **Linear**：$f(t) = t$
    - **Ease In**：$f(t) = t^3$
    - **Ease Out**：$f(t) = (t-1)^3 + 1$
    - **Ease In Out**：$f(t) = t < 0.5 ? 4t^3 : 1 - \frac{(-2t+2)^3}{2}$
- **屬性通道視覺化**：點擊片段時展開 Property Lanes，以 ◆ 紫色 (Linear) 與 ◆ 金色 (Eased) 菱形節點進行精確視覺標示，點擊即可刪除。

### 5.3 特效堆疊與畫布即時渲染 (Effects Stack & CSS Filter) ✅
- **動態參數調節**：在 Inspector 中支持九大特效，可透過滑桿動態調整：
  - `blur` $\rightarrow$ radius (0 ~ 50px)
  - `brightness` / `contrast` / `saturate` $\rightarrow$ amount (0 ~ 200%)
  - `grayscale` / `sepia` / `invert` $\rightarrow$ amount (0 ~ 100%)
  - `hueRotate` $\rightarrow$ angle (0 ~ 360°)
  - `dropShadow` $\rightarrow$ offsetX, offsetY, radius (X/Y 軸偏移與陰影模糊半徑)
- **多重效果連鎖 (CSS Filter Chaining)**：畫布的 `.transform-content` 樣式整合多重效果，串接為單一 CSS 濾鏡語句（例如 `filter: blur(5px) brightness(120%) drop-shadow(5px 5px 10px rgba(0,0,0,0.5))`），以超低耗損達到 GPU 加速預覽。

### 5.4 父子級級聯聯動與死鎖防護 (Parenting) ✅
- **遞迴級聯變形 (`getChainedTransform`)**：子圖層的世界變形會沿著 Parent tree 遞迴向上求取最終結果：
  - **旋轉**：直接相加 $Rotation_{child} + Rotation_{parent}$
  - **縮放**：百分比相乘 $Scale_{child} \times Scale_{parent}$
  - **不透明度**：百分比相乘 $Opacity_{child} \times Opacity_{parent}$
  - **位置變換**：子圖層的 posX / posY 被視為相對於父圖層的偏移向量。此向量首先經父圖層的縮放比拉伸，再經父圖層的旋轉角度進行極坐標旋轉投影，最後疊加至父圖層的世界 posX / posY。
- **防死鎖防護**：下拉選單過濾機制如下：
  $$ParentCandidates = \{ c \in Clips \mid c.id \neq child.id \land child.id \notin Ancestors(c) \}$$
  這能保證使用者在點擊選單時，絕不會產生「A Parented to B, B Parented to A」的循環引用死鎖。

### 5.5 多媒體自動分离與本機偵測 (Asset Linked Import) ✅
- 當使用者匯入含有視訊及音訊的本機影片檔案時，系統會自動在 V1 軌道建立視訊片段，並在 A1 軌道建立音訊片段，兩者共用同一個 AssetId 並連結移動，實現了與 Adobe Premiere / After Effects 一致的雙軌對齊體驗。

---

## 6. 時間表示與時間軸編輯策略

- **Ruler 渲染與 Snapping**：每 30 幀 (1秒) 為主要刻度，支持 **網格吸附功能 (Grid Snapping)**。吸附以 0.5 秒 (500,000,000 Ticks) 或影片影格刻度進行整除貼齊。
- **Undo / Redo 引擎**：編輯器的每一次 Transform 滑鼠拖曳放開、剪輯片段切割 (Razor)、屬性重置或關鍵影格修改，均會寫入 `undoStack` 指令歷史中，支援使用者隨時 `Ctrl+Z` 復原與 `Ctrl+Y` 重做。

---

## 7. 安全模型與沙箱策略

1. **側載二進位限制 (Capability Limit)**：Tauri Capability 只授予執行特定本機 FFmpeg / ffprobe sidecar 的權限。不允許前端發送任意 shell 指令，亦不允許調用非白名單可執行檔。
2. **素材庫導入隔離**：前端點擊「匯入」時，透過 input type="file" 或 Tauri 對話框，只接收選取的單一文件，由 Rust 側進行元數據解析，前端不直接對本機檔案系統作任意磁碟遍歷。

---

## 8. 下一階段研發展望

### Milestone 3 (Sprint 3) — 已完成 ✅
- **貝氏曲線動畫編輯器 (Graph Editor)**：於時間軸下方整合 Graph Editor。實現了高精度牛頓法插值求解器、SVG 畫布自適應渲染、貝氏控制把手 (Bezier Handles) 拖曳與平滑緩動預設 (F9 Easy Ease / Hold / Linear)。

### Milestone 4 — 規劃中 🟡
- **高效能 Compositor 研發**：未來將在後端進一步研究引入 `wgpu` (WebGPU for Rust) 作為高效能 compositor，使導出端 (Export) 與預覽端 (Preview) 共用同一套 GPU 像素著色器管線，實現像素級的渲染一致性。

### Milestone 5 — 規劃中 🟡
- **音訊波形視覺化與頻譜分析**：於後端引入音訊解析模組，在前端 A1 音訊片段上動態且精準地渲染出實際的音量振幅波形與頻譜圖，提升音軌對齊操作性。

---

## 9. 參考資料

- Tauri Process Model: https://v2.tauri.app/concept/process-model/
- Zustand State Store: https://github.com/pmndrs/zustand
- Wgpu-rs GPU Compositing: https://wgpu.rs/
