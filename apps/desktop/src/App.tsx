import React, { useState, useEffect, useRef } from 'react';
import {
  MousePointer,
  Scissors,
  FoldHorizontal,
  Hand,
  Square,
  Undo2,
  Redo2,
  PlusCircle,
  FolderOpen,
  Plus,
  Monitor,
  Sliders as SlidersIcon,
  RotateCcw,
  Diamond,
  Info,
  Trash2,
  Magnet,
  ChevronsLeft,
  ChevronLeft,
  Play,
  Pause,
  ChevronRight,
  ChevronsRight,
  Volume2,
  Volume1,
  VolumeX,
  Volume,
  ZoomOut,
  ZoomIn,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Mic,
  Triangle,
  UploadCloud,
  X,
  Folder,
  Link as LinkIcon,
  Loader2
} from 'lucide-react';
import { useEditorStore, evaluatePropertyAtTime } from './store/editorStore';
import type { Clip, Keyframe } from './types/editor';
import { safeInvoke } from './services/tauriIpc';

const TICKS_PER_SECOND = 1000000000;
const FPS = 30;
const TICKS_PER_FRAME = TICKS_PER_SECOND / FPS;

interface VideoPreviewElementProps {
  src: string;
  playheadTimeSeconds: number;
}

const VideoPreviewElement: React.FC<VideoPreviewElementProps> = ({ src, playheadTimeSeconds }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Math.abs(video.currentTime - playheadTimeSeconds) > 0.05) {
      video.currentTime = playheadTimeSeconds;
    }
  }, [playheadTimeSeconds]);

  return (
    <video
      ref={videoRef}
      src={src}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      muted
      playsInline
    />
  );
};

export default function App() {
  const store = useEditorStore();
  
  // Local UI states
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAddSceneDialog, setShowAddSceneDialog] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  
  // Graph Editor states
  const [showGraphEditor, setShowGraphEditor] = useState(false);
  const [graphProperty, setGraphProperty] = useState<Keyframe['property']>('posX');
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [activeHandleKfId, setActiveHandleKfId] = useState<string | null>(null);
  const [activeHandleType, setActiveHandleType] = useState<'handleOut' | 'handleIn' | null>(null);

  // Scene inputs
  const [newSceneName, setNewSceneName] = useState('Scene 2');
  const [newSceneWidth, setNewSceneWidth] = useState(1920);
  const [newSceneHeight, setNewSceneHeight] = useState(1080);
  
  // Export inputs & progress
  const [exportFilename, setExportFilename] = useState('my_awesome_edit_v1');
  const [exportPreset, setExportPreset] = useState('YouTube Full HD 1080p (Fast H.264)');
  const [exportBitrate, setExportBitrate] = useState(12);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportElapsedTime, setExportElapsedTime] = useState('00:00:00');
  const [exportRemainingTime, setExportRemainingTime] = useState('--:--:--');
  const [exportPhase, setExportPhase] = useState('無啟用任務');
  const [isBgExporting, setIsBgExporting] = useState(false);
  
  // References for dragging
  const rulerRef = useRef<HTMLDivElement>(null);
  const transformBoxRef = useRef<HTMLDivElement>(null);
  const trackWrapperRef = useRef<HTMLDivElement>(null);
  
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingTransform, setIsDraggingTransform] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [dragClipOffset, setDragClipOffset] = useState(0);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [transformDragStart, setTransformDragStart] = useState({ x: 0, y: 0 });
  
  // Playback timer ref
  const playIntervalRef = useRef<any>(null);

  // Active clip
  const activeClip = store.selectedClipId ? store.clips[store.selectedClipId] : null;

  // Active clip asset properties for dynamic bounding box calculation
  const activeAsset = activeClip ? store.assets.find(a => a.id === activeClip.assetId) : null;
  let assetWidth = 1920;
  let assetHeight = 1080;
  if (activeAsset) {
    const match = activeAsset.size.match(/^(\d+)x(\d+)$/);
    if (match) {
      assetWidth = parseInt(match[1]);
      assetHeight = parseInt(match[2]);
    } else if (activeAsset.type === 'svg') {
      assetWidth = 400;
      assetHeight = 400;
    }
  }
  const scene = store.scenes[store.currentSceneId] || { width: 1920, height: 1080 };
  const overlayWidthPct = activeClip ? (assetWidth / scene.width) * 100 : 40;
  const overlayHeightPct = activeClip ? (assetHeight / scene.height) * 100 : 50;

  // Toast notification
  const triggerToast = (msg: string, duration = 3000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };

  // Playback loop simulation
  useEffect(() => {
    if (store.isPlaying) {
      const startTime = Date.now();
      const startTicks = store.currentTimeTicks;
      
      playIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const currentTicks = startTicks + (elapsed * 1000000); // 1ms = 1,000,000 ticks
        
        if (currentTicks >= 15000000000) {
          store.setCurrentTimeTicks(0);
        } else {
          store.setCurrentTimeTicks(currentTicks);
        }
      }, 1000 / FPS);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [store.isPlaying]);

  // Parenting transform cascading solver
  const getChainedTransform = (clip: Clip, timeTicks: number) => {
    const localPosX = clip.keyframes.position ? evaluatePropertyAtTime(clip, 'posX', timeTicks) : clip.transform.posX;
    const localPosY = clip.keyframes.position ? evaluatePropertyAtTime(clip, 'posY', timeTicks) : clip.transform.posY;
    const localScaleX = clip.keyframes.scale ? evaluatePropertyAtTime(clip, 'scaleX', timeTicks) : clip.transform.scaleX;
    const localScaleY = clip.keyframes.scale ? evaluatePropertyAtTime(clip, 'scaleY', timeTicks) : clip.transform.scaleY;
    const localRotation = clip.keyframes.rotation ? evaluatePropertyAtTime(clip, 'rotation', timeTicks) : clip.transform.rotation;
    const localOpacity = clip.keyframes.opacity ? evaluatePropertyAtTime(clip, 'opacity', timeTicks) : clip.transform.opacity;

    if (!clip.parentClipId) {
      return {
        posX: localPosX,
        posY: localPosY,
        scaleX: localScaleX,
        scaleY: localScaleY,
        rotation: localRotation,
        opacity: localOpacity
      };
    }

    const visited = new Set<string>();
    visited.add(clip.id);

    const getParentChain = (c: Clip): {
      posX: number;
      posY: number;
      scaleX: number;
      scaleY: number;
      rotation: number;
      opacity: number;
    } => {
      if (visited.has(c.id)) {
        const lx = c.keyframes.position ? evaluatePropertyAtTime(c, 'posX', timeTicks) : c.transform.posX;
        const ly = c.keyframes.position ? evaluatePropertyAtTime(c, 'posY', timeTicks) : c.transform.posY;
        const sx = c.keyframes.scale ? evaluatePropertyAtTime(c, 'scaleX', timeTicks) : c.transform.scaleX;
        const sy = c.keyframes.scale ? evaluatePropertyAtTime(c, 'scaleY', timeTicks) : c.transform.scaleY;
        const rot = c.keyframes.rotation ? evaluatePropertyAtTime(c, 'rotation', timeTicks) : c.transform.rotation;
        const op = c.keyframes.opacity ? evaluatePropertyAtTime(c, 'opacity', timeTicks) : c.transform.opacity;
        return { posX: lx, posY: ly, scaleX: sx, scaleY: sy, rotation: rot, opacity: op };
      }
      visited.add(c.id);

      const lX = c.keyframes.position ? evaluatePropertyAtTime(c, 'posX', timeTicks) : c.transform.posX;
      const lY = c.keyframes.position ? evaluatePropertyAtTime(c, 'posY', timeTicks) : c.transform.posY;
      const sX = c.keyframes.scale ? evaluatePropertyAtTime(c, 'scaleX', timeTicks) : c.transform.scaleX;
      const sY = c.keyframes.scale ? evaluatePropertyAtTime(c, 'scaleY', timeTicks) : c.transform.scaleY;
      const rot = c.keyframes.rotation ? evaluatePropertyAtTime(c, 'rotation', timeTicks) : c.transform.rotation;
      const op = c.keyframes.opacity ? evaluatePropertyAtTime(c, 'opacity', timeTicks) : c.transform.opacity;

      if (!c.parentClipId || !store.clips[c.parentClipId]) {
        return { posX: lX, posY: lY, scaleX: sX, scaleY: sY, rotation: rot, opacity: op };
      }

      const pTrans = getParentChain(store.clips[c.parentClipId]);

      // Cascade formulas
      const finalScaleX = (sX / 100) * pTrans.scaleX;
      const finalScaleY = (sY / 100) * pTrans.scaleY;
      const finalRotation = rot + pTrans.rotation;
      const finalOpacity = (op / 100) * pTrans.opacity;

      // Project offset trigonometrically relative to parent's scale & rotation space
      const rad = pTrans.rotation * (Math.PI / 180);
      const scaledOffsetX = lX * (pTrans.scaleX / 100);
      const scaledOffsetY = lY * (pTrans.scaleY / 100);

      const rotatedOffsetX = scaledOffsetX * Math.cos(rad) - scaledOffsetY * Math.sin(rad);
      const rotatedOffsetY = scaledOffsetX * Math.sin(rad) + scaledOffsetY * Math.cos(rad);

      return {
        posX: pTrans.posX + rotatedOffsetX,
        posY: pTrans.posY + rotatedOffsetY,
        scaleX: finalScaleX,
        scaleY: finalScaleY,
        rotation: finalRotation,
        opacity: finalOpacity
      };
    };

    return getParentChain(clip);
  };

  // CSS Filter generator for applied multi-effects stack
  const getFilterString = (clip: Clip): string => {
    if (!clip.effects || clip.effects.length === 0) return 'none';
    return clip.effects
      .filter(fx => fx.enabled)
      .map(fx => {
        const p = fx.params;
        switch (fx.type) {
          case 'blur':
            return `blur(${p.radius ?? 5}px)`;
          case 'brightness':
            return `brightness(${p.amount ?? 100}%)`;
          case 'contrast':
            return `contrast(${p.amount ?? 100}%)`;
          case 'grayscale':
            return `grayscale(${p.amount ?? 100}%)`;
          case 'sepia':
            return `sepia(${p.amount ?? 100}%)`;
          case 'hueRotate':
            return `hue-rotate(${p.angle ?? 90}deg)`;
          case 'saturate':
            return `saturate(${p.amount ?? 100}%)`;
          case 'invert':
            return `invert(${p.amount ?? 100}%)`;
          case 'dropShadow':
            return `drop-shadow(${p.offsetX ?? 5}px ${p.offsetY ?? 5}px ${p.radius ?? 5}px rgba(0,0,0,0.5))`;
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join(' ') || 'none';
  };

  // Global mouse handlers for scrubbing, dragging, and Bezier control handles
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPlayhead && rulerRef.current) {
        const rect = rulerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left - 180; // 180px track header offset
        let targetTicks = (clickX / store.timelineZoom) * TICKS_PER_SECOND;
        
        if (targetTicks < 0) targetTicks = 0;
        if (targetTicks > 15000000000) targetTicks = 15000000000;
        
        if (store.isSnapEnabled) {
          const frameIndex = Math.round(targetTicks / TICKS_PER_FRAME);
          targetTicks = frameIndex * TICKS_PER_FRAME;
        }
        store.setCurrentTimeTicks(targetTicks);
      } else if (activeHandleKfId && activeHandleType && activeClip) {
        // Dragging a Bezier curve control handle
        const svgEl = document.getElementById('graph-editor-svg');
        if (svgEl) {
          const rect = svgEl.getBoundingClientRect();
          const mouseXOnSvg = e.clientX - rect.left;
          const mouseYOnSvg = e.clientY - rect.top;
          
          const kfs = (activeClip.keyframeData || []).filter(kf => kf.property === graphProperty);
          const sorted = [...kfs].sort((a, b) => a.timeTicks - b.timeTicks);
          const kfIdx = sorted.findIndex(k => k.id === activeHandleKfId);
          
          if (kfIdx !== -1) {
            if (activeHandleType === 'handleOut' && kfIdx < sorted.length - 1) {
              const prev = sorted[kfIdx];
              const next = sorted[kfIdx + 1];
              
              const prevX = (prev.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
              const nextX = (next.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
              const dx = nextX - prevX;
              
              const vals = sorted.map(k => k.value);
              const minVal = Math.min(...vals);
              const maxVal = Math.max(...vals);
              const padding = Math.max(20, (maxVal - minVal) * 0.2);
              const yMin = minVal - padding;
              const yMax = maxVal + padding;
              const range = (yMax - yMin) || 1;
              const graphHeight = 220;
              
              const yToVal = (y: number) => {
                const ratio = (graphHeight - 20 - y) / (graphHeight - 40);
                return yMin + ratio * range;
              };
              
              const rx = (mouseXOnSvg - prevX) / dx;
              const mouseVal = yToVal(mouseYOnSvg);
              const ry = (mouseVal - prev.value) / (next.value - prev.value || 1);
              
              const currentIn = next.handleIn || { x: 0.66, y: 1 };
              const clampedX = Math.max(0.01, Math.min(currentIn.x - 0.01, rx));
              const clampedY = Math.max(0, Math.min(1, ry));
              
              store.updateKeyframeHandles(activeClip.id, prev.id, { x: clampedX, y: clampedY }, currentIn);
            } else if (activeHandleType === 'handleIn' && kfIdx > 0) {
              const prev = sorted[kfIdx - 1];
              const next = sorted[kfIdx];
              
              const prevX = (prev.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
              const nextX = (next.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
              const dx = nextX - prevX;
              
              const vals = sorted.map(k => k.value);
              const minVal = Math.min(...vals);
              const maxVal = Math.max(...vals);
              const padding = Math.max(20, (maxVal - minVal) * 0.2);
              const yMin = minVal - padding;
              const yMax = maxVal + padding;
              const range = (yMax - yMin) || 1;
              const graphHeight = 220;
              
              const yToVal = (y: number) => {
                const ratio = (graphHeight - 20 - y) / (graphHeight - 40);
                return yMin + ratio * range;
              };
              
              const rx = (mouseXOnSvg - prevX) / dx;
              const mouseVal = yToVal(mouseYOnSvg);
              const ry = (mouseVal - prev.value) / (next.value - prev.value || 1);
              
              const currentOut = prev.handleOut || { x: 0.33, y: 0 };
              const clampedX = Math.max(currentOut.x + 0.01, Math.min(0.99, rx));
              const clampedY = Math.max(0, Math.min(1, ry));
              
              store.updateKeyframeHandles(activeClip.id, next.id, currentOut, { x: clampedX, y: clampedY });
            }
          }
        }
      } else if (isDraggingTransform && activeClip && activeClip.transform) {
        const deltaX = e.clientX - transformDragStart.x;
        const deltaY = e.clientY - transformDragStart.y;
        
        const nextX = Math.round(activeClip.transform.posX + deltaX * 2);
        const nextY = Math.round(activeClip.transform.posY + deltaY * 2);
        
        store.updateClipTransform(activeClip.id, { posX: nextX, posY: nextY });
        setTransformDragStart({ x: e.clientX, y: e.clientY });
      } else if (activeHandle && activeClip && activeClip.transform) {
        const videoScreen = document.getElementById('video-screen');
        if (videoScreen) {
          const rect = videoScreen.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          if (activeHandle === 'rotate') {
            const rad = Math.atan2(e.clientX - centerX, -(e.clientY - centerY));
            const deg = Math.round(rad * (180 / Math.PI));
            store.updateClipTransform(activeClip.id, { rotation: deg });
          } else if (activeHandle === 'anchor') {
            const bbox = transformBoxRef.current?.getBoundingClientRect();
            if (bbox) {
              const localX = e.clientX - bbox.left;
              const localY = e.clientY - bbox.top;
              const anchorXVal = localX / bbox.width;
              const anchorYVal = localY / bbox.height;
              store.updateClipTransform(activeClip.id, {
                anchorX: Math.max(0, Math.min(1, anchorXVal)),
                anchorY: Math.max(0, Math.min(1, anchorYVal))
              });
            }
          } else {
            // scale dragging based on distance from center in local coordinate space (incorporates absolute parent rotation)
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            
            const chained = getChainedTransform(activeClip, store.currentTimeTicks);
            const rad = -chained.rotation * (Math.PI / 180);
            
            const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
            const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
            const distX = Math.abs(localX);
            const distY = Math.abs(localY);
            
            const originalHalfWidth = (rect.width * (overlayWidthPct / 100) / 2) || 1;
            const originalHalfHeight = (rect.height * (overlayHeightPct / 100) / 2) || 1;
            
            const scaleXVal = Math.round((distX / originalHalfWidth) * 100);
            const scaleYVal = Math.round((distY / originalHalfHeight) * 100);
            
            store.updateClipTransform(activeClip.id, {
              scaleX: Math.max(10, Math.min(200, scaleXVal)),
              scaleY: Math.max(10, Math.min(200, scaleYVal))
            });
          }
        }
      } else if (isDraggingClip && activeClip) {
        // 1. 水平拖曳：更新選中 clip 的播放起點時間 ticks
        const trackContent = document.querySelector('.track-content');
        if (trackContent) {
          const rect = trackContent.getBoundingClientRect();
          const cursorXOnTrack = e.clientX - rect.left - 180;
          let targetX = cursorXOnTrack - dragClipOffset;
          let targetTicks = (targetX / store.timelineZoom) * TICKS_PER_SECOND;
          
          if (targetTicks < 0) targetTicks = 0;
          if (store.isSnapEnabled) {
            const snapInterval = TICKS_PER_SECOND * 0.5;
            targetTicks = Math.round(targetTicks / snapInterval) * snapInterval;
          }
          
          store.clips[activeClip.id].startTicks = targetTicks;
        }

        // 2. 垂直拖曳：更換軌道 (trackId)
        const tracksWrapper = document.getElementById('tracks-wrapper');
        if (tracksWrapper) {
          const tracksRect = tracksWrapper.getBoundingClientRect();
          const relativeY = e.clientY - tracksRect.top;
          
          const sortedTracks = Object.entries(store.tracks)
            .sort(([, a], [, b]) => a.order - b.order);
            
          const trackIndex = Math.max(0, Math.min(sortedTracks.length - 1, Math.floor(relativeY / 60)));
          const targetTrackId = sortedTracks[trackIndex][0];
          const targetTrack = sortedTracks[trackIndex][1];
          
          const clipType = activeClip.type;
          const isAudioTrack = targetTrack.type === 'audio';
          const isAudioClip = clipType === 'audio';
          
          // 音訊片段只能去音訊軌，視訊/SVG只能去視訊軌
          if (isAudioTrack === isAudioClip) {
            store.clips[activeClip.id].trackId = targetTrackId;
          }
        }
        
        // 3. 標記變更為未存檔並更新狀態
        useEditorStore.setState({ 
          clips: { ...store.clips },
          isSaved: false
        });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
      setIsDraggingTransform(false);
      setIsDraggingClip(false);
      setActiveHandle(null);
      setActiveHandleKfId(null);
      setActiveHandleType(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, isDraggingTransform, isDraggingClip, activeHandle, transformDragStart, activeClip, store.timelineZoom, store.isSnapEnabled, activeHandleKfId, activeHandleType, graphProperty]);

  // Global Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        store.undo();
        triggerToast('已復原 (Undo) 上一次的操作');
        e.preventDefault();
      } else if (e.ctrlKey && e.key === 'y') {
        store.redo();
        triggerToast('已重做 (Redo) 動作');
        e.preventDefault();
      } else if (e.key === 's' || e.key === 'S') {
        store.splitClip();
        triggerToast('片段已成功於播放頭位置切割');
      } else if (e.key === 'Delete') {
        store.deleteClip();
        triggerToast('片段已從時間軸刪除');
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  // Helper for ticks formatting
  const ticksToTimecode = (ticks: number) => {
    const totalSeconds = Math.floor(ticks / TICKS_PER_SECOND);
    const remainingTicks = ticks % TICKS_PER_SECOND;
    const frame = Math.floor(remainingTicks / TICKS_PER_FRAME);
    
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)};${pad(frame)}`;
  };

  // Rendering ruler marks
  const renderRulerTicks = () => {
    const ticks = [];
    const zoomScale = store.timelineZoom;
    for (let s = 0; s <= 12; s++) {
      const pos = s * zoomScale;
      ticks.push(
        <React.Fragment key={`sec-${s}`}>
          <div className="tick-mark major" style={{ left: `${pos}px` }}></div>
          <div className="tick-label" style={{ left: `${pos}px` }}>
            {ticksToTimecode(s * TICKS_PER_SECOND)}
          </div>
        </React.Fragment>
      );
      
      for (let f = 5; f < 30; f += 5) {
        const fPos = (s + f / 30) * zoomScale;
        ticks.push(
          <div key={`frame-${s}-${f}`} className="tick-mark" style={{ left: `${fPos}px` }}></div>
        );
      }
    }
    return ticks;
  };

  // Import Asset action
  const handleImportPredefined = (assetId: string, name: string, type: any, size: string, duration: string) => {
    store.importAsset({ id: assetId, name, type, size, duration, format: type.toUpperCase() });
    
    const durationSeconds = parseFloat(duration) || 10;
    const durationTicks = Math.round(durationSeconds * TICKS_PER_SECOND);
    
    if (type === 'video') {
      const videoClipId = `clip-video-${assetId}`;
      const videoClip: Clip = {
        id: videoClipId,
        name: `${name} (視訊)`,
        type: 'video',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'v1',
        transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      
      const audioClipId = `clip-audio-${assetId}`;
      const audioClip: Clip = {
        id: audioClipId,
        name: `${name} (音訊)`,
        type: 'audio',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'a1',
        transform: { posX: 0, posY: 0, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      
      useEditorStore.setState({
        clips: {
          ...store.clips,
          [videoClipId]: videoClip,
          [audioClipId]: audioClip
        },
        selectedClipId: videoClipId
      });
      triggerToast(`已成功將影片「${name}」自動分離並加入 V1 視訊軌與 A1 音訊軌！`);
    } else if (type === 'audio') {
      const audioClipId = `clip-audio-${assetId}`;
      const audioClip: Clip = {
        id: audioClipId,
        name: name,
        type: 'audio',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'a1',
        transform: { posX: 0, posY: 0, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      useEditorStore.setState({
        clips: {
          ...store.clips,
          [audioClipId]: audioClip
        },
        selectedClipId: audioClipId
      });
      triggerToast(`已成功將音訊「${name}」加入 A1 音訊軌！`);
    } else if (type === 'svg') {
      const svgClipId = `clip-svg-${assetId}`;
      const svgClip: Clip = {
        id: svgClipId,
        name: name,
        type: 'svg',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'v2',
        transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 75, scaleY: 75, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      useEditorStore.setState({
        clips: {
          ...store.clips,
          [svgClipId]: svgClip
        },
        selectedClipId: svgClipId
      });
      triggerToast(`已成功將向量圖「${name}」加入 V2 向量軌！`);
    }

    setShowImportDialog(false);
  };

  // Custom local file probing
  const handleCustomFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');
    const isSvg = file.name.endsWith('.svg');
    const type = isVideo ? 'video' : isAudio ? 'audio' : isSvg ? 'svg' : 'image';

    triggerToast(`正在分析素材「${file.name}」的中介資料...`);

    let metadata: any = null;
    try {
      metadata = await safeInvoke<any>('probe_media_file', { path: file.name });
    } catch (err) {
      console.warn("Probe failed, fallback to simulation", err);
    }

    if (!metadata) {
      const isVid = type === 'video';
      metadata = {
        formatName: file.type || 'mp4',
        durationSeconds: isVid ? 12.4 : 8.5,
        width: isVid ? 1920 : undefined,
        height: isVid ? 1080 : undefined,
        fps: isVid ? 30.0 : undefined,
        sampleRate: isVid ? 48000 : 44100,
        channels: 2
      };
    }

    const durationStr = `${metadata.durationSeconds.toFixed(1)}s`;
    const sizeStr = type === 'video' ? `${metadata.width}x${metadata.height}` : type === 'audio' ? `${metadata.sampleRate.toLocaleString()}Hz` : 'Vector';

    const assetId = `asset-${Math.random().toString(36).substring(2, 11)}`;
    const blobUrl = type === 'video' || type === 'audio' || type === 'image' ? URL.createObjectURL(file) : undefined;

    store.importAsset({
      id: assetId,
      name: file.name,
      type: type as any,
      size: sizeStr,
      duration: durationStr,
      format: type.toUpperCase(),
      blobUrl
    });

    const durationTicks = Math.round(metadata.durationSeconds * TICKS_PER_SECOND);

    if (type === 'video') {
      const videoClipId = `clip-video-${assetId}`;
      const videoClip: Clip = {
        id: videoClipId,
        name: `${file.name} (視訊)`,
        type: 'video',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'v1',
        transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      
      const audioClipId = `clip-audio-${assetId}`;
      const audioClip: Clip = {
        id: audioClipId,
        name: `${file.name} (音訊)`,
        type: 'audio',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'a1',
        transform: { posX: 0, posY: 0, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      
      useEditorStore.setState({
        clips: {
          ...store.clips,
          [videoClipId]: videoClip,
          [audioClipId]: audioClip
        },
        selectedClipId: videoClipId
      });
      triggerToast(`已成功將影片「${file.name}」自動分離並加入 V1 視訊軌與 A1 音訊軌！`);
    } else if (type === 'audio') {
      const audioClipId = `clip-audio-${assetId}`;
      const audioClip: Clip = {
        id: audioClipId,
        name: file.name,
        type: 'audio',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'a1',
        transform: { posX: 0, posY: 0, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      useEditorStore.setState({
        clips: {
          ...store.clips,
          [audioClipId]: audioClip
        },
        selectedClipId: audioClipId
      });
      triggerToast(`已成功將音訊「${file.name}」加入 A1 音訊軌！`);
    } else if (type === 'svg') {
      const svgClipId = `clip-svg-${assetId}`;
      const svgClip: Clip = {
        id: svgClipId,
        name: file.name,
        type: 'svg',
        startTicks: store.currentTimeTicks,
        durationTicks,
        assetId: assetId,
        trackId: 'v2',
        transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 75, scaleY: 75, rotation: 0, opacity: 100, blendMode: 'normal' },
        keyframes: { position: false, scale: false, rotation: false, opacity: false },
        keyframeData: [],
        effects: [],
        parentClipId: null,
        enabled: true
      };
      useEditorStore.setState({
        clips: {
          ...store.clips,
          [svgClipId]: svgClip
        },
        selectedClipId: svgClipId
      });
      triggerToast(`已成功將向量圖「${file.name}」加入 V2 向量軌！`);
    }

    setShowImportDialog(false);
  };

  // Add Scene action
  const handleCreateNewScene = () => {
    if (!newSceneName.trim()) {
      triggerToast('請輸入場景名稱');
      return;
    }
    store.addScene(newSceneName, newSceneWidth, newSceneHeight);
    setShowAddSceneDialog(false);
    triggerToast(`已成功切換至新建立場景：${newSceneName}`);
  };

  // Render / Export simulation
  const handleStartRender = () => {
    setIsExporting(true);
    setExportProgress(0);
    let elapsed = 0;
    
    const interval = setInterval(() => {
      elapsed += 0.2;
      setExportProgress((prev) => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(interval);
          setIsExporting(false);
          triggerToast('🎉 影片渲染成功！恭喜！');
          return 100;
        }
        
        if (next <= 10) setExportPhase('正在分析序列 ticks 軌道 (Analyzing)...');
        else if (next <= 45) setExportPhase(`正在渲染 V1 Base Video (影格: ${Math.round(next * 30)} / 3000)`);
        else if (next <= 75) setExportPhase('正在疊加 V2 SVG 向量圖層與 Keyframe 插值...');
        else if (next <= 90) setExportPhase('正在混合 A1 背景音樂音軌 (Audio Mixdown)...');
        else setExportPhase('正在組合 MP4 (H.264 / AAC) 串流 sidecar 儲存...');
        
        return next;
      });
      
      const pad = (n: number) => String(n).padStart(2, '0');
      const rem = Math.max(0, 10 - Math.round(elapsed));
      setExportElapsedTime(`00:00:${pad(Math.floor(elapsed))}`);
      setExportRemainingTime(`00:00:${pad(rem)}`);
    }, 150);
  };

  const handleStartBgRender = () => {
    setIsBgExporting(true);
    setShowExportModal(false);
    triggerToast('渲染任務已推送到背景執行。您可繼續在工作空間內編輯。');
  };

  // Drag select clip offset calc
  const handleClipMouseDown = (clipId: string, e: React.MouseEvent) => {
    store.selectClip(clipId);
    setIsDraggingClip(true);
    const block = document.getElementById(clipId);
    if (block) {
      const rect = block.getBoundingClientRect();
      setDragClipOffset(e.clientX - rect.left);
    }
    e.stopPropagation();
  };

  // Volume icon logic
  const getVolumeIcon = (vol: number) => {
    if (vol === 0) return <VolumeX size={15} />;
    if (vol < 40) return <Volume size={15} />;
    if (vol < 80) return <Volume1 size={15} />;
    return <Volume2 size={15} />;
  };

  // Parenting Candidates Selector logic (prevents circular deadlock loops)
  const getValidParents = (currentClip: Clip) => {
    const ancestors = new Set<string>();
    
    const addAncestors = (cid: string) => {
      const c = store.clips[cid];
      if (c && c.parentClipId) {
        ancestors.add(c.parentClipId);
        addAncestors(c.parentClipId);
      }
    };
    
    addAncestors(currentClip.id);
    
    return Object.values(store.clips).filter(c => {
      if (c.id === currentClip.id) return false;
      if (c.type === 'audio') return false;
      if (ancestors.has(c.id)) return false;
      
      let curr: Clip | null = c;
      while (curr) {
        if (curr.id === currentClip.id) return false;
        curr = curr.parentClipId ? store.clips[curr.parentClipId] : null;
      }
      
      return true;
    });
  };

  // Render Keyframe addition/removal indicator column
  const renderKfIndicator = (prop: Keyframe['property'], currentValue: number) => {
    if (!activeClip) return null;
    const isEnabled = 
      (prop === 'posX' || prop === 'posY') ? activeClip.keyframes.position :
      (prop === 'scaleX' || prop === 'scaleY') ? activeClip.keyframes.scale :
      prop === 'rotation' ? activeClip.keyframes.rotation :
      activeClip.keyframes.opacity;
      
    if (!isEnabled) return null;
    
    const kf = activeClip.keyframeData.find(k => k.property === prop && k.timeTicks === store.currentTimeTicks);
    const exists = !!kf;
    
    return (
      <button
        className={`keyframe-channel-btn ${exists ? 'active' : ''}`}
        style={{
          background: 'none',
          border: 'none',
          color: exists ? '#A855F7' : 'var(--text-dark)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px',
          transition: 'color 0.18s'
        }}
        onClick={() => {
          if (exists && kf) {
            store.removeKeyframe(activeClip.id, kf.id);
            triggerToast(`已移除關鍵影格！`);
          } else {
            store.addKeyframe(activeClip.id, prop, store.currentTimeTicks, currentValue, 'linear');
            triggerToast(`已新增關鍵影格！`);
          }
        }}
        title={exists ? "刪除此處的關鍵影格" : "在此處新增關鍵影格"}
      >
        <Diamond size={11} fill={exists ? "currentColor" : "none"} />
      </button>
    );
  };

  // Rendering Graph Editor SVG content
  const renderGraphEditor = () => {
    if (!activeClip) return (
      <div className="no-selection-placeholder" style={{ height: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Info size={28} />
        <p>請先選擇一個圖層以編輯其動畫曲線</p>
      </div>
    );
    
    const kfs = (activeClip.keyframeData || []).filter(kf => kf.property === graphProperty);
    const sortedKfs = [...kfs].sort((a, b) => a.timeTicks - b.timeTicks);
    
    let minVal = 0;
    let maxVal = 100;
    if (graphProperty === 'posX' || graphProperty === 'posY') {
      minVal = 0;
      maxVal = 1920;
    } else if (graphProperty === 'scaleX' || graphProperty === 'scaleY') {
      minVal = 0;
      maxVal = 150;
    } else if (graphProperty === 'rotation') {
      minVal = -180;
      maxVal = 360;
    } else if (graphProperty === 'opacity') {
      minVal = 0;
      maxVal = 100;
    }

    if (sortedKfs.length > 0) {
      const vals = sortedKfs.map(kf => kf.value);
      minVal = Math.min(...vals);
      maxVal = Math.max(...vals);
    }
    
    const padding = Math.max(20, (maxVal - minVal) * 0.2);
    const yMin = minVal - padding;
    const yMax = maxVal + padding;
    const range = (yMax - yMin) || 1;
    
    const graphHeight = 220;
    
    const valToY = (val: number) => {
      return graphHeight - 20 - ((val - yMin) / range) * (graphHeight - 40);
    };
    
    const timelineWidth = 12 * store.timelineZoom;
    
    let pathD = '';
    if (sortedKfs.length > 0) {
      const startX = (sortedKfs[0].timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
      const startY = valToY(sortedKfs[0].value);
      pathD = `M ${startX} ${startY}`;
      
      for (let i = 0; i < sortedKfs.length - 1; i++) {
        const prev = sortedKfs[i];
        const next = sortedKfs[i+1];
        
        const prevX = (prev.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
        const prevY = valToY(prev.value);
        
        const nextX = (next.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
        const nextY = valToY(next.value);
        
        const easing = prev.easing || 'linear';
        
        if (easing === 'linear') {
          pathD += ` L ${nextX} ${nextY}`;
        } else if (easing === 'hold') {
          pathD += ` L ${nextX} ${prevY} L ${nextX} ${nextY}`;
        } else {
          const p1 = prev.handleOut || { x: 0.33, y: 0 };
          const p2 = next.handleIn || { x: 0.66, y: 1 };
          
          const cp1x = prevX + p1.x * (nextX - prevX);
          const cp1y = valToY(prev.value + p1.y * (next.value - prev.value));
          
          const cp2x = prevX + p2.x * (nextX - prevX);
          const cp2y = valToY(prev.value + p2.y * (next.value - prev.value));
          
          pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${nextX} ${nextY}`;
        }
      }
    }

    const applyPreset = (preset: 'linear' | 'hold' | 'easyEase') => {
      if (selectedKfId && activeClip) {
        store.setKeyframePreset(activeClip.id, selectedKfId, preset);
        triggerToast(`已套用關鍵影格預設：${preset === 'easyEase' ? 'Easy Ease 平滑緩動 (F9)' : preset === 'hold' ? '暫留 (Hold)' : '線性 (Linear)'}`);
      } else {
        triggerToast('請先在右側曲線圖上選取一個圓點關鍵影格');
      }
    };

    const selectedKf = sortedKfs.find(kf => kf.id === selectedKfId);
    const selectedKfIdx = sortedKfs.findIndex(kf => kf.id === selectedKfId);

    const gridLines = [];
    for (let s = 0; s <= 12; s++) {
      const x = s * store.timelineZoom;
      gridLines.push(
        <line key={`v-grid-${s}`} x1={x} y1={0} x2={x} y2={graphHeight} className="graph-grid-line-bold" />
      );
    }
    const step = range / 4;
    for (let i = 0; i <= 4; i++) {
      const val = yMin + i * step;
      const y = valToY(val);
      gridLines.push(
        <React.Fragment key={`h-grid-${i}`}>
          <line x1={0} y1={y} x2={timelineWidth} y2={y} className="graph-grid-line" />
          <text x={10} y={y - 4} className="graph-grid-label">{Math.round(val)}</text>
        </React.Fragment>
      );
    }

    return (
      <div className="graph-editor-canvas-container" style={{ display: 'flex', flexDirection: 'row', height: `${graphHeight + 40}px` }}>
        {/* Left Sidebar Controller */}
        <div 
          className="graph-left-sidebar" 
          style={{ 
            width: '180px', 
            backgroundColor: 'var(--bg-secondary)', 
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            padding: '12px',
            gap: '12px',
            zIndex: 50,
            boxShadow: '3px 0 8px rgba(0,0,0,0.15)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>編輯屬性頻道</label>
            <select 
              value={graphProperty} 
              onChange={(e) => {
                setGraphProperty(e.target.value as any);
                setSelectedKfId(null);
              }}
              style={{ width: '100%' }}
            >
              <option value="posX">位置 X (Position X)</option>
              <option value="posY">位置 Y (Position Y)</option>
              <option value="scaleX">縮放 X (Scale X)</option>
              <option value="scaleY">縮放 Y (Scale Y)</option>
              <option value="rotation">旋轉角度 (Rotation)</option>
              <option value="opacity">不透明度 (Opacity)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>緩動預設 (F9 / Ease)</label>
            <button 
              className={`graph-preset-btn ${selectedKf?.easing === 'linear' ? 'active' : ''}`}
              onClick={() => applyPreset('linear')}
            >
              線性 📈 (Linear)
            </button>
            <button 
              className={`graph-preset-btn ${selectedKf?.easing === 'hold' ? 'active' : ''}`}
              onClick={() => applyPreset('hold')}
            >
              暫留 ⎵ (Hold)
            </button>
            <button 
              className={`graph-preset-btn ${selectedKf?.easing === 'bezier' ? 'active' : ''}`}
              onClick={() => applyPreset('easyEase')}
              title="平滑緩動 F9 (Easy Ease)"
            >
              平滑 🎢 (Easy Ease F9)
            </button>
          </div>

          <div style={{ marginTop: 'auto', fontSize: '9px', color: 'var(--text-dark)' }}>
            <div>選中關鍵影格:</div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px', whiteSpace: 'pre-line' }}>
              {selectedKf 
                ? `時間: ${(selectedKf.timeTicks / TICKS_PER_SECOND).toFixed(2)}s\n數值: ${Math.round(selectedKf.value)}`
                : '無選擇'}
            </div>
          </div>
        </div>

        {/* Right SVG Area */}
        <div 
          className="graph-svg-area" 
          style={{ 
            flex: 1, 
            position: 'relative', 
            overflowX: 'auto', 
            overflowY: 'hidden', 
            backgroundColor: '#0d0d11' 
          }}
        >
          <svg 
            id="graph-editor-svg"
            width={timelineWidth} 
            height={graphHeight}
            style={{ position: 'absolute', left: 0, top: 0, height: '100%' }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget || (e.target as SVGElement).tagName === 'line') {
                setSelectedKfId(null);
              }
            }}
          >
            {gridLines}
            
            {pathD && (
              <path d={pathD} className="graph-curve-line" />
            )}

            {selectedKf && (
              <>
                {selectedKfIdx < sortedKfs.length - 1 && (selectedKf.easing === 'bezier' || !selectedKf.easing) && (() => {
                  const nextKf = sortedKfs[selectedKfIdx + 1];
                  const dx = (nextKf.timeTicks - selectedKf.timeTicks) / TICKS_PER_SECOND * store.timelineZoom;
                  const hOut = selectedKf.handleOut || { x: 0.33, y: 0 };
                  
                  const kfX = (selectedKf.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
                  const kfY = valToY(selectedKf.value);
                  
                  const cpX = kfX + hOut.x * dx;
                  const cpY = valToY(selectedKf.value + hOut.y * (nextKf.value - selectedKf.value));
                  
                  return (
                    <g key="handle-out-group">
                      <line x1={kfX} y1={kfY} x2={cpX} y2={cpY} className="graph-handle-line" />
                      <circle 
                        cx={cpX} 
                        cy={cpY} 
                        r={5} 
                        className="graph-handle-circle"
                        onMouseDown={(e) => {
                          setActiveHandleKfId(selectedKf.id);
                          setActiveHandleType('handleOut');
                          e.stopPropagation();
                        }}
                      />
                    </g>
                  );
                })()}

                {selectedKfIdx > 0 && (sortedKfs[selectedKfIdx - 1].easing === 'bezier' || !sortedKfs[selectedKfIdx - 1].easing) && (() => {
                  const prevKf = sortedKfs[selectedKfIdx - 1];
                  const dx = (selectedKf.timeTicks - prevKf.timeTicks) / TICKS_PER_SECOND * store.timelineZoom;
                  const hIn = selectedKf.handleIn || { x: 0.66, y: 1 };
                  
                  const kfX = (selectedKf.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
                  const kfY = valToY(selectedKf.value);
                  
                  const cpX = (prevKf.timeTicks / TICKS_PER_SECOND) * store.timelineZoom + hIn.x * dx;
                  const cpY = valToY(prevKf.value + hIn.y * (selectedKf.value - prevKf.value));
                  
                  return (
                    <g key="handle-in-group">
                      <line x1={kfX} y1={kfY} x2={cpX} y2={cpY} className="graph-handle-line" />
                      <circle 
                        cx={cpX} 
                        cy={cpY} 
                        r={5} 
                        className="graph-handle-circle"
                        style={{ fill: '#0dbb9e' }}
                        onMouseDown={(e) => {
                          setActiveHandleKfId(selectedKf.id);
                          setActiveHandleType('handleIn');
                          e.stopPropagation();
                        }}
                      />
                    </g>
                  );
                })()}
              </>
            )}

            {sortedKfs.map(kf => {
              const x = (kf.timeTicks / TICKS_PER_SECOND) * store.timelineZoom;
              const y = valToY(kf.value);
              const isSel = kf.id === selectedKfId;
              return (
                <circle
                  key={kf.id}
                  cx={x}
                  cy={y}
                  r={isSel ? 6 : 4}
                  className={`graph-keyframe-point ${isSel ? 'selected' : ''}`}
                  onClick={(e) => {
                    setSelectedKfId(kf.id);
                    e.stopPropagation();
                  }}
                />
              );
            })}
          </svg>

          {/* Graph Playhead scrub line */}
          <div 
            className="graph-editor-playhead"
            style={{ 
              position: 'absolute', 
              top: 0, 
              bottom: 0, 
              left: `${(store.currentTimeTicks / TICKS_PER_SECOND) * store.timelineZoom}px`,
              width: '1.5px',
              backgroundColor: 'var(--accent-purple)',
              pointerEvents: 'none',
              zIndex: 10,
              boxShadow: '0 0 8px rgba(168, 85, 247, 0.8)'
            }}
          />
        </div>
      </div>
    );
  };

  // Rendering active layered visual clips in Preview monitor
  const renderPreviewClips = () => {
    const activeVisualClips = Object.values(store.clips).filter(
      c => c.enabled && 
      (c.type === 'video' || c.type === 'svg') && 
      store.currentTimeTicks >= c.startTicks && 
      store.currentTimeTicks <= c.startTicks + c.durationTicks
    );

    return activeVisualClips.map(clip => {
      const isSelected = store.selectedClipId === clip.id;
      const track = store.tracks[clip.trackId];
      if (track?.muted) return null;

      const chained = getChainedTransform(clip, store.currentTimeTicks);

      const asset = store.assets.find(a => a.id === clip.assetId);
      let aW = 1920;
      let aH = 1080;
      if (asset) {
        const match = asset.size.match(/^(\d+)x(\d+)$/);
        if (match) {
          aW = parseInt(match[1]);
          aH = parseInt(match[2]);
        } else if (asset.type === 'svg') {
          aW = 400;
          aH = 400;
        }
      }
      const oW = (aW / scene.width) * 100;
      const oH = (aH / scene.height) * 100;

      const tx = ((chained.posX - (scene.width / 2)) / scene.width) * 100;
      const ty = ((chained.posY - (scene.height / 2)) / scene.height) * 100;

      return (
        <div
          key={clip.id}
          className={`transform-overlay ${isSelected ? 'selected' : ''}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${oW * (chained.scaleX / 100)}%`,
            height: `${oH * (chained.scaleY / 100)}%`,
            transform: `translate(-50%, -50%) translate(${tx}%, ${ty}%) rotate(${chained.rotation}deg)`,
            opacity: chained.opacity / 100,
            zIndex: 10 + (10 - (track?.order || 0)),
            pointerEvents: store.activeTool === 'select' ? 'auto' : 'none'
          }}
          onMouseDown={(e) => {
            store.selectClip(clip.id);
            setIsDraggingTransform(true);
            setTransformDragStart({ x: e.clientX, y: e.clientY });
            e.stopPropagation();
          }}
        >
          {isSelected && <div className="transform-border"></div>}
          {isSelected && (
            <>
              <div className="handle handle-tl" onMouseDown={(e) => { setActiveHandle('tl'); e.stopPropagation(); }}></div>
              <div className="handle handle-tr" onMouseDown={(e) => { setActiveHandle('tr'); e.stopPropagation(); }}></div>
              <div className="handle handle-bl" onMouseDown={(e) => { setActiveHandle('bl'); e.stopPropagation(); }}></div>
              <div className="handle handle-br" onMouseDown={(e) => { setActiveHandle('br'); e.stopPropagation(); }}></div>
              <div className="handle handle-rotate" onMouseDown={(e) => { setActiveHandle('rotate'); e.stopPropagation(); }}>
                <div className="rotate-connector"></div>
              </div>
              
              {/* Gold Anchor Crosshair Point (Pan Behind) */}
              <div
                className="handle-anchor"
                style={{
                  left: `${clip.transform.anchorX * 100}%`,
                  top: `${clip.transform.anchorY * 100}%`,
                  position: 'absolute',
                  transform: 'translate(-50%, -50%)',
                  cursor: 'move',
                  zIndex: 30
                }}
                onMouseDown={(e) => {
                  setActiveHandle('anchor');
                  e.stopPropagation();
                }}
                title="錨點 (Anchor Point) — 按住拖曳更新軸心"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#FBBF24" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
              </div>
            </>
          )}
          
          <div 
            className="transform-content"
            style={{ 
              width: '100%', 
              height: '100%',
              transformOrigin: `${clip.transform.anchorX * 100}% ${clip.transform.anchorY * 100}%`,
              filter: getFilterString(clip)
            }}
          >
            {clip.type === 'svg' ? (
              <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ mixBlendMode: clip.transform.blendMode as any }}>
                <polygon points="50,15 90,85 10,85" fill="none" stroke="#6366F1" strokeWidth="6"/>
                <circle cx="50" cy="55" r="18" fill="none" stroke="#A855F7" strokeWidth="4"/>
              </svg>
            ) : clip.type === 'video' ? (
              asset?.blobUrl ? (
                <div style={{ width: '100%', height: '100%', mixBlendMode: clip.transform.blendMode as any }}>
                  <VideoPreviewElement 
                    src={asset.blobUrl} 
                    playheadTimeSeconds={(store.currentTimeTicks - clip.startTicks) / TICKS_PER_SECOND} 
                  />
                </div>
              ) : (
                <div 
                  className="shape-element" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    mixBlendMode: clip.transform.blendMode as any,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '11px',
                    gap: '6px',
                    padding: '12px',
                    textAlign: 'center',
                    border: '1px dashed rgba(255,255,255,0.25)'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                    <line x1="7" y1="2" x2="7" y2="22"/>
                    <line x1="17" y1="2" x2="17" y2="22"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <line x1="2" y1="7" x2="7" y2="7"/>
                    <line x1="2" y1="17" x2="7" y2="17"/>
                    <line x1="17" y1="17" x2="22" y2="17"/>
                    <line x1="17" y1="7" x2="22" y2="7"/>
                  </svg>
                  <span style={{ fontWeight: 500, maxWidth: '90%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {clip.name}
                  </span>
                  <span style={{ fontSize: '9px', opacity: 0.5 }}>離線/待載入媒體預覽</span>
                </div>
              )
            ) : (
              <div className="shape-element" style={{ width: '100%', height: '100%', mixBlendMode: clip.transform.blendMode as any }}></div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="app-shell">
      {/* Top Bar / App Menu & Toolbar */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon"></div>
            <span>Slopeffect <span className="logo-badge">PRO</span></span>
          </div>
          <nav className="app-menu">
            <ul>
              <li className="menu-item active">檔案 (F)
                <ul className="dropdown">
                  <li onClick={() => {
                    store.createNewProject();
                    triggerToast('📄 已成功新增並重置空白專案！');
                  }}>新增專案 (.slopeproj)</li>
                  <li onClick={async () => {
                    triggerToast('📂 正在開啟檔案對話框...');
                    const path = await safeInvoke<string | null>('pick_open_file_path');
                    if (path) {
                      await store.loadProject(path);
                      triggerToast(`📂 成功載入專案：${path.split(/[/\\]/).pop()}`);
                    } else {
                      triggerToast('已取消開啟檔案');
                    }
                  }}>開啟專案...</li>
                  <li className="divider"></li>
                  <li onClick={async () => {
                    let path = store.projectFilePath;
                    if (!path) {
                      triggerToast('💾 正在選擇專案儲存路徑...');
                      path = await safeInvoke<string | null>('pick_save_file_path');
                    }
                    if (path) {
                      await store.saveProject(path);
                      triggerToast(`💾 專案已儲存成功！`);
                    } else {
                      triggerToast('已取消儲存檔案');
                    }
                  }}>儲存專案</li>
                  <li onClick={async () => {
                    triggerToast('💾 正在選擇另存路徑...');
                    const path = await safeInvoke<string | null>('pick_save_file_path');
                    if (path) {
                      await store.saveProject(path);
                      triggerToast(`💾 專案已成功另存新檔！`);
                    } else {
                      triggerToast('已取消另存新檔');
                    }
                  }}>另存新檔...</li>
                </ul>
              </li>
              <li className="menu-item">編輯 (E)
                <ul className="dropdown">
                  <li className={store.undoStack.length === 0 ? 'disabled' : ''} onClick={() => store.undo()}>復原 (Undo) <span className="shortcut">Ctrl+Z</span></li>
                  <li className={store.redoStack.length === 0 ? 'disabled' : ''} onClick={() => store.redo()}>重做 (Redo) <span className="shortcut">Ctrl+Y</span></li>
                  <li className="divider"></li>
                  <li onClick={() => store.splitClip()}>切割片段 <span className="shortcut">S</span></li>
                  <li onClick={() => store.deleteClip()}>刪除選取 <span className="shortcut">Del</span></li>
                </ul>
              </li>
              <li className="menu-item">圖層 (L)
                <ul className="dropdown">
                  <li onClick={() => triggerToast('已註冊新增圖形圖層命令')}>新增圖形圖層</li>
                  <li onClick={() => triggerToast('已註冊新增向量 SVG 命令')}>新增向量 SVG</li>
                  <li onClick={() => triggerToast('已註冊新增影像圖層命令')}>新增影像圖層</li>
                </ul>
              </li>
              <li className="menu-item">序列 (S)</li>
              <li className="menu-item">檢視 (V)</li>
              <li className="menu-item highlight" onClick={() => setShowExportModal(true)}>匯出 (X)</li>
            </ul>
          </nav>
        </div>
        
        {/* Center Toolbar */}
        <div className="app-toolbar">
          <button className={`tool-btn ${store.activeTool === 'select' ? 'active' : ''}`} title="選取工具 (V)" onClick={() => store.setActiveTool('select')}>
            <MousePointer size={15} />
          </button>
          <button className={`tool-btn ${store.activeTool === 'razor' ? 'active' : ''}`} title="剃刀切割工具 (C / S)" onClick={() => store.setActiveTool('razor')}>
            <Scissors size={15} />
          </button>
          <button className={`tool-btn ${store.activeTool === 'trim' ? 'active' : ''}`} title="修剪延伸工具 (T)" onClick={() => store.setActiveTool('trim')}>
            <FoldHorizontal size={15} />
          </button>
          <button className={`tool-btn ${store.activeTool === 'hand' ? 'active' : ''}`} title="抓手平移工具 (H)" onClick={() => store.setActiveTool('hand')}>
            <Hand size={15} />
          </button>
          <button className="tool-btn" title="矩形圖形工具 (R)" onClick={() => triggerToast('已在工作空間建立矩形圖形圖層')}>
            <Square size={15} />
          </button>
        </div>

        <div className="header-right">
          <div className="undo-redo-indicators">
            <button className="header-action-btn" onClick={() => store.undo()} title="復原 (Ctrl+Z)" disabled={store.undoStack.length === 0}>
              <Undo2 size={14} />
            </button>
            <button className="header-action-btn" onClick={() => store.redo()} title="重做 (Ctrl+Y)" disabled={store.redoStack.length === 0}>
              <Redo2 size={14} />
            </button>
          </div>
          {/* Scene Switcher Selector */}
          <div className="scene-switcher-container">
            <select value={store.currentSceneId} className="scene-select-header" onChange={(e) => store.switchScene(e.target.value)}>
              {Object.values(store.scenes).map((sc) => (
                <option key={sc.id} value={sc.id}>{sc.name} ({sc.width}x{sc.height})</option>
              ))}
            </select>
            <button className="add-scene-btn" onClick={() => setShowAddSceneDialog(true)} title="新增場景 (SCENE)">
              <PlusCircle size={14} />
            </button>
          </div>
          <div className="project-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="project-name" style={{ color: store.isSaved ? 'var(--text-main)' : 'var(--accent-purple)' }}>
              {store.projectName}{!store.isSaved && ' *'}
            </span>
            <span className="project-status" style={{ fontSize: '10px', color: store.isSaved ? 'var(--text-muted)' : 'var(--accent-purple)' }}>
              {store.isSaved ? '已儲存' : '有未儲存變更'}
            </span>
          </div>
          <button className="export-btn-header" onClick={() => setShowExportModal(true)}>
            <UploadCloud size={14} /> 渲染匯出
          </button>
        </div>
      </header>

      {/* Main Content Panels */}
      <main className="app-workspace">
        {/* Left Panel: Asset Panel */}
        <section className="panel asset-panel">
          <div className="panel-header">
            <h3><FolderOpen size={14} /> 素材庫 (Media Library)</h3>
            <button className="icon-btn-accent" onClick={() => setShowImportDialog(true)} title="匯入媒體檔案"><Plus size={12} /> 匯入</button>
          </div>
          <div className="panel-body">
            <div className="assets-grid">
              {store.assets.map((asset) => (
                <div key={asset.id} className={`asset-card ${activeClip?.assetId === asset.id ? 'selected' : ''}`} draggable>
                  <div className={`asset-thumb ${asset.type}`}>
                    {asset.type === 'video' ? <Monitor size={14} /> : asset.type === 'audio' ? <Mic size={14} /> : <Triangle size={14} />}
                  </div>
                  <div className="asset-info">
                    <span className="asset-name">{asset.name}</span>
                    <span className="asset-meta">{asset.size} | {asset.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Center Panel: Preview Panel */}
        <section className="panel preview-panel">
          <div className="panel-header">
            <h3><Monitor size={14} /> 預覽螢幕 (Preview Monitor)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                className={`icon-btn-accent ${showGuides ? 'active' : ''}`} 
                onClick={() => setShowGuides(!showGuides)}
                style={{ 
                  padding: '2px 8px', 
                  fontSize: '10px', 
                  background: showGuides ? 'var(--primary)' : 'transparent',
                  borderColor: 'var(--border-color)',
                  color: showGuides ? 'white' : 'var(--text-muted)'
                }}
                title="切換安全區域與輔助線 (AE 對標)"
              >
                輔助線: {showGuides ? '開' : '關'}
              </button>
              <span className="zoom-indicator">
                {store.scenes[store.currentSceneId]?.width}x{store.scenes[store.currentSceneId]?.height} | 50%
              </span>
            </div>
          </div>
          <div className="panel-body canvas-container">
            <div
              className="preview-screen"
              id="video-screen"
              style={{
                aspectRatio: (store.scenes[store.currentSceneId]?.width / store.scenes[store.currentSceneId]?.height) > 1 ? '16/9' : (store.scenes[store.currentSceneId]?.width === store.scenes[store.currentSceneId]?.height ? '1/1' : '9/16'),
                backgroundColor: '#000000'
              }}
            >
              <div className="video-bg-layer" id="preview-video-bg" style={{ opacity: 1, backgroundColor: '#000000' }}></div>
              
              {showGuides && (
                <svg className="safe-guides-overlay" style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 20
                }} viewBox="0 0 1920 1080">
                  <rect x="96" y="54" width="1728" height="972" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" strokeDasharray="5,5" />
                  <text x="110" y="80" fill="rgba(255, 255, 255, 0.25)" fontSize="12" fontFamily="monospace">90% Action Safe</text>
                  
                  <rect x="192" y="108" width="1536" height="864" fill="none" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="1" strokeDasharray="3,3" />
                  <text x="206" y="134" fill="rgba(99, 102, 241, 0.35)" fontSize="12" fontFamily="monospace">80% Title Safe</text>
                  
                  <line x1="960" y1="510" x2="960" y2="570" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" />
                  <line x1="930" y1="540" x2="990" y2="540" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" />
                  <circle cx="960" cy="540" r="8" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
                </svg>
              )}
              
              {/* Dynamic layered clips previews */}
              {renderPreviewClips()}
            </div>
          </div>
        </section>

        {/* Right Panel: Inspector Panel */}
        <section className="panel inspector-panel">
          <div className="panel-header">
            <h3><SlidersIcon size={14} /> 屬性面板 (Inspector)</h3>
          </div>
          <div className="panel-body">
            {!activeClip ? (
              <div className="no-selection-placeholder">
                <Info size={32} />
                <p>在時間軸或素材庫上點擊選擇剪輯圖層，以檢視屬性</p>
              </div>
            ) : (
              <div className="inspector-controls">
                <div className="inspector-group">
                  <div className="group-title">圖層資訊 (Layer Info)</div>
                  <div className="form-row">
                    <label>名稱</label>
                    <input
                      type="text"
                      value={activeClip.name}
                      onChange={(e) => store.updateClipName(activeClip.id, e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>啟用</label>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={activeClip.enabled}
                        onChange={(e) => store.updateClipEnabled(activeClip.id, e.target.checked)}
                      />
                      <span className="slider"></span>
                    </div>
                  </div>
                  
                  {/* Parenting Selection dropdown (Sprint 2) */}
                  {activeClip.type !== 'audio' && (
                    <div className="form-row">
                      <label>父級圖層 (Parent)</label>
                      <select
                        value={activeClip.parentClipId || ''}
                        onChange={(e) => {
                          store.setParentClip(activeClip.id, e.target.value || null);
                          triggerToast(e.target.value ? `已成功連結至父級圖層` : `已取消父子級關聯`);
                        }}
                      >
                        <option value="">無父級圖層 (None)</option>
                        {getValidParents(activeClip).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="inspector-group">
                  <div className="group-title">
                    空間變形 (Transform)
                    <button className="group-reset-btn" onClick={() => store.resetTransform(activeClip.id)}>
                      <RotateCcw size={11} />
                    </button>
                  </div>
                  
                  {/* Position */}
                  <div className="property-header">
                    <span className="prop-title">位置 (Position)</span>
                    <button className={`keyframe-btn ${activeClip.keyframes.position ? 'animate-active' : ''}`} onClick={() => store.toggleKeyframe(activeClip.id, 'position')}>
                      <Diamond size={12} />
                    </button>
                  </div>
                  <div className="form-row-multi">
                    <div className="num-input-group" style={{ display: 'flex', alignItems: 'center' }}>
                      <span>X</span>
                      <input
                        type="number"
                        value={activeClip.transform.posX}
                        onChange={(e) => store.updateClipTransform(activeClip.id, { posX: parseInt(e.target.value) || 0 })}
                      />
                      {renderKfIndicator('posX', activeClip.transform.posX)}
                    </div>
                    <div className="num-input-group" style={{ display: 'flex', alignItems: 'center' }}>
                      <span>Y</span>
                      <input
                        type="number"
                        value={activeClip.transform.posY}
                        onChange={(e) => store.updateClipTransform(activeClip.id, { posY: parseInt(e.target.value) || 0 })}
                      />
                      {renderKfIndicator('posY', activeClip.transform.posY)}
                    </div>
                  </div>

                  {/* Scale */}
                  <div className="property-header">
                    <span className="prop-title">空間縮放 (Scale)</span>
                    <button className={`keyframe-btn ${activeClip.keyframes.scale ? 'animate-active' : ''}`} onClick={() => store.toggleKeyframe(activeClip.id, 'scale')}>
                      <Diamond size={12} />
                    </button>
                  </div>
                  <div className="form-row-multi">
                    <div className="num-input-group" style={{ display: 'flex', alignItems: 'center' }}>
                      <span>X</span>
                      <input
                        type="number"
                        value={activeClip.transform.scaleX}
                        onChange={(e) => store.updateClipTransform(activeClip.id, { scaleX: parseInt(e.target.value) || 0 })}
                      />
                      <span style={{ paddingRight: '4px', fontSize: '10px', color: 'var(--text-dark)' }}>%</span>
                      {renderKfIndicator('scaleX', activeClip.transform.scaleX)}
                    </div>
                    <div className="num-input-group" style={{ display: 'flex', alignItems: 'center' }}>
                      <span>Y</span>
                      <input
                        type="number"
                        value={activeClip.transform.scaleY}
                        onChange={(e) => store.updateClipTransform(activeClip.id, { scaleY: parseInt(e.target.value) || 0 })}
                      />
                      <span style={{ paddingRight: '4px', fontSize: '10px', color: 'var(--text-dark)' }}>%</span>
                      {renderKfIndicator('scaleY', activeClip.transform.scaleY)}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="property-header">
                    <span className="prop-title">旋轉角度 (Rotation)</span>
                    <button className={`keyframe-btn ${activeClip.keyframes.rotation ? 'animate-active' : ''}`} onClick={() => store.toggleKeyframe(activeClip.id, 'rotation')}>
                      <Diamond size={12} />
                    </button>
                  </div>
                  <div className="form-row-multi">
                    <div className="num-input-group" style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={activeClip.transform.rotation}
                        onChange={(e) => store.updateClipTransform(activeClip.id, { rotation: parseInt(e.target.value) || 0 })}
                      />
                      <span style={{ paddingRight: '12px' }}>°</span>
                      {renderKfIndicator('rotation', activeClip.transform.rotation)}
                    </div>
                  </div>

                  {/* Opacity */}
                  <div className="property-header">
                    <span className="prop-title">不透明度 (Opacity)</span>
                    <button className={`keyframe-btn ${activeClip.keyframes.opacity ? 'animate-active' : ''}`} onClick={() => store.toggleKeyframe(activeClip.id, 'opacity')}>
                      <Diamond size={12} />
                    </button>
                  </div>
                  <div className="form-row-multi">
                    <div className="num-input-group" style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={activeClip.transform.opacity}
                        onChange={(e) => store.updateClipTransform(activeClip.id, { opacity: parseInt(e.target.value) || 0 })}
                      />
                      <span style={{ paddingRight: '12px' }}>%</span>
                      {renderKfIndicator('opacity', activeClip.transform.opacity)}
                    </div>
                  </div>
                </div>

                <div className="inspector-group">
                  <div className="group-title">混合與合成 (Composition)</div>
                  <div className="form-row">
                    <label>混合模式</label>
                    <select
                      value={activeClip.transform.blendMode}
                      onChange={(e) => store.updateClipTransform(activeClip.id, { blendMode: e.target.value })}
                    >
                      <option value="normal">Normal (正常)</option>
                      <option value="screen">Screen (濾色)</option>
                      <option value="multiply">Multiply (色彩增值)</option>
                      <option value="overlay">Overlay (覆蓋)</option>
                      <option value="lighten">Lighten (變亮)</option>
                    </select>
                  </div>
                </div>

                {/* Effects Stack Component Panel (Sprint 2) */}
                <div className="inspector-group">
                  <div className="group-title">
                    <span>效果特效堆疊 (Effects Stack)</span>
                  </div>
                  <div className="form-row">
                    <label>新增特效</label>
                    <select 
                      value="" 
                      onChange={(e) => {
                        if (e.target.value) {
                          store.addEffect(activeClip.id, e.target.value as any);
                          triggerToast(`已新增 ${e.target.value} 特效！`);
                        }
                      }}
                    >
                      <option value="">-- 選擇效果濾鏡 --</option>
                      <option value="blur">模糊 (Blur)</option>
                      <option value="brightness">亮度 (Brightness)</option>
                      <option value="contrast">對比度 (Contrast)</option>
                      <option value="grayscale">灰階 (Grayscale)</option>
                      <option value="sepia">懷舊 (Sepia)</option>
                      <option value="hueRotate">色相旋轉 (Hue Rotate)</option>
                      <option value="saturate">飽和度 (Saturate)</option>
                      <option value="invert">反相 (Invert)</option>
                      <option value="dropShadow">陰影 (Drop Shadow)</option>
                    </select>
                  </div>

                  <div className="effects-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {(activeClip.effects || []).map(fx => (
                      <div key={fx.id} className="effect-card" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '11px' }}>
                            <input 
                              type="checkbox" 
                              checked={fx.enabled} 
                              onChange={() => store.toggleEffect(activeClip.id, fx.id)} 
                            />
                            <span>{fx.type.toUpperCase()}</span>
                          </div>
                          <button 
                            onClick={() => { store.removeEffect(activeClip.id, fx.id); triggerToast('已刪除特效！'); }}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        
                        {/* Render individual parameters */}
                        {fx.type === 'blur' && (
                          <div className="form-row">
                            <label style={{ fontSize: '10px' }}>半徑 (px)</label>
                            <input 
                              type="range" min="0" max="50" value={fx.params.radius ?? 5} 
                              onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'radius', parseInt(e.target.value))} 
                            />
                            <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.radius ?? 5}</span>
                          </div>
                        )}
                        {(fx.type === 'brightness' || fx.type === 'contrast' || fx.type === 'saturate') && (
                          <div className="form-row">
                            <label style={{ fontSize: '10px' }}>強度 (%)</label>
                            <input 
                              type="range" min="0" max="200" value={fx.params.amount ?? 100} 
                              onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'amount', parseInt(e.target.value))} 
                            />
                            <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.amount ?? 100}</span>
                          </div>
                        )}
                        {(fx.type === 'grayscale' || fx.type === 'sepia' || fx.type === 'invert') && (
                          <div className="form-row">
                            <label style={{ fontSize: '10px' }}>強度 (%)</label>
                            <input 
                              type="range" min="0" max="100" value={fx.params.amount ?? 100} 
                              onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'amount', parseInt(e.target.value))} 
                            />
                            <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.amount ?? 100}</span>
                          </div>
                        )}
                        {fx.type === 'hueRotate' && (
                          <div className="form-row">
                            <label style={{ fontSize: '10px' }}>色相角度 (°)</label>
                            <input 
                              type="range" min="0" max="360" value={fx.params.angle ?? 90} 
                              onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'angle', parseInt(e.target.value))} 
                            />
                            <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.angle ?? 90}</span>
                          </div>
                        )}
                        {fx.type === 'dropShadow' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div className="form-row">
                              <label style={{ fontSize: '10px' }}>偏移 X</label>
                              <input 
                                type="range" min="-50" max="50" value={fx.params.offsetX ?? 5} 
                                onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'offsetX', parseInt(e.target.value))} 
                              />
                              <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.offsetX ?? 5}</span>
                            </div>
                            <div className="form-row">
                              <label style={{ fontSize: '10px' }}>偏移 Y</label>
                              <input 
                                type="range" min="-50" max="50" value={fx.params.offsetY ?? 5} 
                                onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'offsetY', parseInt(e.target.value))} 
                              />
                              <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.offsetY ?? 5}</span>
                            </div>
                            <div className="form-row">
                              <label style={{ fontSize: '10px' }}>半徑</label>
                              <input 
                                type="range" min="0" max="50" value={fx.params.radius ?? 5} 
                                onChange={(e) => store.updateEffectParam(activeClip.id, fx.id, 'radius', parseInt(e.target.value))} 
                              />
                              <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{fx.params.radius ?? 5}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Panel: Timeline Panel */}
      <footer className="panel timeline-panel" id="panel-timeline">
        <div className="timeline-header">
          <div className="timeline-tools">
            <button className="icon-btn" onClick={() => store.splitClip()} title="在播放頭切割選取的片段 (S)"><Scissors size={13} /> 切割</button>
            <button className="icon-btn" onClick={() => store.deleteClip()} title="刪除選取的片段 (Del)"><Trash2 size={13} /> 刪除</button>
            <div className="timeline-divider"></div>
            <button className={`icon-btn ${store.isSnapEnabled ? 'active' : ''}`} onClick={() => store.toggleSnap()} title="吸附對齊網格 (N)">
              <Magnet size={13} /> 網格吸附: <span>{store.isSnapEnabled ? '開' : '關'}</span>
            </button>
            <div className="timeline-divider"></div>
            
            {/* Graph Editor Toggle Button */}
            <button 
              className={`icon-btn ${showGraphEditor ? 'active' : ''}`} 
              onClick={() => {
                setShowGraphEditor(!showGraphEditor);
                triggerToast(showGraphEditor ? '已切換為標準音軌時間軸' : '已切換為高級動畫曲線編輯器 (Graph Editor)');
              }}
              style={{
                background: showGraphEditor ? 'var(--primary-glow)' : 'transparent',
                borderColor: showGraphEditor ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                color: showGraphEditor ? 'var(--text-main)' : 'var(--text-muted)'
              }}
              title="切換進階動畫曲線編輯器 (F9 / Graph Editor)"
            >
              曲線編輯器 (Graph Editor)
            </button>
          </div>

          <div className="timeline-zoom">
            <ZoomOut size={14} onClick={() => store.setTimelineZoom(Math.max(50, store.timelineZoom - 10))} />
            <input
              type="range"
              min="50"
              max="250"
              value={store.timelineZoom}
              className="zoom-slider"
              onChange={(e) => store.setTimelineZoom(parseInt(e.target.value))}
            />
            <ZoomIn size={14} onClick={() => store.setTimelineZoom(Math.min(250, store.timelineZoom + 10))} />
          </div>
        </div>
        
        <div className="timeline-body" id="timeline-body-scroll" ref={trackWrapperRef}>
          {/* Ruler Area */}
          <div className="timeline-ruler" id="timeline-ruler-el" ref={rulerRef} onMouseDown={() => setIsDraggingPlayhead(true)}>
            
            {/* Sticky Playback Controls directly above track headers */}
            <div className="timeline-media-controls">
              <div className="timecode-display-compact">
                <span>{ticksToTimecode(store.currentTimeTicks)}</span>
                <span className="ticks-label-compact">{store.currentTimeTicks.toLocaleString()} ticks</span>
              </div>
              
              <div className="media-controls-compact">
                <button className="control-btn-icon-compact" onClick={() => store.skipToStart()} title="跳至起點"><ChevronsLeft size={12} /></button>
                <button className="control-btn-icon-compact" onClick={() => store.stepBackward()} title="上一格 (←)"><ChevronLeft size={12} /></button>
                <button className="control-btn-icon-compact play-pause-btn-compact" onClick={() => store.setPlaying(!store.isPlaying)} title="播放/暫停 (Space)">
                  {store.isPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button className="control-btn-icon-compact" onClick={() => store.stepForward()} title="下一格 (→)"><ChevronRight size={12} /></button>
                <button className="control-btn-icon-compact" onClick={() => store.skipToEnd()} title="跳至終點"><ChevronsRight size={12} /></button>
              </div>
              
              <div className="volume-slider-container-compact">
                {getVolumeIcon(store.previewVolume)}
                <input
                  type="range"
                  className="volume-slider-compact"
                  min="0"
                  max="100"
                  value={store.previewVolume}
                  onChange={(e) => store.setPreviewVolume(parseInt(e.target.value))}
                  title="預覽音量"
                />
              </div>
            </div>

            <div className="ruler-ticks" id="ruler-ticks-container">
              {renderRulerTicks()}
            </div>
            
            {/* Draggable Playhead */}
            <div
              className="playhead"
              id="timeline-playhead"
              style={{ left: `${(store.currentTimeTicks / TICKS_PER_SECOND) * store.timelineZoom + 180}px` }}
            >
              <div className="playhead-handle"></div>
            </div>
          </div>

          {/* Tracks Container / Graph Editor Canvas */}
          <div className="tracks-container" id="tracks-wrapper">
            {showGraphEditor ? (
              // 1. ADVANCED GRAPH BEZIER EDITOR CANVAS VIEW (Sprint 3)
              renderGraphEditor()
            ) : (
              // 2. STANDARD TIMELINE AUDIO & VIDEO TRACK ROWS VIEW (Original + Sprint 2 expanded properties drawer)
              <>
                {Object.entries(store.tracks)
                  .sort(([, a], [, b]) => a.order - b.order)
                  .map(([trackId, track]) => {
                    const isAudio = track.type === 'audio';
                    const trackClips = Object.values(store.clips).filter(c => c.trackId === trackId);
                    const selectedClipOnTrack = trackClips.find(c => c.id === store.selectedClipId);
                    
                    return (
                      <div key={trackId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <div className="track-row" style={{ opacity: track.muted ? 0.3 : 1 }}>
                          <div className="track-header">
                            <div className="track-title">{track.name}</div>
                            <div className={`track-actions${isAudio ? ' text-btns' : ''}`}>
                              {isAudio ? (
                                <>
                                  <button onClick={() => store.toggleAudioMute(trackId)} className={`badge-btn ${track.muted ? 'active' : ''}`} title="靜音">M</button>
                                  <button onClick={() => store.toggleAudioSolo(trackId)} className={`badge-btn ${track.solo ? 'active' : ''}`} title="獨奏">S</button>
                                </>
                              ) : (
                                <button onClick={() => store.toggleTrackMute(trackId)} title="隱藏軌道">
                                  {track.muted ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                              )}
                              <button onClick={() => store.toggleTrackLock(trackId)} title="鎖定軌道">
                                {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
                              </button>
                            </div>
                          </div>
                          <div className={`track-content${isAudio ? ' audio-track-bg' : ''}`} style={{ pointerEvents: track.locked ? 'none' : 'auto' }}>
                            {trackClips.map(c => (
                              <div
                                key={c.id}
                                className={`clip-block ${isAudio ? 'audio-clip green-gradient' : 'video-clip'} ${!isAudio && trackId === 'v1' ? 'base-clip blue-gradient' : ''} ${!isAudio && trackId !== 'v1' ? 'purple-gradient' : ''} ${store.selectedClipId === c.id ? 'selected' : ''}`}
                                id={c.id}
                                style={{
                                  left: `${(c.startTicks / TICKS_PER_SECOND) * store.timelineZoom}px`,
                                  width: `${(c.durationTicks / TICKS_PER_SECOND) * store.timelineZoom}px`
                                }}
                                onMouseDown={(e) => handleClipMouseDown(c.id, e)}
                              >
                                {isAudio ? <Mic size={14} /> : c.type === 'svg' ? <Triangle size={14} /> : <Monitor size={14} />}
                                <span className="clip-name">{c.name}</span>
                                <span className="clip-duration">{(c.durationTicks / TICKS_PER_SECOND).toFixed(1)}s</span>
                                {isAudio && (
                                  <div className="waveform-svg-overlay">
                                    <svg viewBox="0 0 100 20" preserveAspectRatio="none" width="100%" height="100%">
                                      <path d="M 0 10 Q 5 2, 10 10 Q 15 18, 20 10 Q 25 1, 30 10 Q 35 19, 40 10 Q 45 4, 50 10 Q 55 16, 60 10 Q 65 3, 70 10 Q 75 17, 80 10 Q 85 2, 90 10 Q 95 18, 100 10" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"></path>
                                    </svg>
                                  </div>
                                )}
                                <div className="clip-resize-handle handle-l"></div>
                                <div className="clip-resize-handle handle-r"></div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Collapsible expanded keyframe property channel drawer lanes */}
                        {selectedClipOnTrack && (() => {
                          const clip = selectedClipOnTrack;
                          const activeProps: Keyframe['property'][] = [];
                          if (clip.keyframes.position) { activeProps.push('posX'); activeProps.push('posY'); }
                          if (clip.keyframes.scale) { activeProps.push('scaleX'); activeProps.push('scaleY'); }
                          if (clip.keyframes.rotation) { activeProps.push('rotation'); }
                          if (clip.keyframes.opacity) { activeProps.push('opacity'); }

                          if (activeProps.length === 0) return null;

                          return (
                            <div className="keyframe-lanes-container" style={{ background: 'rgba(99, 102, 241, 0.03)' }}>
                              <div className="kf-lanes-header" style={{ padding: '4px 12px', fontSize: '9px', fontWeight: 700, color: 'var(--primary)' }}>
                                <span>時間軸關鍵影格軌道 (Keyframe Channels Drawer)</span>
                              </div>
                              {activeProps.map(prop => {
                                const propKfs = clip.keyframeData.filter(kf => kf.property === prop);
                                const propLabel = 
                                  prop === 'posX' ? '位置 X (Position X)' :
                                  prop === 'posY' ? '位置 Y (Position Y)' :
                                  prop === 'scaleX' ? '縮放 X (Scale X)' :
                                  prop === 'scaleY' ? '縮放 Y (Scale Y)' :
                                  prop === 'rotation' ? '旋轉角度 (Rotation)' :
                                  '不透明度 (Opacity)';

                                return (
                                  <div key={prop} className="kf-property-lane" style={{ display: 'flex', height: '24px', alignItems: 'center' }}>
                                    <div className="kf-lane-label" style={{ width: '180px', fontSize: '9px', paddingLeft: '12px' }}>{propLabel}</div>
                                    <div className="kf-lane-track" style={{ position: 'relative', height: '100%', flex: 1, paddingLeft: 0 }}>
                                      {propKfs.map(kf => {
                                        const isEased = kf.easing !== 'linear' && kf.easing !== 'hold';
                                        return (
                                          <div
                                            key={kf.id}
                                            className={`kf-diamond ${isEased ? 'eased' : ''}`}
                                            style={{
                                              position: 'absolute',
                                              left: `${(kf.timeTicks / TICKS_PER_SECOND) * store.timelineZoom}px`,
                                              top: '50%',
                                              transform: 'translate(-50%, -50%)',
                                              cursor: 'pointer',
                                              color: isEased ? '#F59E0B' : '#6366F1'
                                            }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedKfId(kf.id);
                                              setGraphProperty(prop);
                                              setShowGraphEditor(true);
                                              triggerToast(`已選中此關鍵影格並切換至曲線編輯器！`);
                                            }}
                                            title={`ticks: ${kf.timeTicks}, 數值: ${kf.value}, 緩動: ${kf.easing}`}
                                          >
                                            <Diamond size={10} fill="currentColor" />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })
                }

                {/* Add Track Buttons */}
                <div className="add-track-row">
                  <button className="add-track-btn" onClick={() => { store.addTrack('video'); triggerToast('已新增視訊軌道'); }}>
                    <Plus size={12} /> 新增視訊軌 (Video Track)
                  </button>
                  <button className="add-track-btn audio" onClick={() => { store.addTrack('audio'); triggerToast('已新增音訊軌道'); }}>
                    <Plus size={12} /> 新增音訊軌 (Audio Track)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Simulated OS Import File Dialog */}
      {showImportDialog && (
        <div className="file-dialog-overlay">
          <div className="file-dialog-box">
            <div className="dialog-header">
              <h4>匯入多媒體素材檔案</h4>
              <button className="dialog-close" onClick={() => setShowImportDialog(false)}><X size={16} /></button>
            </div>
            <div className="dialog-body">
              <p className="dialog-subtitle">請選擇要載入至專案資產庫的本機影片、音軌或向量圖片：</p>
              <div className="import-options-grid">
                
                {/* Custom File Picker option */}
                <div 
                  className="import-option-card custom-file-import" 
                  onClick={() => document.getElementById('native-file-picker')?.click()}
                  style={{ border: '1px dashed var(--primary)', justifyContent: 'center', background: 'rgba(99, 102, 241, 0.03)', padding: '12px' }}
                >
                  <FolderOpen size={16} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>選擇自訂本機檔案...</span>
                  <input 
                    type="file" 
                    id="native-file-picker" 
                    style={{ display: 'none' }} 
                    onChange={handleCustomFileSelect}
                    accept="video/*,audio/*,.svg"
                  />
                </div>

                <div className="import-option-card" onClick={() => handleImportPredefined('clip-ocean', 'cinematic_ocean.mp4', 'video', '1920x1080', '12.4s')}>
                  <div className="mock-thumb ocean-thumb"></div>
                  <div className="option-info">
                    <span className="name">cinematic_ocean.mp4</span>
                    <span className="meta">影片 | 1920x1080 | 12.4s</span>
                  </div>
                </div>

                <div className="import-option-card" onClick={() => handleImportPredefined('clip-voice', 'narration_voiceover.wav', 'audio', '44,100Hz', '8.5s')}>
                  <div className="mock-thumb audio-thumb"><Mic size={14} /></div>
                  <div className="option-info">
                    <span className="name">narration_voiceover.wav</span>
                    <span className="meta">音訊 | 44.1kHz | 8.5s</span>
                  </div>
                </div>

                <div className="import-option-card" onClick={() => handleImportPredefined('clip-triangle', 'abstract_triangle.svg', 'svg', 'Vector', 'Static')}>
                  <div className="mock-thumb vector-thumb"><Triangle size={14} /></div>
                  <div className="option-info">
                    <span className="name">abstract_triangle.svg</span>
                    <span className="meta">圖像 | 向量 | 靜態 SVG</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulated Add Scene Modal Overlay */}
      {showAddSceneDialog && (
        <div className="file-dialog-overlay">
          <div className="file-dialog-box" style={{ width: '400px' }}>
            <div className="dialog-header">
              <h4>新增場景 (Create Scene)</h4>
              <button className="dialog-close" onClick={() => setShowAddSceneDialog(false)}><X size={16} /></button>
            </div>
            <div className="dialog-body">
              <div className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="grid-item">
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>場景名稱</label>
                  <input type="text" className="dark-input" value={newSceneName} onChange={(e) => setNewSceneName(e.target.value)} />
                </div>
                <div className="grid-item">
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>場景解析度 (Scene Dimension)</label>
                  <div className="resolution-lock-group">
                    <input type="number" className="dark-input inline-num" value={newSceneWidth} onChange={(e) => setNewSceneWidth(parseInt(e.target.value) || 0)} />
                    <LinkIcon size={12} className="lock-icon active" />
                    <input type="number" className="dark-input inline-num" value={newSceneHeight} onChange={(e) => setNewSceneHeight(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
              <div className="dialog-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="footer-btn ghost-btn" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => setShowAddSceneDialog(false)}>取消</button>
                <button className="footer-btn primary-gradient-btn" style={{ padding: '6px 16px', fontSize: '11px' }} onClick={handleCreateNewScene}>建立場景</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Glassmorphic Export & Render Settings Modal */}
      {showExportModal && (
        <div className="export-modal-overlay">
          <div className="export-modal-box">
            <div className="export-header">
              <div className="export-title-wrapper">
                <UploadCloud size={18} className="indigo-glow-icon" />
                <h4>匯出多媒體影片 (Export Media)</h4>
              </div>
              <button className="dialog-close" onClick={() => setShowExportModal(false)}><X size={16} /></button>
            </div>
            
            <div className="export-body">
              {/* Left Side Settings */}
              <div className="export-left-settings">
                <div className="settings-section">
                  <h5>基本檔案設定</h5>
                  <div className="form-grid">
                    <div className="grid-item full-width">
                      <label>檔案名稱</label>
                      <input type="text" className="dark-input" value={exportFilename} onChange={(e) => setExportFilename(e.target.value)} />
                    </div>
                    <div className="grid-item full-width">
                      <label>輸出路徑</label>
                      <div className="input-browse-group">
                        <input type="text" className="dark-input" value="C:/Projects/Slopeffect/Exports/" readOnly />
                        <button className="browse-btn" onClick={() => triggerToast('模擬系統對話框：輸出路徑保持默認')}><Folder size={11} /> 瀏覽</button>
                      </div>
                    </div>
                    <div className="grid-item full-width">
                      <label>輸出預設檔 (Preset)</label>
                      <select className="dark-select" value={exportPreset} onChange={(e) => setExportPreset(e.target.value)}>
                        <option>YouTube Full HD 1080p (Fast H.264)</option>
                        <option>Apple ProRes 422 HQ (Professional Copy)</option>
                        <option>Social Media Instagram Square 1:1</option>
                        <option>Audio Only (AAC 320kbps High Quality)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h5>影片編碼設定</h5>
                  <div className="form-grid-two">
                    <div className="grid-item">
                      <label>格式 (Format)</label>
                      <select className="dark-select"><option>MP4 (.mp4)</option><option>QuickTime (.mov)</option></select>
                    </div>
                    <div className="grid-item">
                      <label>視訊編碼器 (Codec)</label>
                      <select className="dark-select"><option>H.264 (AVC)</option><option>HEVC (H.265)</option></select>
                    </div>
                    <div className="grid-item">
                      <label>解析度 (Resolution)</label>
                      <div className="resolution-lock-group">
                        <input type="number" className="dark-input inline-num" defaultValue="1920" />
                        <LinkIcon size={12} className="lock-icon active" />
                        <input type="number" className="dark-input inline-num" defaultValue="1080" />
                      </div>
                    </div>
                    <div className="grid-item">
                      <label>畫面播放格率</label>
                      <select className="dark-select"><option>30.00 fps</option><option>60.00 fps</option></select>
                    </div>
                    <div className="grid-item full-width">
                      <label>目標位元率 (Target Bitrate)</label>
                      <div className="slider-val-combo">
                        <input type="range" min="2" max="30" value={exportBitrate} className="prop-slider" onChange={(e) => setExportBitrate(parseInt(e.target.value))} />
                        <span className="inline-val"><span>{exportBitrate}</span> Mbps</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side Progress */}
              <div className="export-right-progress">
                <div className="render-preview-card">
                  <div className="render-thumb-wrapper">
                    <div className="render-thumbnail"></div>
                    {isExporting && (
                      <div className="render-spinner-container">
                        <svg className="progress-ring" width="120" height="120">
                          <circle className="progress-ring-circle-bg" stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="transparent" r="52" cx="60" cy="60"/>
                          <circle className="progress-ring-circle" stroke="url(#indigo-grad)" strokeWidth="6" strokeDasharray="326.7" strokeDashoffset={326.7 - (exportProgress / 100) * 326.7} fill="transparent" r="52" cx="60" cy="60"/>
                          <defs>
                            <linearGradient id="indigo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#6366F1" />
                              <stop offset="100%" stopColor="#A855F7" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="progress-center-text">{exportProgress}%</div>
                      </div>
                    )}
                    <div className="render-preview-watermark">RENDER PREVIEW</div>
                  </div>

                  <div className="progress-panel-details">
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${exportProgress}%` }}></div>
                    </div>
                    
                    <div className="render-stats">
                      <div className="stat-row">
                        <span className="label">渲染進度:</span>
                        <span className="value accent">{isExporting ? `${exportProgress}% (正在渲染)` : '準備中'}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label">經過時間:</span>
                        <span className="value">{exportElapsedTime}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label">剩餘時間:</span>
                        <span className="value">{exportRemainingTime}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label">目前渲染階層:</span>
                        <span className="value" style={{ fontSize: '10px' }}>{exportPhase}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="export-footer">
              <button className="footer-btn ghost-btn" onClick={() => setShowExportModal(false)}>取消關閉</button>
              <button className="footer-btn secondary-btn" onClick={handleStartBgRender} disabled={!isExporting}>背景渲染</button>
              <button className="footer-btn primary-gradient-btn" onClick={handleStartRender} disabled={isExporting}>開始渲染</button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {toastMessage && (
        <div className="notification-toast">
          <Info size={16} />
          <span className="message">{toastMessage}</span>
        </div>
      )}

      {/* Background Rendering Status Badge */}
      {isBgExporting && (
        <div className="bg-render-status-badge" onClick={() => { setShowExportModal(true); setIsBgExporting(false); }}>
          <Loader2 className="spinner-icon" size={12} />
          <span>背景渲染中: <strong>{exportProgress}%</strong></span>
        </div>
      )}
    </div>
  );
}
