use serde::{Serialize, Deserialize};
use uuid::Uuid;

// ==========================================================================
// 1. Precise Time Representation (Ticks & Frame bases)
// ==========================================================================

/// 精確時間表示單位 (1 tick = 1 奈秒 / 1_000_000_000 ticks = 1 秒)
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TimelineTime {
    pub ticks: i64,
}

impl TimelineTime {
    pub fn new(ticks: i64) -> Self {
        Self { ticks }
    }
    
    pub fn from_seconds(seconds: f64) -> Self {
        Self { ticks: (seconds * 1_000_000_000.0) as i64 }
    }
    
    pub fn to_seconds(&self) -> f64 {
        self.ticks as f64 / 1_000_000_000.0
    }
}

/// 格率與取樣率基礎轉換
#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timebase {
    pub fps_num: u32,
    pub fps_den: u32,
    pub ticks_per_second: i64,
    pub audio_sample_rate: u32,
}

impl Default for Timebase {
    fn default() -> Self {
        Self {
            fps_num: 30000,
            fps_den: 1001,
            ticks_per_second: 1_000_000_000,
            audio_sample_rate: 48000,
        }
    }
}

// ==========================================================================
// 2. Scene Concept (Compositions with custom sizes)
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: Uuid,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub duration: TimelineTime,
    pub timebase: Timebase,
    pub video_tracks: Vec<VideoTrack>,
    pub audio_tracks: Vec<AudioTrack>,
}

impl Scene {
    pub fn new(name: &str, width: u32, height: u32) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            width,
            height,
            duration: TimelineTime::new(15_000_000_000), // Default 15s
            timebase: Timebase::default(),
            video_tracks: vec![
                VideoTrack::new("V2 向量圖層"),
                VideoTrack::new("V1 影片音軌")
            ],
            audio_tracks: vec![
                AudioTrack::new("A1 背景音樂")
            ],
        }
    }
}

// ==========================================================================
// 3. Track Structures
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoTrack {
    pub id: Uuid,
    pub name: String,
    pub enabled: bool,
    pub locked: bool,
    pub clips: Vec<LayerClip>,
}

impl VideoTrack {
    pub fn new(name: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            enabled: true,
            locked: false,
            clips: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    pub id: Uuid,
    pub name: String,
    pub enabled: bool,
    pub locked: bool,
    pub muted: bool,
    pub solo: bool,
    pub clips: Vec<AudioClip>,
}

impl AudioTrack {
    pub fn new(name: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            enabled: true,
            locked: false,
            muted: false,
            solo: false,
            clips: Vec::new(),
        }
    }
}

// ==========================================================================
// 4. Clip & Layer Entities
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerClip {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub asset_id: Option<Uuid>,
    pub start: TimelineTime,
    pub duration: TimelineTime,
    pub in_point: TimelineTime,
    pub z_index: i32,
    pub layer: Layer,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioClip {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub start: TimelineTime,
    pub duration: TimelineTime,
    pub in_point: TimelineTime,
    pub volume: f32,
    pub muted: bool,
    pub keyframes: Vec<KeyframeTrack>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: Uuid,
    pub name: String,
    pub enabled: bool,
    pub source: LayerSource,
    pub transform: TransformState,
    pub opacity: f32,
    pub keyframes: Vec<KeyframeTrack>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LayerSource {
    Video { asset_id: Uuid },
    Image { asset_id: Uuid },
    Svg { asset_id: Uuid },
    Shape { shape: ShapeDefinition },
}

// ==========================================================================
// 5. Geometry and Rendering States
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformState {
    pub pos_x: f32,
    pub pos_y: f32,
    pub rotation: f32, // Degrees
    pub scale_x: f32,
    pub scale_y: f32,
    pub anchor_x: f32,
    pub anchor_y: f32,
    pub blend_mode: BlendMode,
}

impl Default for TransformState {
    fn default() -> Self {
        Self {
            pos_x: 960.0,
            pos_y: 540.0,
            rotation: 0.0,
            scale_x: 100.0,
            scale_y: 100.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
            blend_mode: BlendMode::Normal,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BlendMode {
    Normal,
    Screen,
    Multiply,
    Overlay,
    Lighten,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeDefinition {
    pub shape_type: ShapeType,
    pub fill: String, // Hex string
    pub stroke: String,
    pub stroke_width: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShapeType {
    Rectangle { width: f32, height: f32 },
    Ellipse { rx: f32, ry: f32 },
    Line { x2: f32, y2: f32 },
}

// ==========================================================================
// 6. Keyframes & Animation Track
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyframeTrack {
    pub target: AnimatableProperty,
    pub keyframes: Vec<Keyframe>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AnimatableProperty {
    PositionX,
    PositionY,
    Rotation,
    ScaleX,
    ScaleY,
    Opacity,
    Volume,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyframe {
    pub time: TimelineTime,
    pub value: f32,
    pub interpolation: Interpolation,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Interpolation {
    Hold,
    Linear,
    EaseIn,
    EaseOut,
}
