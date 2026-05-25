export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Transform {
  posX: number;
  posY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blendMode: string;
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
  type: 'video' | 'audio' | 'svg' | 'image';
  startTicks: number;
  durationTicks: number;
  assetId: string;
  trackId: string;
  transform: Transform;
  keyframes: KeyframesState;
  enabled: boolean;
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
}
