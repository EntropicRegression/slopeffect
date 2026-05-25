import { create } from 'zustand';
import type { Scene, Clip, TrackStatus, Asset, Transform } from '../types/editor';

// Constant multipliers
const TICKS_PER_SECOND = 1000000000;
const FPS = 30;
const TICKS_PER_FRAME = TICKS_PER_SECOND / FPS;

interface EditorState {
  projectName: string;
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
      transform: { posX: 960, posY: 540, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
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
      transform: { posX: 0, posY: 0, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
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
      transform: { posX: 960, posY: 540, scaleX: 75, scaleY: 75, rotation: 45, opacity: 85, blendMode: 'normal' },
      keyframes: { position: true, scale: true, rotation: true, opacity: false },
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
      transform: { posX: 0, posY: 0, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' },
      keyframes: { position: false, scale: false, rotation: false, opacity: false },
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
      clips: {
        ...state.clips,
        [clipId]: {
          ...clip,
          transform: { posX: 960, posY: 540, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blendMode: 'normal' }
        }
      }
    };
  }),

  switchScene: (sceneId) => set((state) => {
    if (!state.scenes[sceneId]) return {};
    return { currentSceneId: sceneId };
  }),

  addScene: (name, width, height) => set((state) => {
    const id = `scene-${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`;
    return {
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
      clips: nextClips,
      selectedClipId: null
    };
  }),

  toggleTrackMute: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    return {
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
      // Ensure unique id
      let counter = nextNum;
      while (state.tracks[newId]) {
        counter++;
        newId = `${prefix}${counter}`;
      }
      const defaultName = name || (type === 'video' ? `V${counter} 影片圖層` : `A${counter} 音訊軌`);
      const maxOrder = Math.max(...Object.values(state.tracks).map(t => t.order), -1);
      // Video tracks insert before audio tracks, audio tracks go to end
      let insertOrder: number;
      if (type === 'video') {
        // Find the lowest audio track order and insert just before it
        const audioOrders = Object.values(state.tracks).filter(t => t.type === 'audio').map(t => t.order);
        if (audioOrders.length > 0) {
          insertOrder = Math.min(...audioOrders);
          // Shift all audio tracks down by 1
          const updatedTracks = { ...state.tracks };
          Object.entries(updatedTracks).forEach(([id, t]) => {
            if (t.type === 'audio') {
              updatedTracks[id] = { ...t, order: t.order + 1 };
            }
          });
          return {
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
    // Remove all clips on this track
    const nextClips = { ...state.clips };
    Object.values(nextClips).forEach(c => {
      if (c.trackId === trackId) delete nextClips[c.id];
    });
    const nextTracks = { ...state.tracks };
    delete nextTracks[trackId];
    return { tracks: nextTracks, clips: nextClips };
  }),

  toggleAudioSolo: (trackId) => set((state) => {
    const track = state.tracks[trackId];
    if (!track) return {};
    return {
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
  })
}));
