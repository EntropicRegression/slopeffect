# Slopeffect 修復計畫

## 1. Export

### 目前問題
- `start_export_project` 後端目前只回傳未實作錯誤。
- `safeInvoke` 會吞掉 Tauri IPC 錯誤並回傳 `null`，導致前端把失敗匯出顯示成成功。
- 匯出流程沒有監聽 `export_progress`，進度、剩餘時間與背景渲染目前只是 UI 假資料。
- 匯出只傳 `exportPath` 與 `preset`，沒有完整輸出檔名、格式、解析度、FPS、bitrate 等設定。

### 修復步驟
1. 調整 `safeInvoke`，讓重要命令可以選擇丟出錯誤，不要一律回傳 `null`。
2. 修改 `handleStartRender`，只有後端真的回傳 job id 或完成狀態時才顯示成功。
3. 在前端接上 `safeListen('export_progress', ...)` 更新進度、階段、錯誤與完成狀態。
4. 補齊匯出 DTO，至少包含完整輸出檔案路徑、filename、format、codec、resolution、fps、bitrate。
5. 後端先實作可驗證的最小匯出流程；若完整 FFmpeg 匯出尚未完成，UI 應清楚顯示「未支援」，不能顯示成功。

## 2. Import

### 目前問題
- 匯入改用瀏覽器 `File` + `blobUrl`，重開專案後 `blob:` URL 會失效。
- 專案儲存時只保存 asset 資料，沒有保存原始媒體檔路徑，後端匯出無法找到素材。
- 同名素材被 `importAsset` 忽略，但 UI 仍會建立 clip，可能產生指向不存在 asset 的 clip。
- 原本的 `pick_media_file` 與 `probe_media_file` 後端能力沒有被使用，無法取得穩定媒體 metadata。

### 修復步驟
1. 擴充 `Asset` 型別，加入 `sourcePath?: string`，必要時保留 `blobUrl?: string` 只作目前 session 預覽。
2. 改回使用 Tauri `pick_media_file` 取得真實檔案路徑，再用 `probe_media_file` 取得 duration、尺寸、格式等 metadata。
3. 匯入成功後同時保存 `sourcePath` 與 metadata；預覽可再由前端建立臨時 URL 或改用 Tauri asset protocol。
4. 修正同名素材策略：用唯一 `id` 判斷，或遇到同名時產生不同顯示名稱，不要靜默忽略。
5. clip 建立前確認 asset 已成功寫入 store；失敗時不要建立 clip。

## 3. Auto Track

### 目前問題
- 匯入與雙擊加入時間軸時硬編碼 `v2`、`v1`、`a1`。
- 如果使用者新增、刪除、重排軌道，clip 可能被放到不存在或不合理的軌道。
- `removeTrack` 會刪除軌道，但目前沒有 UI 保護預設軌，也沒有自動替代軌策略。

### 修復步驟
1. 在 store 增加 helper，例如 `findDefaultTrack(type)` 或 `ensureDefaultTrack(type)`。
2. video/svg/scene clip 自動選擇第一條未鎖定 video track；audio clip 自動選擇第一條未鎖定 audio track。
3. 如果沒有可用軌道，自動建立一條對應類型軌道，再把 clip 放上去。
4. 移除匯入與雙擊流程中的 `v1/v2/a1` 硬編碼。
5. 補上軌道刪除後的保護邏輯，避免所有 video 或 audio 軌被刪完後新增 clip 失敗。

## 4. Dragging

### 目前問題
- clip 拖曳時直接 mutation `store.clips[clipId]`，繞過 Zustand action、undo/redo 與驗證。
- 垂直拖曳用固定 `60px` 計算軌道 index，但實際 timeline row 可能因 keyframe lane 展開而變高。
- 水平拖曳使用 `document.querySelector('.track-content')` 取得第一條軌道，可能造成座標基準錯誤。
- 素材卡有 `draggable` 屬性，但沒有 `onDragStart`、`onDrop`、`dataTransfer` 實作，拖到時間軸目前沒有作用。

### 修復步驟
1. 在 store 增加 `moveClip(clipId, startTicks, trackId)`，集中處理時間、軌道類型、locked 狀態與 `isSaved`。
2. 拖曳期間不要直接改 `store.clips`；改呼叫 store action 或在 mouseup 時一次提交。
3. 水平座標改用目前目標 track row 的 `.track-content` rect，不要用第一個 `.track-content`。
4. 垂直目標軌道改用每個 track row 的 DOM rect hit-test，而不是固定除以 `60`。
5. 實作素材庫到時間軸的 drag/drop：
   - `onDragStart` 寫入 asset id 或 scene id。
   - timeline track `onDragOver` 允許 drop。
   - `onDrop` 依 drop 位置換算 startTicks，並選擇該 track。
6. 拖曳 clip 跨軌時要檢查 type：audio 只能進 audio track，video/svg/scene 只能進 video track。

## 5. 驗證項目

- `npm run build`
- `npm run lint`
- `cargo check`
- 手動驗證：
  - 匯入 video/audio/svg 後可預覽。
  - 儲存專案、重開專案後素材仍可用。
  - 匯出失敗時 UI 顯示失敗，不會顯示完成。
  - 新增、刪除、重排軌道後，匯入素材仍會放到正確軌道。
  - clip 水平拖曳、跨軌拖曳、素材拖到時間軸都能正確運作。
