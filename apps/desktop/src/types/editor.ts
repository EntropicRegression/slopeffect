export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
  durationSeconds?: number;
}

export interface Transform {
  posX: number;
  posY: number;
  anchorX: number;  // 0.0 ~ 1.0, default 0.5 = center
  anchorY: number;  // 0.0 ~ 1.0, default 0.5 = center
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blendMode: string;
}

export interface Keyframe {
  id: string;
  timeTicks: number;
  property: 'posX' | 'posY' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier' | 'hold';
  handleOut?: { x: number; y: number };
  handleIn?: { x: number; y: number };
}

export interface KeyframesState {
  position: boolean;
  scale: boolean;
  rotation: boolean;
  opacity: boolean;
}

export interface Clip {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'svg' | 'image' | 'scene';
  startTicks: number;
  durationTicks: number;
  assetId: string;
  trackId: string;
  transform: Transform;
  keyframes: KeyframesState;
  keyframeData: Keyframe[];
  effects: Effect[];
  parentClipId: string | null;
  enabled: boolean;
  sceneId: string;        // Specifies which scene/composition this clip belongs to
  nestedSceneId?: string; // Reference to nested scene when type === 'scene'
}

export interface Effect {
  id: string;
  type: 'blur' | 'brightness' | 'contrast' | 'grayscale' | 'sepia' | 'hueRotate' | 'saturate' | 'invert' | 'dropShadow';
  enabled: boolean;
  params: Record<string, number>;
}

export interface TrackStatus {
  type: 'video' | 'audio';
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
  solo?: boolean;
}

export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'svg' | 'image';
  size: string;
  duration: string;
  format: string;
  blobUrl?: string;
}
