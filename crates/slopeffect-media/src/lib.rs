use std::path::{Path, PathBuf};
use std::process::Command;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use serde::{Deserialize, Serialize};
use anyhow::{anyhow, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
  pub format_name: String,
  pub duration_seconds: f64,
  pub width: Option<u32>,
  pub height: Option<u32>,
  pub fps: Option<f64>,
  pub sample_rate: Option<u32>,
  pub channels: Option<u32>,
}

/// Probes a media file (video or audio) using ffprobe and extracts technical metadata
pub fn probe_file<P: AsRef<Path>>(file_path: P) -> Result<MediaMetadata> {
  let path_str = file_path.as_ref().to_string_lossy().into_owned();
  
  // Call ffprobe to return metadata in JSON format
  let output = Command::new("ffprobe")
    .args(&[
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-print_format", "json",
      &path_str
    ])
    .output();

  let output = match output {
    Ok(out) if out.status.success() => out,
    Ok(out) => {
      let err_msg = String::from_utf8_lossy(&out.stderr);
      return Err(anyhow!("ffprobe failed: {}", err_msg));
    }
    Err(e) => {
      return Err(anyhow!("ffprobe tool is not installed or not found on the system PATH. Error: {}", e));
    }
  };

  let json_str = String::from_utf8(output.stdout)?;
  let probe_data: serde_json::Value = serde_json::from_str(&json_str)?;

  // Parse streams (video/audio streams)
  let streams = probe_data.get("streams")
    .and_then(|v| v.as_array())
    .ok_or_else(|| anyhow!("No streams found in media file"))?;

  let mut width: Option<u32> = None;
  let mut height: Option<u32> = None;
  let mut fps: Option<f64> = None;
  let mut sample_rate: Option<u32> = None;
  let mut channels: Option<u32> = None;

  for stream in streams {
    let codec_type = stream.get("codec_type").and_then(|v| v.as_str()).unwrap_or("");
    if codec_type == "video" {
      width = stream.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
      height = stream.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
      
      // Calculate FPS from "r_frame_rate" fraction e.g. "30/1" or "30000/1001"
      if let Some(r_fps) = stream.get("r_frame_rate").and_then(|v| v.as_str()) {
        let parts: Vec<&str> = r_fps.split('/').collect();
        if parts.len() == 2 {
          let num: f64 = parts[0].parse().unwrap_or(30.0);
          let den: f64 = parts[1].parse().unwrap_or(1.0);
          if den > 0.0 {
            fps = Some(num / den);
          }
        }
      }
    } else if codec_type == "audio" {
      sample_rate = stream.get("sample_rate")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u32>().ok());
      channels = stream.get("channels").and_then(|v| v.as_u64()).map(|v| v as u32);
    }
  }

  // Parse format details (duration, format name)
  let format = probe_data.get("format")
    .ok_or_else(|| anyhow!("Format metadata not found"))?;
  
  let format_name = format.get("format_name")
    .and_then(|v| v.as_str())
    .unwrap_or("unknown")
    .to_string();
    
  let duration_seconds = format.get("duration")
    .and_then(|v| v.as_str())
    .and_then(|s| s.parse::<f64>().ok())
    .unwrap_or(0.0);

  Ok(MediaMetadata {
    format_name,
    duration_seconds,
    width,
    height,
    fps,
    sample_rate,
    channels,
  })
}

// ==========================================================================
// Cache & Thumbnail Management (Milestone 3 - Task 3.2 & 3.3)
// ==========================================================================

pub struct CacheManager {
  cache_dir: PathBuf,
}

impl CacheManager {
  /// Initializes the local CacheManager and creates directories in AppData
  pub fn new() -> Result<Self> {
    // Find system local app data directory
    let base_dir = if let Ok(app_data) = std::env::var("APPDATA") {
      PathBuf::from(app_data)
    } else {
      // Fallback to home directory or temp path if APPDATA is not set
      let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
      PathBuf::from(home).join(".config")
    };
    
    let cache_dir = base_dir.join("Slopeffect").join("cache").join("thumbnails");
    
    // Proactively create directory tree
    std::fs::create_dir_all(&cache_dir)?;
    
    Ok(CacheManager { cache_dir })
  }

  /// Calculates a unique cached filename key based on the absolute file path
  pub fn get_cache_path<P: AsRef<Path>>(&self, file_path: P) -> PathBuf {
    let path_str = file_path.as_ref().to_string_lossy();
    let mut hasher = DefaultHasher::new();
    path_str.hash(&mut hasher);
    let hash_val = hasher.finish();
    let key = format!("thumb_{:016x}.jpg", hash_val);
    self.cache_dir.join(key)
  }

  /// Extracts a video frame at 1.0s using FFmpeg and saves it scaled as a cache JPEG
  pub fn generate_thumbnail<P: AsRef<Path>>(&self, video_path: P) -> Result<PathBuf> {
    let src = video_path.as_ref().to_string_lossy().into_owned();
    let dest_path = self.get_cache_path(&video_path);
    let dest = dest_path.to_string_lossy().into_owned();

    // Call ffmpeg tool to grab exactly 1 frame at 00:00:01 and scale it to 320x180
    let output = Command::new("ffmpeg")
      .args(&[
        "-y",
        "-ss", "00:00:01",
        "-i", &src,
        "-vframes", "1",
        "-f", "image2",
        "-s", "320x180",
        &dest
      ])
      .output();

    match output {
      Ok(out) if out.status.success() => Ok(dest_path),
      Ok(out) => {
        let err_msg = String::from_utf8_lossy(&out.stderr);
        Err(anyhow!("ffmpeg thumbnail generation failed: {}", err_msg))
      }
      Err(e) => Err(anyhow!("ffmpeg tool is not installed or not found on PATH. Error: {}", e))
    }
  }
}
