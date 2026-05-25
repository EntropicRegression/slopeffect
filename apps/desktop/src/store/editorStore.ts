import { create } from 'zustand';
import type { Scene, Clip, TrackStatus, Asset, Transform, Keyframe, Effect } from '../types/editor';
import { safeInvoke } from '../services/tauriIpc';

// Cubic Bezier 1D solver using Newton-Raphson and binary search fallback
export const solveCubicBezier = (p1x: number, p1y: number, p2x: number, p2y: number, tx: number): number => {
  if (tx <= 0) return 0;
  if (tx >= 1) return 1;

  const getX = (t: number) => {
    return 3 * (1 - t) * (1 - t) * t * p1x + 3 * (1 - t) * t * t * p2x + t * t * t;
  };

  const getSlope = (t: number) => {
    return 3 * (1 - t) * (1 - t) * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * t * t * (1 - p2x);
  };

  let t = tx;
  for (let i = 0; i < 8; i++) {
    const currentX = getX(t) - tx;
    const slope = getSlope(t);
    if (Math.abs(currentX) < 1e-6) break;
    if (Math.abs(slope) < 1e-6) break;
    t -= currentX / slope;
  }

  if (t < 0 || t > 1) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 16; i++) {
      t = (low + high) / 2;
      const currentX = getX(t);
      if (Math.abs(currentX - tx) < 1e-6) break;
      if (currentX < tx) {
        low = t;
      } else {
        high = t;
      }
    }
  }

  return 3 * (1 - t) * (1 - t) * t * p1y + 3 * (1 - t) * t * t * p2y + t * t * t;
};

// Cubic interpolation easing helper
export const evaluatePropertyAtTime = (clip: Clip, property: Keyframe['property'], timeTicks: number): number => {
  const kfs = (clip.keyframeData || []).filter(kf => kf.property === property);
  if (kfs.length === 0) {
    return clip.transform[property] ?? 0;
  }
  
  const sorted = [...kfs].sort((a, b) => a.timeTicks - b.timeTicks);
  
  if (timeTicks <= sorted[0].timeTicks) {
    return sorted[0].value;
  }
  if (timeTicks >= sorted[sorted.length - 1].timeTicks) {
    return sorted[sorted.length - 1].value;
  }
  
  let prev = sorted[0];
  let next = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeTicks >= sorted[i].timeTicks && timeTicks <= sorted[i+1].timeTicks) {
      prev = sorted[i];
      next = sorted[i+1];
      break;
    }
  }
  
  const duration = next.timeTicks - prev.timeTicks;
  if (duration === 0) return prev.value;
  
  const t = (timeTicks - prev.timeTicks) / duration;
  let factor = t;
  
  const easing = prev.easing || 'linear';
  if (easing === 'easeIn') {
    factor = t * t * t;
  } else if (easing === 'easeOut') {
    const t1 = t - 1;
    factor = t1 * t1 * t1 + 1;
  } else if (easing === 'easeInOut') {
    factor = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  } else if (easing === 'hold') {
    factor = t < 1 ? 0 : 1;
  } else if (easing === 'bezier') {
    const p1 = prev.handleOut || { x: 0.33, y: 0 };
    const p2 = next.handleIn || { x: 0.66, y: 1 };
    factor = solveCubicBezier(p1.x, p1.y, p2.x, p2.y, t);
  }
  
  return prev.value + (next.value - prev.value) * factor;
};

// Constant multipliers
const TICKS_PER_SECOND = 1000000000;
const FPS = 30;
const TICKS_PER_FRAME = TICKS_PER_SECOND / FPS;

interface EditorState {
  projectName: string;
  projectFilePath: string | null;
  isSaved: boolean;
  currentSceneId: string;
  scenes: Record<string, Scene>;
  currentTimeTicks: number;
  isPlaying: boolean;
  activeTool: 'select' | 'razor' | 'trim' | 'hand';
  selectedClipId: string | null;
  timelineZoom: number;
  isSnapEnabled: boolean;
  previewVolume: number;
  assets: Asset[];
  clips: Record<string, Clip>;
  tracks: Record<string, TrackStatus>;
  undoStack: any[];
  redoStack: any[];
  
  // Setters & Operations
  setProjectName: (name: string) => void;
  setProjectFilePath: (path: string | null) => void;
  saveProject: (path: string) => Promise<void>;
  loadProject: (path: string) => Promise<void>;
  createNewProject: () => void;
  setCurrentTimeTicks: (ticks: number) => void;
  setPlaying: (playing: boolean) => void;
  setActiveTool: (tool: 'select' | 'razor' | 'trim' | 'hand') => void;
  selectClip: (clipId: string | null) => void;
  setTimelineZoom: (zoom: number) => void;
  toggleSnap: () => void;
  setPreviewVolume: (volume: number) => void;
  updateClipTransform: (clipId: string, transform: Partial<Transform>) => void;
  updateClipName: (clipId: string, name: string) => void;
  updateClipEnabled: (clipId: string, enabled: boolean) => void;
  toggleKeyframe: (clipId: string, prop: 'position' | 'scale' | 'rotation' | 'opacity') => void;
  resetTransform: (clipId: string) => void;
  addKeyframe: (clipId: string, property: Keyframe['property'], timeTicks: number, value: number, easing?: Keyframe['easing']) => void;
  removeKeyframe: (clipId: string, keyframeId: string) => void;
  updateKeyframe: (clipId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  reorderTrack: (trackId: string, newOrder: number) => void;
  switchScene: (sceneId: string) => void;
  addScene: (name: string, width: number, height: number) => void;
  importAsset: (asset: Asset) => void;
  splitClip: () => void;
  deleteClip: () => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleAudioMute: (trackId: string) => void;
  toggleAudioSolo: (trackId: string) => void;
  addTrack: (type: 'video' | 'audio', name?: string) => string;
  removeTrack: (trackId: string) => void;
  
  // Effects Stack & Parenting (Sprint 2)
  addEffect: (clipId: string, type: Effect['type']) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  updateEffectParam: (clipId: string, effectId: string, paramName: string, value: number) => void;
  toggleEffect: (clipId: string, effectId: string) => void;
  setParentClip: (clipId: string, parentClipId: string | null) => void;
  
  // Graph Editor (Sprint 3)
  updateKeyframeHandles: (clipId: string, keyframeId: string, handleOut: { x: number, y: number }, handleIn: { x: number, y: number }) => void;
  setKeyframePreset: (clipId: string, keyframeId: string, presetType: 'linear' | 'hold' | 'easyEase') => void;
  
  // Playback Step
  stepForward: () => void;
  stepBackward: () => void;
  skipToStart: () => void;
  skipToEnd: () => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  recordCommand: (cmd: any) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  projectName: 'Untitled.slopeproj',
  projectFilePath: null,
  isSaved: true,
  currentSceneId: 'scene-1',
  scenes: {
    'scene-1': { id: 'scene-1', name: 'Scene 1', width: 1920, height: 1080 }
  },
  currentTimeTicks: 4400000000,
  isPlaying: false,
  activeTool: 'select',
  selectedClipId: 'clip-logo',
  timelineZoom: 150,
  isSnapEnabled: true,
  previewVolume: 80,
  
  setProjectFilePath: (path) => set({ projectFilePath: path }),

  saveProject: async (path) => {
    let stateToSave: any = null;
    useEditorStore.setState((state) => {
      stateToSave = {
        projectName: state.projectName,
        assets: state.assets,
        clips: state.clips,
        tracks: state.tracks,
        scenes: state.scenes,
        currentSceneId: state.currentSceneId,
        currentTimeTicks: state.currentTimeTicks,
        timelineZoom: state.timelineZoom,
        isSnapEnabled: state.isSnapEnabled,
        previewVolume: state.previewVolume
      };
      return {};
    });
    
    if (stateToSave) {
      const jsonContent = JSON.stringify(stateToSave, null, 2);
      await safeInvoke('save_rich_project', { path, jsonContent });
      const fileName = path.split(/[/\\]/).pop() || 'Untitled.slopeproj';
      set({ projectName: fileName, projectFilePath: path, isSaved: true });
    }
  },

  loadProject: async (path) => {
    const jsonStr = await safeInvoke<string>('load_rich_project', { path });
    if (jsonStr) {
      try {
        const loaded = JSON.parse(jsonStr);
        set({
          projectName: loaded.projectName || 'Untitled.slopeproj',
          projectFilePath: path,
          isSaved: true,
          assets: loaded.assets || [],
          clips: loaded.clips || {},
          tracks: loaded.tracks || {},
          scenes: loaded.scenes || {},
          currentSceneId: loaded.currentSceneId || 'scene-1',
          currentTimeTicks: loaded.currentTimeTicks || 0,
          timelineZoom: loaded.timelineZoom || 150,
          isSnapEnabled: loaded.isSnapEnabled !== false,
          previewVolume: loaded.previewVolume ?? 80,
          selectedClipId: null,
          undoStack: [],
          redoStack: []
        });
      } catch (err) {
        console.error("Failed to parse loaded project JSON", err);
      }
    }
  },

  createNewProject: () => {
    set({
      projectName: 'Untitled.slopeproj',
      projectFilePath: null,
      isSaved: true,
      currentSceneId: 'scene-1',
      scenes: {
        'scene-1': { id: 'scene-1', name: 'Scene 1', width: 1920, height: 1080 }
      },
      currentTimeTicks: 0,
      isPlaying: false,
      activeTool: 'select',
      selectedClipId: null,
      timelineZoom: 150,
      isSnapEnabled: true,
      previewVolume: 80,
      assets: [],
      clips: {},
      tracks: {
        v2: { type: 'video', name: 'V2 向量圖層', order: 0, muted: false, locked: false },
        v1: { type: 'video', name: 'V1 影片圖層', order: 1, muted: false, locked: false },
        a1: { type: 'audio', name: 'A1 音訊軌', order: 2, muted: false, locked: false, solo: false }
      },
      undoStack: [],
      redoStack: []
    });
  },
  
  assets: [
    { id: 'asset-sunset', name: 'nature_sunset.mp4', type: 'video', size: '1920x1080', duration: '15.0s', format: 'MP4' },
    { id: 'asset-drone', name: 'atmospheric_drone.wav', type: 'audio', size: '48,000Hz', duration: '32.0s', format: 'WAV' },
    { id: 'asset-logo', name: 'logo_vector.svg', type: 'svg', size: 'Vector', duration: 'Static', format: 'SVG' }
  ],
  
  clips: {
    'clip-sunset': {
      id: 'clip-sunset',
      name: 'nature_sunset.mp4',
      type: 'video',
      startTicks: 0,
      durationTicks: 10000000000,
      assetId: 'asset-sunset',
      trackId: 'v1',
      transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
      keyframeData: [],
      effects: [],
      parentClipId: null,
      enabled: true
    },
    'clip-sunset-audio': {
      id: 'clip-sunset-audio',
      name: 'nature_sunset.mp4 (音訊)',
      type: 'audio',
      startTicks: 0,
      durationTicks: 10000000000,
      assetId: 'asset-sunset',
      trackId: 'a1',
      transform: { posX: 0, posY: 0, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
      keyframeData: [],
      effects: [],
      parentClipId: null,
      enabled: true
    },
    'clip-logo': {
      id: 'clip-logo',
      name: 'logo_vector.svg',
      type: 'svg',
      startTicks: 3000000000,
      durationTicks: 5000000000,
      assetId: 'asset-logo',
      trackId: 'v2',
      transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 75, scaleY: 75, rotation: 45, opacity: 85, blendMode: 'normal' },
      keyframes: { position: true, scale: true, rotation: true, opacity: false },
      keyframeData: [
        { id: 'kf-logo-pos-1', timeTicks: 3000000000, property: 'posX', value: 400, easing: 'easeInOut' },
        { id: 'kf-logo-pos-2', timeTicks: 6000000000, property: 'posX', value: 1520, easing: 'easeInOut' },
        { id: 'kf-logo-rot-1', timeTicks: 3000000000, property: 'rotation', value: 0, easing: 'easeInOut' },
        { id: 'kf-logo-rot-2', timeTicks: 8000000000, property: 'rotation', value: 360, easing: 'linear' },
        { id: 'kf-logo-scale-1', timeTicks: 3000000000, property: 'scaleX', value: 50, easing: 'easeOut' },
        { id: 'kf-logo-scale-2', timeTicks: 5500000000, property: 'scaleX', value: 120, easing: 'easeIn' }
      ],
      effects: [],
      parentClipId: null,
      enabled: true
    },
    'clip-drone': {
      id: 'clip-drone',
      name: 'atmospheric_drone.wav',
      type: 'audio',
      startTicks: 0,
      durationTicks: 15000000000,
      assetId: 'asset-drone',
      trackId: 'a1',
      transform: { posX: 0, posY: 0, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
      keyframeData: [],
      effects: [],
      parentClipId: null,
      enabled: true
    }
  },
  
  tracks: {
    v2: { type: 'video', name: 'V2 向量圖層', order: 0, muted: false, locked: false },
    v1: { type: 'video', name: 'V1 影片圖層', order: 1, muted: false, locked: false },
    a1: { type: 'audio', name: 'A1 音訊軌', order: 2, muted: false, locked: false, solo: false }
  },
  
  undoStack: [],
  redoStack: [],

  // Operations
  setProjectName: (name) => set({ projectName: name }),
  setCurrentTimeTicks: (ticks) => set({ currentTimeTicks: Math.max(0, ticks) }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setTimelineZoom: (zoom) => set({ timelineZoom: zoom }),
  toggleSnap: () => set((state) => ({ isSnapEnabled: !state.isSnapEnabled })),
  setPreviewVolume: (volume) => set({ previewVolume: volume }),
  
  updateClipTransform: (clipId, newTransform) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          transform: { ...clip.transform, ...newTransform }
        }
      }
    };
  }),

  updateClipName: (clipId, name) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: { ...clip, name }
      }
    };
  }),

  updateClipEnabled: (clipId, enabled) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: { ...clip, enabled }
      }
    };
  }),

  toggleKeyframe: (clipId, prop) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    const val = !clip.keyframes[prop];
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          keyframes: { ...clip.keyframes, [prop]: val }
        }
      }
    };
  }),

  resetTransform: (clipId) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          transform: { posX: 960, posY: 540, anchorX: 0.5, anchorY: 0.5, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' }
        }
      }
    };
  }),

  addKeyframe: (clipId, property, timeTicks, value, easing = 'linear') => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    const id = `kf-${Math.random().toString(36).substring(2, 9)}`;
    const filtered = clip.keyframeData.filter(kf => !(kf.property === property && kf.timeTicks === timeTicks));
    const newKf: Keyframe = { id, timeTicks, property, value, easing };
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: { ...clip, keyframeData: [...filtered, newKf].sort((a, b) => a.timeTicks - b.timeTicks) }
      }
    };
  }),

  removeKeyframe: (clipId, keyframeId) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: { ...clip, keyframeData: clip.keyframeData.filter(kf => kf.id !== keyframeId) }
      }
    };
  }),

  updateKeyframe: (clipId, keyframeId, updates) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          keyframeData: clip.keyframeData.map(kf => kf.id === keyframeId ? { ...kf, ...updates } : kf)
        }
      }
    };
  }),

  reorderTrack: (trackId, newOrder) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    const oldOrder = track.order;
    if (oldOrder === newOrder) return {};
    const updatedTracks = { ...state.tracks };
    Object.entries(updatedTracks).forEach(([id, t]) => {
      if (id === trackId) {
        updatedTracks[id] = { ...t, order: newOrder };
      } else if (oldOrder < newOrder && t.order > oldOrder && t.order <= newOrder) {
        updatedTracks[id] = { ...t, order: t.order - 1 };
      } else if (oldOrder > newOrder && t.order >= newOrder && t.order < oldOrder) {
        updatedTracks[id] = { ...t, order: t.order + 1 };
      }
    });
    return { isSaved: false, tracks: updatedTracks };
  }),

  switchScene: (sceneId) => set((state) => {
    if (!state.scenes[sceneId]) return {};
    return { currentSceneId: sceneId };
  }),

  addScene: (name, width, height) => set((state) => {
    const id = `scene-${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`;
    return {
      isSaved: false,
      scenes: {
        ...state.scenes,
        [id]: { id, name, width, height }
      },
      currentSceneId: id
    };
  }),

  importAsset: (asset) => set((state) => {
    if (state.assets.some((a) => a.name === asset.name)) return {};
    return {
      isSaved: false,
      assets: [...state.assets, asset]
    };
  }),

  splitClip: () => set((state) => {
    const clipId = state.selectedClipId;
    if (!clipId) return {};
    
    const clip = state.clips[clipId];
    if (!clip) return {};
    
    const playheadTicks = state.currentTimeTicks;
    const clipEnd = clip.startTicks + clip.durationTicks;
    
    if (playheadTicks > clip.startTicks && playheadTicks < clipEnd) {
      const leftPartDuration = playheadTicks - clip.startTicks;
      const rightPartDuration = clipEnd - playheadTicks;
      
      const updatedLeftClip = {
        ...clip,
        durationTicks: leftPartDuration
      };
      
      const newId = `${clip.id}-split`;
      const newRightClip: Clip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: newId,
        name: `${clip.name} (切割)`,
        startTicks: playheadTicks,
        durationTicks: rightPartDuration
      };
      
      const updatedClips = {
        ...state.clips,
        [clip.id]: updatedLeftClip,
        [newId]: newRightClip
      };
      
      // record split command
      const cmd = {
        type: 'split',
        originalId: clip.id,
        newId: newId,
        originalDuration: leftPartDuration + rightPartDuration,
        splitTicks: playheadTicks
      };
      
      return {
        isSaved: false,
        clips: updatedClips,
        selectedClipId: newId,
        undoStack: [...state.undoStack, cmd],
        redoStack: []
      };
    }
    return {};
  }),

  deleteClip: () => set((state) => {
    const clipId = state.selectedClipId;
    if (!clipId) return {};
    
    const nextClips = { ...state.clips };
    delete nextClips[clipId];
    
    return {
      isSaved: false,
      clips: nextClips,
      selectedClipId: null
    };
  }),

  toggleTrackMute: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    return {
      isSaved: false,
      tracks: {
        ...state.tracks,
        [trackId]: { ...track, muted: !track.muted }
      }
    };
  }),

  toggleTrackLock: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    return {
      isSaved: false,
      tracks: {
        ...state.tracks,
        [trackId]: { ...track, locked: !track.locked }
      }
    };
  }),

  toggleAudioMute: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    return {
      isSaved: false,
      tracks: {
        ...state.tracks,
        [trackId]: { ...track, muted: !track.muted }
      }
    };
  }),

  addTrack: (type, name) => {
    let newId = '';
    useEditorStore.setState((state) => {
      const existingOfType = Object.entries(state.tracks).filter(([, t]) => t.type === type);
      const nextNum = existingOfType.length + 1;
      const prefix = type === 'video' ? 'v' : 'a';
      newId = `${prefix}${nextNum}`;
      let counter = nextNum;
      while (state.tracks[newId]) {
        counter++;
        newId = `${prefix}${counter}`;
      }
      const defaultName = name || (type === 'video' ? `V${counter} 影片圖層` : `A${counter} 音訊軌`);
      const maxOrder = Math.max(...Object.values(state.tracks).map(t => t.order), -1);
      let insertOrder: number;
      if (type === 'video') {
        const audioOrders = Object.values(state.tracks).filter(t => t.type === 'audio').map(t => t.order);
        if (audioOrders.length > 0) {
          insertOrder = Math.min(...audioOrders);
          const updatedTracks = { ...state.tracks };
          Object.entries(updatedTracks).forEach(([id, t]) => {
            if (t.type === 'audio') {
              updatedTracks[id] = { ...t, order: t.order + 1 };
            }
          });
          return {
            isSaved: false,
            tracks: {
              ...updatedTracks,
              [newId]: { type: 'video' as const, name: defaultName, order: insertOrder, muted: false, locked: false }
            }
          };
        } else {
          insertOrder = maxOrder + 1;
        }
      } else {
        insertOrder = maxOrder + 1;
      }
      return {
        isSaved: false,
        tracks: {
          ...state.tracks,
          [newId]: type === 'audio'
            ? { type: 'audio' as const, name: defaultName, order: insertOrder, muted: false, locked: false, solo: false }
            : { type: 'video' as const, name: defaultName, order: insertOrder, muted: false, locked: false }
        }
      };
    });
    return newId;
  },

  removeTrack: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    const nextClips = { ...state.clips };
    Object.values(nextClips).forEach(c => {
      if (c.trackId === trackId) delete nextClips[c.id];
    });
    const nextTracks = { ...state.tracks };
    delete nextTracks[trackId];
    return { isSaved: false, tracks: nextTracks, clips: nextClips };
  }),

  toggleAudioSolo: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    return {
      isSaved: false,
      tracks: {
        ...state.tracks,
        [trackId]: { ...track, solo: !track.solo }
      }
    };
  }),

  stepForward: () => set((state) => ({ currentTimeTicks: Math.min(15000000000, state.currentTimeTicks + TICKS_PER_FRAME) })),
  stepBackward: () => set((state) => ({ currentTimeTicks: Math.max(0, state.currentTimeTicks - TICKS_PER_FRAME) })),
  skipToStart: () => set({ currentTimeTicks: 0 }),
  skipToEnd: () => set({ currentTimeTicks: 15000000000 }),

  // Undo/Redo Engine
  recordCommand: (cmd) => set((state) => ({
    undoStack: [...state.undoStack, cmd],
    redoStack: []
  })),

  undo: () => set((state) => {
    if (state.undoStack.length === 0) return {};
    const nextUndo = [...state.undoStack];
    const cmd = nextUndo.pop();
    const nextRedo = [...state.redoStack, cmd];
    
    let updatedClips = { ...state.clips };
    if (cmd.type === 'transform') {
      const clip = updatedClips[cmd.clipId];
      if (clip) {
        updatedClips[cmd.clipId] = {
          ...clip,
          transform: { ...clip.transform, ...cmd.prev }
        };
      }
    }
    
    return {
      undoStack: nextUndo,
      redoStack: nextRedo,
      clips: updatedClips
    };
  }),

  redo: () => set((state) => {
    if (state.redoStack.length === 0) return {};
    const nextRedo = [...state.redoStack];
    const cmd = nextRedo.pop();
    const nextUndo = [...state.undoStack, cmd];
    
    let updatedClips = { ...state.clips };
    if (cmd.type === 'transform') {
      const clip = updatedClips[cmd.clipId];
      if (clip) {
        updatedClips[cmd.clipId] = {
          ...clip,
          transform: { ...clip.transform, ...cmd.next }
        };
      }
    }
    
    return {
      undoStack: nextUndo,
      redoStack: nextRedo,
      clips: updatedClips
    };
  }),

  // Effects Stack & Parenting Actions
  addEffect: (clipId, type) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    const id = `fx-${Math.random().toString(36).substring(2, 9)}`;
    
    const params: Record<string, number> = {};
    if (type === 'blur') params.radius = 5;
    else if (type === 'brightness' || type === 'contrast' || type === 'saturate') params.amount = 100;
    else if (type === 'grayscale' || type === 'sepia' || type === 'invert') params.amount = 100;
    else if (type === 'hueRotate') params.angle = 90;
    else if (type === 'dropShadow') {
      params.offsetX = 5;
      params.offsetY = 5;
      params.radius = 5;
    }
    
    const newEffect: Effect = { id, type, enabled: true, params };
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          effects: [...(clip.effects || []), newEffect]
        }
      }
    };
  }),

  removeEffect: (clipId, effectId) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          effects: (clip.effects || []).filter(fx => fx.id !== effectId)
        }
      }
    };
  }),

  updateEffectParam: (clipId, effectId, paramName, value) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          effects: (clip.effects || []).map(fx =>
            fx.id === effectId
              ? { ...fx, params: { ...fx.params, [paramName]: value } }
              : fx
          )
        }
      }
    };
  }),

  toggleEffect: (clipId, effectId) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          effects: (clip.effects || []).map(fx =>
            fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx
          )
        }
      }
    };
  }),

  setParentClip: (clipId, parentClipId) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: { ...clip, parentClipId }
      }
    };
  }),

  updateKeyframeHandles: (clipId, keyframeId, handleOut, handleIn) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          keyframeData: clip.keyframeData.map(kf =>
            kf.id === keyframeId ? { ...kf, easing: 'bezier' as const, handleOut, handleIn } : kf
          )
        }
      }
    };
  }),

  setKeyframePreset: (clipId, keyframeId, presetType) => set((state) => {
    const clip = state.clips[clipId];
    if (!clip) return {};
    return {
      isSaved: false,
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          keyframeData: clip.keyframeData.map(kf => {
            if (kf.id !== keyframeId) return kf;
            if (presetType === 'linear') {
              return { ...kf, easing: 'linear' as const, handleOut: undefined, handleIn: undefined };
            } else if (presetType === 'hold') {
              return { ...kf, easing: 'hold' as const, handleOut: undefined, handleIn: undefined };
            } else {
              return {
                ...kf,
                easing: 'bezier' as const,
                handleOut: { x: 0.33, y: 0 },
                handleIn: { x: 0.66, y: 1 }
              };
            }
          })
        }
      }
    };
  })
}));
