// ==========================================================================
// Slopeffect Pro - Interactive Editor Workspace Logic
// ==========================================================================

// --- App State ---
const state = {
  currentTimeTicks: 4400000000, // Starting at 4.4 seconds (00:00:04;12)
  playing: false,
  activeTool: 'select', // 'select', 'razor', 'trim', 'hand'
  selectedClipId: 'clip-logo', // Default selected clip
  zoom: 150, // Timeline pixel width per second
  snap: true,
  volume: 80,
  
  // Undo/Redo command stacks
  undoStack: [],
  redoStack: [],
  
  // Scenes State (Stage 1 custom dimensions)
  currentSceneId: 'scene-1',
  scenes: {
    'scene-1': { id: 'scene-1', name: 'Scene 1', width: 1920, height: 1080 }
  },
  
  // Asset Library State
  assets: [
    { id: 'asset-sunset', name: 'nature_sunset.mp4', type: 'video', size: '1920x1080', duration: '15.0s', format: 'MP4' },
    { id: 'asset-drone', name: 'atmospheric_drone.wav', type: 'audio', size: '48,000Hz', duration: '32.0s', format: 'WAV' },
    { id: 'asset-logo', name: 'logo_vector.svg', type: 'svg', size: 'Vector', duration: 'Static', format: 'SVG' }
  ],
  
  // Active Clips in Timeline
  clips: {
    'clip-sunset': {
      id: 'clip-sunset',
      name: 'nature_sunset.mp4',
      type: 'video',
      startTicks: 0,
      durationTicks: 10000000000, // 10 seconds
      assetId: 'asset-sunset',
      trackId: 'v1',
      transform: { posX: 960, posY: 540, scale: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
      enabled: true
    },
    'clip-logo': {
      id: 'clip-logo',
      name: 'logo_vector.svg',
      type: 'svg',
      startTicks: 3000000000, // 3 seconds
      durationTicks: 5000000000, // 5 seconds
      assetId: 'asset-logo',
      trackId: 'v2',
      transform: { posX: 960, posY: 540, scale: 75, rotation: 45, opacity: 85, blendMode: 'normal' },
      keyframes: { position: true, scale: true, rotation: true, opacity: false },
      enabled: true
    },
    'clip-drone': {
      id: 'clip-drone',
      name: 'atmospheric_drone.wav',
      type: 'audio',
      startTicks: 0,
      durationTicks: 15000000000, // 15 seconds
      assetId: 'asset-drone',
      trackId: 'a1',
      transform: { posX: 0, posY: 0, scale: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
      enabled: true
    }
  },
  
  // Track Status
  tracks: {
    v2: { muted: false, locked: false },
    v1: { muted: false, locked: false },
    a1: { muted: false, locked: false, solo: false }
  }
};

// --- Constant Multipliers ---
const TICKS_PER_SECOND = 1000000000;
const FPS = 30;
const TICKS_PER_FRAME = TICKS_PER_SECOND / FPS;

// --- DOM References ---
const playhead = document.getElementById('timeline-playhead');
const timecodeStr = document.getElementById('timecode-str');
const timelineTimecodeStr = document.getElementById('timeline-timecode-str');
const ticksStr = document.getElementById('ticks-str');
const rulerTicksContainer = document.getElementById('ruler-ticks-container');
const previewVolume = document.getElementById('preview-volume');
const volumeIcon = document.getElementById('volume-icon');
const playBtn = document.getElementById('play-btn');
const inspectorPlaceholder = document.getElementById('inspector-placeholder');
const inspectorControls = document.getElementById('inspector-controls');
const transformBox = document.getElementById('transform-box');
const svgLayerRendered = document.getElementById('svg-layer-rendered');
const shapeLayerRendered = document.getElementById('shape-layer-rendered');

// --- Dragging Variables ---
let isDraggingPlayhead = false;
let isDraggingTransform = false;
let isDraggingClip = false;
let dragClipOffset = 0;
let dragClipElement = null;
let transformDragStart = { x: 0, y: 0 };
let activeHandle = null;

// ==========================================================================
// Initialization & Core Binding
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();
  
  // Render Scene Switcher dropdown
  renderSceneSwitcher();
  
  // Render Asset Library Panel
  renderAssetList();
  
  // Render Ruler Ticks
  drawTimelineRuler();
  
  // Position Playhead & Selection overlays
  updatePlayheadPosition();
  selectClip(state.selectedClipId);

  // Wire up Global Mouse listeners for dragging
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
  
  // Bind Ticks clicking
  document.getElementById('timeline-ruler-el').addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('playhead-handle')) {
      isDraggingPlayhead = true;
    } else {
      seekToMouse(e);
      isDraggingPlayhead = true;
    }
  });

  // Bind transform handles dragging
  transformBox.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('handle')) {
      activeHandle = e.target.dataset.handle;
    } else {
      isDraggingTransform = true;
      transformDragStart.x = e.clientX;
      transformDragStart.y = e.clientY;
    }
    e.stopPropagation();
  });
  
  // Custom command listening (hotkeys)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      triggerUndo();
      e.preventDefault();
    } else if (e.ctrlKey && e.key === 'y') {
      triggerRedo();
      e.preventDefault();
    } else if (e.key === 's' || e.key === 'S') {
      simulateSplit();
    } else if (e.key === 'Delete') {
      simulateDelete();
    }
  });
});

// ==========================================================================
// Render Helpers & Drawing UI
// ==========================================================================

function drawTimelineRuler() {
  rulerTicksContainer.innerHTML = '';
  const rulerWidth = 2000;
  const zoomScale = state.zoom; // pixels per second
  
  // Draw major/minor ticks every second
  for (let s = 0; s <= 12; s++) {
    const pos = s * zoomScale;
    if (pos > rulerWidth) break;
    
    // Major tick
    const tick = document.createElement('div');
    tick.className = 'tick-mark major';
    tick.style.left = `${pos}px`;
    
    const label = document.createElement('div');
    label.className = 'tick-label';
    label.style.left = `${pos}px`;
    label.innerText = ticksToTimecode(s * TICKS_PER_SECOND);
    
    rulerTicksContainer.appendChild(tick);
    rulerTicksContainer.appendChild(label);
    
    // Minor ticks (frames)
    for (let f = 1; f < 30; f += 5) {
      const frameTicks = (s + f/30) * TICKS_PER_SECOND;
      const fPos = (s + f/30) * zoomScale;
      const mTick = document.createElement('div');
      mTick.className = 'tick-mark';
      mTick.style.left = `${fPos}px`;
      rulerTicksContainer.appendChild(mTick);
    }
  }
}

function renderAssetList() {
  const assetsContainer = document.getElementById('assets-list');
  assetsContainer.innerHTML = '';
  
  state.assets.forEach(asset => {
    const card = document.createElement('div');
    card.className = `asset-card ${state.clips[state.selectedClipId]?.assetId === asset.id ? 'selected' : ''}`;
    card.draggable = true;
    
    let iconHTML = '';
    if (asset.type === 'video') iconHTML = '<i data-lucide="video"></i>';
    else if (asset.type === 'audio') iconHTML = '<i data-lucide="music"></i>';
    else if (asset.type === 'svg') iconHTML = '<i data-lucide="file-type-2"></i>';
    else iconHTML = '<i data-lucide="image"></i>';
    
    card.innerHTML = `
      <div class="asset-thumb ${asset.type}">${iconHTML}</div>
      <div class="asset-info">
        <span class="asset-name">${asset.name}</span>
        <span class="asset-meta">${asset.size} | ${asset.duration}</span>
      </div>
    `;
    
    card.addEventListener('click', () => {
      // Simulate selection in assets library
      document.querySelectorAll('.asset-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    
    assetsContainer.appendChild(card);
  });
  lucide.createIcons();
}

// ==========================================================================
// Timecode & SMPTE Helpers
// ==========================================================================

function ticksToTimecode(ticks) {
  const totalSeconds = Math.floor(ticks / TICKS_PER_SECOND);
  const remainingTicks = ticks % TICKS_PER_SECOND;
  const frame = Math.floor(remainingTicks / TICKS_PER_FRAME);
  
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)};${pad(frame)}`;
}

function updatePlayheadPosition() {
  const playheadPos = (state.currentTimeTicks / TICKS_PER_SECOND) * state.zoom;
  playhead.style.left = `${playheadPos + 180}px`; // Offset track headers (180px)
  
  // Readout Timecodes
  const tc = ticksToTimecode(state.currentTimeTicks);
  timecodeStr.innerText = tc;
  timelineTimecodeStr.innerText = tc;
  ticksStr.innerText = `${state.currentTimeTicks.toLocaleString()} ticks`;
  
  // Update simulated preview bg to pure solid black
  const previewBg = document.getElementById('preview-video-bg');
  previewBg.style.opacity = '1.0';
  previewBg.style.backgroundImage = 'none';
  previewBg.style.backgroundColor = '#000000';
}

// ==========================================================================
// Playback Engine Simulation
// ==========================================================================
let playInterval = null;

function togglePlay() {
  if (state.playing) {
    clearInterval(playInterval);
    state.playing = false;
    playBtn.innerHTML = '<i data-lucide="play"></i>';
  } else {
    state.playing = true;
    playBtn.innerHTML = '<i data-lucide="pause"></i>';
    
    const startTime = Date.now();
    const startTicks = state.currentTimeTicks;
    
    playInterval = setInterval(() => {
      // Simulate real-time ticking
      const elapsed = Date.now() - startTime;
      state.currentTimeTicks = startTicks + (elapsed * 1000000); // 1ms = 1,000,000 ticks
      
      // Wrap or stop around 15 seconds
      if (state.currentTimeTicks >= 15000000000) {
        state.currentTimeTicks = 0;
      }
      updatePlayheadPosition();
    }, 1000 / FPS);
  }
  lucide.createIcons();
}

function skipToStart() {
  state.currentTimeTicks = 0;
  updatePlayheadPosition();
}

function skipToEnd() {
  state.currentTimeTicks = 15000000000;
  updatePlayheadPosition();
}

function stepForward() {
  state.currentTimeTicks += TICKS_PER_FRAME;
  if (state.currentTimeTicks > 15000000000) state.currentTimeTicks = 15000000000;
  updatePlayheadPosition();
}

function stepBack() {
  state.currentTimeTicks -= TICKS_PER_FRAME;
  if (state.currentTimeTicks < 0) state.currentTimeTicks = 0;
  updatePlayheadPosition();
}

function changeVolume(val) {
  state.volume = val;
  if (val == 0) {
    volumeIcon.innerHTML = '<i data-lucide="volume-x"></i>';
  } else if (val < 40) {
    volumeIcon.innerHTML = '<i data-lucide="volume"></i>';
  } else if (val < 80) {
    volumeIcon.innerHTML = '<i data-lucide="volume-1"></i>';
  } else {
    volumeIcon.innerHTML = '<i data-lucide="volume-2"></i>';
  }
  lucide.createIcons();
}

// ==========================================================================
// Mouse and Drag Event Handlers
// ==========================================================================

function seekToMouse(e) {
  const rulerRect = document.getElementById('timeline-ruler-el').getBoundingClientRect();
  const clickX = e.clientX - rulerRect.left - 180; // Offset track header
  let targetTicks = (clickX / state.zoom) * TICKS_PER_SECOND;
  
  if (targetTicks < 0) targetTicks = 0;
  if (targetTicks > 15000000000) targetTicks = 15000000000;
  
  // Snap playhead to frames if snap is active
  if (state.snap) {
    const frameIndex = Math.round(targetTicks / TICKS_PER_FRAME);
    targetTicks = frameIndex * TICKS_PER_FRAME;
  }
  
  state.currentTimeTicks = targetTicks;
  updatePlayheadPosition();
}

function handleGlobalMouseMove(e) {
  if (isDraggingPlayhead) {
    seekToMouse(e);
  } else if (isDraggingTransform && state.selectedClipId) {
    // Draggable center box translation
    const clip = state.clips[state.selectedClipId];
    if (clip && clip.transform) {
      const deltaX = e.clientX - transformDragStart.x;
      const deltaY = e.clientY - transformDragStart.y;
      
      const prevX = clip.transform.posX;
      const prevY = clip.transform.posY;
      
      // Update values
      clip.transform.posX = Math.round(clip.transform.posX + deltaX * 2); // Amplify slightly for responsive feel
      clip.transform.posY = Math.round(clip.transform.posY + deltaY * 2);
      
      // Update drag starting coordinate
      transformDragStart.x = e.clientX;
      transformDragStart.y = e.clientY;
      
      // Apply UI updates
      applyTransformToPreview(clip.id);
      updateInspectorFields(clip.id);
      
      // Track action for undo list
      recordCommand({
        type: 'transform',
        clipId: clip.id,
        prev: { posX: prevX, posY: prevY },
        next: { posX: clip.transform.posX, posY: clip.transform.posY }
      });
    }
  } else if (activeHandle && state.selectedClipId) {
    const clip = state.clips[state.selectedClipId];
    if (clip && clip.transform) {
      if (activeHandle === 'rotate') {
        // Rotate logic
        const screenRect = document.getElementById('video-screen').getBoundingClientRect();
        const centerX = screenRect.left + (screenRect.width / 2);
        const centerY = screenRect.top + (screenRect.height / 2);
        
        const rad = Math.atan2(e.clientX - centerX, -(e.clientY - centerY));
        const deg = Math.round(rad * (180 / Math.PI));
        
        clip.transform.rotation = deg;
        applyTransformToPreview(clip.id);
        updateInspectorFields(clip.id);
      } else if (activeHandle === 'br' || activeHandle === 'tr' || activeHandle === 'bl' || activeHandle === 'tl') {
        // Simple Scale calculation based on distance from center
        const screenRect = document.getElementById('video-screen').getBoundingClientRect();
        const centerX = screenRect.left + (screenRect.width / 2);
        const centerY = screenRect.top + (screenRect.height / 2);
        
        const dist = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
        const initialDist = 120; // baseline arbitrary pixels for scale 100%
        const scalePct = Math.round((dist / initialDist) * 100);
        
        clip.transform.scale = Math.max(10, Math.min(200, scalePct));
        applyTransformToPreview(clip.id);
        updateInspectorFields(clip.id);
      }
    }
  } else if (isDraggingClip && dragClipElement) {
    // Moving clips along tracks
    const trackContent = dragClipElement.parentElement.getBoundingClientRect();
    const cursorXOnTrack = e.clientX - trackContent.left - 180; // offset track header
    
    let targetX = cursorXOnTrack - dragClipOffset;
    let targetTicks = (targetX / state.zoom) * TICKS_PER_SECOND;
    
    if (targetTicks < 0) targetTicks = 0;
    
    if (state.snap) {
      // Snap to nearest 0.5s or other clip bounds
      const snapInterval = TICKS_PER_SECOND * 0.5;
      targetTicks = Math.round(targetTicks / snapInterval) * snapInterval;
    }
    
    // Write back start ticks
    const clipId = dragClipElement.id;
    const clip = state.clips[clipId];
    if (clip) {
      clip.startTicks = targetTicks;
      
      // Update clip block visual position
      const leftPixel = (clip.startTicks / TICKS_PER_SECOND) * state.zoom;
      dragClipElement.style.left = `${leftPixel}px`;
    }
  }
}

function handleGlobalMouseUp() {
  isDraggingPlayhead = false;
  isDraggingTransform = false;
  isDraggingClip = false;
  activeHandle = null;
  dragClipElement = null;
}

// ==========================================================================
// Clip Selection & inspector Syncing
// ==========================================================================

function selectClip(clipId, e) {
  state.selectedClipId = clipId;
  
  // Visual classes on timeline blocks
  document.querySelectorAll('.clip-block').forEach(el => {
    el.classList.remove('selected');
  });
  
  const selectedEl = document.getElementById(clipId);
  if (selectedEl) {
    selectedEl.classList.add('selected');
    
    // If selecting via direct click, prepare drag logic
    if (e && e.target.classList.contains('clip-resize-handle') === false) {
      isDraggingClip = true;
      dragClipElement = selectedEl;
      
      const rect = selectedEl.getBoundingClientRect();
      dragClipOffset = e.clientX - rect.left;
    }
  }
  
  // Highlight corresponding asset item in left list
  const activeClip = state.clips[clipId];
  if (activeClip) {
    document.querySelectorAll('.asset-card').forEach(c => c.classList.remove('selected'));
    renderAssetList(); // refresh selection badge in grid
    
    // Reveal Inspector
    inspectorPlaceholder.style.display = 'none';
    inspectorControls.style.display = 'block';
    
    // Bind Inspector values
    document.getElementById('layer-name-input').value = activeClip.name;
    document.getElementById('layer-enabled-checkbox').checked = activeClip.enabled;
    document.getElementById('blend-mode-select').value = activeClip.transform.blendMode || 'normal';
    
    updateInspectorFields(clipId);
    applyTransformToPreview(clipId);
    
    // Display handles box only for visual layers (video/svg)
    if (activeClip.type === 'video' || activeClip.type === 'svg') {
      transformBox.style.display = 'block';
      if (activeClip.type === 'svg') {
        svgLayerRendered.style.display = 'block';
        shapeLayerRendered.style.display = 'none';
      } else {
        svgLayerRendered.style.display = 'none';
        shapeLayerRendered.style.display = 'block';
      }
    } else {
      transformBox.style.display = 'none';
    }
  } else {
    // Hide Inspector
    inspectorPlaceholder.style.display = 'flex';
    inspectorControls.style.display = 'none';
    transformBox.style.display = 'none';
  }
}

function updateInspectorFields(clipId) {
  const clip = state.clips[clipId];
  if (!clip || !clip.transform) return;
  
  // Positions
  document.getElementById('pos-x-input').value = clip.transform.posX;
  document.getElementById('pos-y-input').value = clip.transform.posY;
  
  // Scale
  document.getElementById('scale-input').value = clip.transform.scale;
  
  // Rotation
  document.getElementById('rot-input').value = clip.transform.rotation;
  
  // Opacity
  document.getElementById('opacity-input').value = clip.transform.opacity;
  
  // Keyframe clock toggles visual state
  toggleKeyframeIndicator('pos', clip.keyframes.position);
  toggleKeyframeIndicator('scale', clip.keyframes.scale);
  toggleKeyframeIndicator('rot', clip.keyframes.rotation);
  toggleKeyframeIndicator('opacity', clip.keyframes.opacity);
}

function toggleKeyframeIndicator(idPrefix, active) {
  const btn = document.getElementById(`kf-btn-${idPrefix}`);
  if (btn) {
    if (active) btn.classList.add('animate-active');
    else btn.classList.remove('animate-active');
  }
}

// ==========================================================================
// Inspector Form Controls Actions
// ==========================================================================



function handleInspectorNumInput(prop, val) {
  if (!state.selectedClipId) return;
  const clip = state.clips[state.selectedClipId];
  if (!clip || !clip.transform) return;
  
  const numVal = parseInt(val) || 0;
  
  if (prop === 'posX') {
    clip.transform.posX = numVal;
  } else if (prop === 'posY') {
    clip.transform.posY = numVal;
  } else {
    // scale, rotation, opacity
    clip.transform[prop] = numVal;
  }
  applyTransformToPreview(clip.id);
}

function applyTransformToPreview(clipId) {
  const clip = state.clips[clipId];
  if (!clip || !clip.transform) return;
  
  // Map internal 1920x1080 coords to viewport percentages
  // Preview container is e.g. 500x281 pixels (16:9 ratio)
  const normX = ((clip.transform.posX - 960) / 1920) * 100;
  const normY = ((clip.transform.posY - 540) / 1080) * 100;
  const scale = clip.transform.scale / 100;
  
  // Transform Box translation css mapping
  transformBox.style.transform = `translate(${normX}%, ${normY}%) rotate(${clip.transform.rotation}deg) scale(${scale})`;
  transformBox.style.opacity = clip.transform.opacity / 100;
}

function toggleKeyframe(prop) {
  if (!state.selectedClipId) return;
  const clip = state.clips[state.selectedClipId];
  if (!clip) return;
  
  clip.keyframes[prop] = !clip.keyframes[prop];
  updateInspectorFields(clip.id);
  showToast(`關鍵影格已 ${clip.keyframes[prop] ? '新增至' : '移出'} 時間軸`);
}

function updateLayerName(val) {
  if (!state.selectedClipId) return;
  state.clips[state.selectedClipId].name = val;
  
  // Sync timeline block text
  const blockNameEl = document.querySelector(`#${state.selectedClipId} .clip-name`);
  if (blockNameEl) blockNameEl.innerText = val;
}

function toggleLayerEnabled(checked) {
  if (!state.selectedClipId) return;
  state.clips[state.selectedClipId].enabled = checked;
  
  const previewContent = document.getElementById('selected-overlay-content');
  if (previewContent) {
    previewContent.style.opacity = checked ? '1.0' : '0.1';
  }
}

function resetTransform() {
  if (!state.selectedClipId) return;
  const clip = state.clips[state.selectedClipId];
  if (!clip || !clip.transform) return;
  
  clip.transform.posX = 960;
  clip.transform.posY = 540;
  clip.transform.scale = 100;
  clip.transform.rotation = 0;
  clip.transform.opacity = 100;
  
  updateInspectorFields(clip.id);
  applyTransformToPreview(clip.id);
}

function updateBlendMode(val) {
  if (!state.selectedClipId) return;
  state.clips[state.selectedClipId].transform.blendMode = val;
  svgLayerRendered.style.mixBlendMode = val;
  shapeLayerRendered.style.mixBlendMode = val;
}

// ==========================================================================
// Timeline Operations & Tools
// ==========================================================================

function selectTool(toolName) {
  state.activeTool = toolName;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tool-${toolName}`).classList.add('active');
  showToast(`工具已切換至：${toolName === 'select' ? '選取 (V)' : toolName === 'razor' ? '剃刀 (C)' : toolName === 'trim' ? '修剪 (T)' : '抓手 (H)'}`);
}

function toggleSnap() {
  state.snap = !state.snap;
  const btn = document.getElementById('timeline-snap-btn');
  btn.querySelector('span').innerText = state.snap ? '開' : '關';
  if (state.snap) btn.classList.add('active');
  else btn.classList.remove('active');
}

function handleTimelineZoom(val) {
  state.zoom = parseInt(val);
  drawTimelineRuler();
  
  // Recalculate all clip widths and left coordinates on timeline
  Object.values(state.clips).forEach(clip => {
    const leftPixel = (clip.startTicks / TICKS_PER_SECOND) * state.zoom;
    const widthPixel = (clip.durationTicks / TICKS_PER_SECOND) * state.zoom;
    
    const block = document.getElementById(clip.id);
    if (block) {
      block.style.left = `${leftPixel}px`;
      block.style.width = `${widthPixel}px`;
    }
  });
  updatePlayheadPosition();
}

function zoomTimeline(delta) {
  const slider = document.getElementById('timeline-zoom-slider');
  let newVal = parseInt(slider.value) + delta;
  newVal = Math.max(50, Math.min(250, newVal));
  slider.value = newVal;
  handleTimelineZoom(newVal);
}

// Mute & Track states
function toggleTrackMute(trackId) {
  state.tracks[trackId].muted = !state.tracks[trackId].muted;
  const btn = document.getElementById(`mute-${trackId}`);
  btn.innerHTML = state.tracks[trackId].muted ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
  lucide.createIcons();
  
  // Hide clips on track
  const trackRow = document.querySelector(`.track-row[data-track-id="${trackId}"]`);
  trackRow.style.opacity = state.tracks[trackId].muted ? '0.3' : '1.0';
  
  // If track is V2 and muted, hide selected layer
  if (trackId === 'v2') {
    transformBox.style.visibility = state.tracks[trackId].muted ? 'hidden' : 'visible';
  }
}

function toggleTrackLock(trackId) {
  state.tracks[trackId].locked = !state.tracks[trackId].locked;
  const btn = document.getElementById(`lock-${trackId}`);
  btn.innerHTML = state.tracks[trackId].locked ? '<i data-lucide="lock"></i>' : '<i data-lucide="unlock"></i>';
  lucide.createIcons();
  
  const clips = document.querySelectorAll(`.track-row[data-track-id="${trackId}"] .clip-block`);
  clips.forEach(clip => {
    if (state.tracks[trackId].locked) clip.style.pointerEvents = 'none';
    else clip.style.pointerEvents = 'auto';
  });
}

function toggleAudioMute(trackId) {
  state.tracks[trackId].muted = !state.tracks[trackId].muted;
  const btn = document.getElementById(`mute-${trackId}`);
  if (state.tracks[trackId].muted) btn.classList.add('active');
  else btn.classList.remove('active');
  showToast(`軌道音訊已 ${state.tracks[trackId].muted ? '靜音' : '取消靜音'}`);
}

function toggleAudioSolo(trackId) {
  state.tracks[trackId].solo = !state.tracks[trackId].solo;
  const btn = document.getElementById(`solo-${trackId}`);
  if (state.tracks[trackId].solo) btn.classList.add('active');
  else btn.classList.remove('active');
  showToast(`軌道音訊已 ${state.tracks[trackId].solo ? '啟用獨奏' : '停用獨奏'}`);
}

// Split Action
function simulateSplit() {
  if (!state.selectedClipId) {
    showToast('請先選擇一個時間軸片段進行切割');
    return;
  }
  
  const clip = state.clips[state.selectedClipId];
  if (!clip) return;
  
  const playheadTicks = state.currentTimeTicks;
  
  // Check if playhead intersects clip
  const clipEnd = clip.startTicks + clip.durationTicks;
  if (playheadTicks > clip.startTicks && playheadTicks < clipEnd) {
    const leftPartDuration = playheadTicks - clip.startTicks;
    const rightPartDuration = clipEnd - playheadTicks;
    
    // Shorten current clip
    clip.durationTicks = leftPartDuration;
    const leftWidth = (leftPartDuration / TICKS_PER_SECOND) * state.zoom;
    const currentEl = document.getElementById(clip.id);
    currentEl.style.width = `${leftWidth}px`;
    currentEl.querySelector('.clip-duration').innerText = `${(leftPartDuration / TICKS_PER_SECOND).toFixed(1)}s`;
    
    // Create new clip for the right part
    const newId = `${clip.id}-split`;
    const newClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: newId,
      startTicks: playheadTicks,
      durationTicks: rightPartDuration
    };
    
    state.clips[newId] = newClip;
    
    // Render new block on UI
    const rightLeftPx = (newClip.startTicks / TICKS_PER_SECOND) * state.zoom;
    const rightWidthPx = (newClip.durationTicks / TICKS_PER_SECOND) * state.zoom;
    
    const newBlock = document.createElement('div');
    newBlock.className = `clip-block video-clip ${clip.type === 'video' ? 'blue-gradient' : 'purple-gradient'}`;
    newBlock.id = newId;
    newBlock.style.left = `${rightLeftPx}px`;
    newBlock.style.width = `${rightWidthPx}px`;
    newBlock.onclick = (e) => selectClip(newId, e);
    
    let iconName = clip.type === 'video' ? 'video' : 'file-type-2';
    newBlock.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span class="clip-name">${newClip.name} (切割)</span>
      <span class="clip-duration">${(rightPartDuration / TICKS_PER_SECOND).toFixed(1)}s</span>
      <div class="clip-resize-handle handle-l"></div>
      <div class="clip-resize-handle handle-r"></div>
    `;
    
    document.getElementById(`track-${clip.trackId}-clips`).appendChild(newBlock);
    lucide.createIcons();
    
    // Record Command
    recordCommand({
      type: 'split',
      originalId: clip.id,
      newId: newId,
      originalDuration: leftPartDuration + rightPartDuration,
      splitTicks: playheadTicks
    });
    
    selectClip(newId);
    showToast('片段已成功於播放頭位置切割');
  } else {
    showToast('播放頭不在選取的片段內部，無法切割');
  }
}

// Delete Clip Action
function simulateDelete() {
  if (!state.selectedClipId) return;
  
  const clip = state.clips[state.selectedClipId];
  if (!clip) return;
  
  const el = document.getElementById(clip.id);
  if (el) el.remove();
  
  delete state.clips[clip.id];
  selectClip(null);
  showToast('片段已從時間軸刪除');
}

// ==========================================================================
// Media Importing Simulation
// ==========================================================================

function triggerImport() {
  document.getElementById('import-dialog').style.display = 'flex';
}

function closeImport() {
  document.getElementById('import-dialog').style.display = 'none';
}

function importPredefined(assetId, name, type, size, duration, classPrefix) {
  // Add to library
  const exists = state.assets.find(a => a.name === name);
  if (exists) {
    showToast(`素材 ${name} 已經存在於資產庫中`);
    closeImport();
    return;
  }
  
  state.assets.push({
    id: assetId,
    name: name,
    type: type,
    size: size,
    duration: duration,
    format: type.toUpperCase()
  });
  
  renderAssetList();
  closeImport();
  showToast(`已成功匯入素材：${name}！`, 4000);
}

// ==========================================================================
// Undo/Redo Engine
// ==========================================================================

function recordCommand(cmd) {
  state.undoStack.push(cmd);
  state.redoStack = []; // Clear redo stack on new action
  updateUndoRedoButtons();
}

function triggerUndo() {
  if (state.undoStack.length === 0) return;
  const cmd = state.undoStack.pop();
  state.redoStack.push(cmd);
  
  // Revert cmd
  if (cmd.type === 'transform') {
    const clip = state.clips[cmd.clipId];
    if (clip) {
      clip.transform.posX = cmd.prev.posX;
      clip.transform.posY = cmd.prev.posY;
      applyTransformToPreview(clip.id);
      updateInspectorFields(clip.id);
    }
  }
  updateUndoRedoButtons();
  showToast('已復原 (Undo) 上一次的操作');
}

function triggerRedo() {
  if (state.redoStack.length === 0) return;
  const cmd = state.redoStack.pop();
  state.undoStack.push(cmd);
  
  // Apply cmd
  if (cmd.type === 'transform') {
    const clip = state.clips[cmd.clipId];
    if (clip) {
      clip.transform.posX = cmd.next.posX;
      clip.transform.posY = cmd.next.posY;
      applyTransformToPreview(clip.id);
      updateInspectorFields(clip.id);
    }
  }
  updateUndoRedoButtons();
  showToast('已重做 (Redo) 動作');
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const mUndo = document.getElementById('menu-undo');
  const mRedo = document.getElementById('menu-redo');
  
  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;
  
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
  
  if (canUndo) mUndo.classList.remove('disabled');
  else mUndo.classList.add('disabled');
  
  if (canRedo) mRedo.classList.remove('disabled');
  else mRedo.classList.add('disabled');
}

// ==========================================================================
// Glassmorphic Render / Export Simulator
// ==========================================================================
let renderInterval = null;
let renderPercent = 0;

function openExportModal() {
  document.getElementById('export-modal').style.display = 'flex';
  
  // Reset Render Stats
  document.getElementById('export-spinner').style.display = 'none';
  document.getElementById('export-progress-fill').style.style = '0%';
  document.getElementById('render-val-percent').innerText = '準備就緒';
  document.getElementById('render-val-percent').className = 'value';
  document.getElementById('render-val-elapsed').innerText = '00:00:00';
  document.getElementById('render-val-remaining').innerText = '--:--:--';
  document.getElementById('render-val-phase').innerText = '無啟用任務';
  document.getElementById('export-start-btn').disabled = false;
  document.getElementById('export-bg-btn').disabled = true;
  document.getElementById('preview-wm').style.display = 'block';
}

function closeExportModal() {
  document.getElementById('export-modal').style.display = 'none';
  // If render is running, clear interval
  if (renderInterval && renderPercent < 100) {
    clearInterval(renderInterval);
    renderPercent = 0;
    showToast('影片渲染匯出已被使用者取消');
  }
}

function startRender() {
  const startBtn = document.getElementById('export-start-btn');
  const bgBtn = document.getElementById('export-bg-btn');
  const spinner = document.getElementById('export-spinner');
  const progressRing = document.getElementById('export-progress-ring');
  const progressCenterText = document.getElementById('export-progress-text');
  const progressFill = document.getElementById('export-progress-fill');
  
  const wm = document.getElementById('preview-wm');
  wm.style.display = 'none';
  
  startBtn.disabled = true;
  bgBtn.disabled = false;
  spinner.style.display = 'flex';
  
  renderPercent = 0;
  let elapsedSec = 0;
  
  const totalTicksDash = 326.7; // Dash circumference
  
  renderInterval = setInterval(() => {
    renderPercent += 2;
    elapsedSec += 0.2; // Fast time simulation
    
    // Update Percentage circular
    progressCenterText.innerText = `${renderPercent}%`;
    const offset = totalTicksDash - (renderPercent / 100) * totalTicksDash;
    progressRing.style.strokeDashoffset = offset;
    
    // Update Progress bar linear
    progressFill.style.width = `${renderPercent}%`;
    
    // Calculate simulated duration
    const minutes = Math.floor(elapsedSec / 60);
    const seconds = Math.floor(elapsedSec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    
    document.getElementById('render-val-elapsed').innerText = `00:${pad(minutes)}:${pad(seconds)}`;
    document.getElementById('render-val-percent').innerText = `${renderPercent}% (正在渲染)`;
    document.getElementById('render-val-percent').className = 'value accent';
    
    // Estimate remaining
    if (renderPercent > 0) {
      const totalEstimated = (elapsedSec / renderPercent) * 100;
      const remainingSec = Math.max(0, Math.floor(totalEstimated - elapsedSec));
      const remMin = Math.floor(remainingSec / 60);
      const remSec = remainingSec % 60;
      document.getElementById('render-val-remaining').innerText = `00:${pad(remMin)}:${pad(remSec)}`;
    }
    
    // Update Phases conforming to architecture sidecar timeline evaluation
    let phase = '';
    if (renderPercent <= 10) {
      phase = '正在分析序列 ticks 軌道 (Analyzing)...';
    } else if (renderPercent <= 45) {
      const frameNum = Math.round((renderPercent / 100) * 3000);
      phase = `正在渲染 V1 Base Video (影格: ${frameNum} / 3000)`;
    } else if (renderPercent <= 75) {
      phase = '正在疊加 V2 SVG 向量圖層與 Keyframe 插值...';
    } else if (renderPercent <= 90) {
      phase = '正在混合 A1 立體聲波音軌 (Audio Mixdown)...';
    } else if (renderPercent < 100) {
      phase = '正在組合 MP4 (H.264 / AAC) 串流 sidecar 儲存...';
    } else {
      phase = '專案匯出成功！已儲存至目標目錄。';
      clearInterval(renderInterval);
      
      // Render completed
      spinner.style.display = 'none';
      bgBtn.disabled = true;
      startBtn.disabled = false;
      document.getElementById('render-val-percent').innerText = '渲染完成 (100%)';
      document.getElementById('render-val-percent').className = 'value';
      document.getElementById('render-val-remaining').innerText = '00:00:00';
      
      // Hide background badge if active
      document.getElementById('bg-badge').style.display = 'none';
      
      showToast('🎉 影片渲染成功！恭喜！檔名: my_awesome_edit_v1.mp4', 5000);
    }
    
    document.getElementById('render-val-phase').innerText = phase;
    
    // Sync progress to background badge if visible
    const badge = document.getElementById('bg-badge');
    if (badge.style.display !== 'none') {
      document.getElementById('bg-badge-percent').innerText = `${renderPercent}%`;
    }
    
  }, 150);
}

function startBackgroundRender() {
  // Hide modal, show status badge on header
  document.getElementById('export-modal').style.display = 'none';
  const badge = document.getElementById('bg-badge');
  badge.style.display = 'flex';
  document.getElementById('bg-badge-percent').innerText = `${renderPercent}%`;
  showToast('渲染任務已推送到背景執行。您可繼續在工作空間內編輯。');
}

function simulateBrowse() {
  showToast('模擬系統對話框：輸出路徑保持為 C:/Projects/Slopeffect/Exports/');
}

// ==========================================================================
// Toast Notifications
// ==========================================================================
let toastTimeout = null;

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast-message');
  toast.querySelector('.message').innerText = message;
  toast.style.display = 'flex';
  
  if (toastTimeout) clearTimeout(toastTimeout);
  
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function simulateCommand(cmdType) {
  if (cmdType === 'project.save') {
    showToast('💾 專案已存檔！ slopeproj 狀態對齊 Rust Backend.');
  } else if (cmdType === 'project.create') {
    showToast('📄 新增空專案成功！ ticks 重置為 0.');
    skipToStart();
  } else if (cmdType === 'project.open') {
    showToast('📂 開啟專案對話框 (Simulated)...');
  } else {
    showToast(`發送 Command DTO: ${cmdType} 傳送至 Tauri IPC`);
  }
}

// ==========================================================================
// Scene Switcher & Creator Controllers (Interactive Mockup Support)
// ==========================================================================

function renderSceneSwitcher() {
  const selectEl = document.getElementById('active-scene-select');
  if (!selectEl) return;
  
  selectEl.innerHTML = '';
  Object.values(state.scenes).forEach(scene => {
    const opt = document.createElement('option');
    opt.value = scene.id;
    opt.innerText = `${scene.name} (${scene.width}x${scene.height})`;
    if (scene.id === state.currentSceneId) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });
}

function switchScene(sceneId) {
  const scene = state.scenes[sceneId];
  if (!scene) return;
  
  state.currentSceneId = sceneId;
  renderSceneSwitcher();
  
  // Sync Preview monitor visual dimensions
  const videoScreen = document.getElementById('video-screen');
  const ratio = scene.width / scene.height;
  
  // Update UI and trigger toast
  showToast(`已切換至場景「${scene.name}」(${scene.width}x${scene.height} Ticks吸附中)`);
  
  // Simulate active scene dimensions by updating visual scale container
  if (ratio > 1) {
    videoScreen.style.aspectRatio = '16/9';
  } else if (ratio === 1) {
    videoScreen.style.aspectRatio = '1/1';
  } else {
    videoScreen.style.aspectRatio = '9/16'; // Social media portrait
  }
  
  // Change resolution label in header
  document.querySelector('.zoom-indicator').innerText = `${scene.width}x${scene.height} | 50%`;
}

function openAddSceneModal() {
  document.getElementById('add-scene-dialog').style.display = 'flex';
  
  // Reset values
  document.getElementById('new-scene-name').value = `Scene ${Object.keys(state.scenes).length + 1}`;
  document.getElementById('new-scene-width').value = '1920';
  document.getElementById('new-scene-height').value = '1080';
}

function closeAddSceneModal() {
  document.getElementById('add-scene-dialog').style.display = 'none';
}

function createNewScene() {
  const name = document.getElementById('new-scene-name').value.trim();
  const width = parseInt(document.getElementById('new-scene-width').value) || 1920;
  const height = parseInt(document.getElementById('new-scene-height').value) || 1080;
  
  if (!name) {
    showToast('請輸入場景名稱');
    return;
  }
  
  const id = `scene-${UuidSimulate()}`;
  
  // Register in memory DB
  state.scenes[id] = { id, name, width, height };
  
  closeAddSceneModal();
  switchScene(id);
  
  // Log Tauri command trigger simulation
  showToast(`Tauri IPC 觸發: add_scene { name: "${name}", width: ${width}, height: ${height} }`);
}

// Simple local generator helper
function UuidSimulate() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}

