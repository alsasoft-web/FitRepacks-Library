// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::command;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub struct AppState {}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecentGameItem {
    pub id: String,
    pub title: String,
    pub exe_path: String,
    pub working_dir: Option<String>,
    pub cover_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TrayDownloadItem {
    pub id: String,
    pub title: String,
    pub progress: f64,
    pub speed: String,
    pub status: String,
}

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static RUNNING_GAMES: Mutex<Option<std::collections::HashMap<String, String>>> = Mutex::new(None);
static RECENT_GAMES: Mutex<Vec<RecentGameItem>> = Mutex::new(Vec::new());
static TRAY_DOWNLOADS: Mutex<Vec<TrayDownloadItem>> = Mutex::new(Vec::new());

#[cfg(target_os = "windows")]
fn is_process_running_by_name(exe_name: &str) -> bool {
    let clean_name = Path::new(exe_name)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(exe_name)
        .to_lowercase();

    if clean_name.is_empty() {
        return false;
    }

    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::Foundation::INVALID_HANDLE_VALUE;

    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(h) if h != INVALID_HANDLE_VALUE => h,
            _ => return false,
        };

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let null_pos = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                let proc_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]).to_lowercase();

                if proc_name == clean_name {
                    let _ = windows::Win32::Foundation::CloseHandle(snapshot);
                    return true;
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = windows::Win32::Foundation::CloseHandle(snapshot);
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn is_process_running_by_name(exe_name: &str) -> bool {
    let clean_name = Path::new(exe_name)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(exe_name);
    if clean_name.is_empty() {
        return false;
    }
    if let Ok(output) = Command::new("pgrep").arg("-f").arg(clean_name).output() {
        return output.status.success() && !output.stdout.is_empty();
    }
    false
}

fn set_game_running(gid: &str, exe_path: &str, is_running: bool) {
    if let Ok(mut lock) = RUNNING_GAMES.lock() {
        let map = lock.get_or_insert_with(std::collections::HashMap::new);
        if is_running {
            map.insert(gid.to_string(), exe_path.to_string());
        } else {
            map.remove(gid);
        }
    }
}

#[command]
fn is_game_running(game_id: String, exe_path: Option<String>) -> bool {
    if let Some(ref path) = exe_path {
        if !path.trim().is_empty() {
            return is_process_running_by_name(path);
        }
    }
    if let Ok(lock) = RUNNING_GAMES.lock() {
        if let Some(ref map) = *lock {
            if let Some(stored_exe) = map.get(&game_id) {
                if !stored_exe.is_empty() {
                    return is_process_running_by_name(stored_exe);
                }
                return true;
            }
        }
    }
    false
}

#[command]
fn launch_game_exe(
    app_handle: tauri::AppHandle,
    exe_path: String,
    working_dir: Option<String>,
    game_id: Option<String>,
    runner_command: Option<String>,
    runner_args: Option<Vec<String>>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<String, String> {
    let mut cmd = if let Some(ref runner) = runner_command {
        if !runner.trim().is_empty() {
            let mut c = Command::new(runner);
            if let Some(ref args) = runner_args {
                c.args(args);
            }
            c
        } else {
            let path = Path::new(&exe_path);
            if !path.exists() {
                return Err(format!("Executable path does not exist: {}", exe_path));
            }
            Command::new(&exe_path)
        }
    } else {
        let path = Path::new(&exe_path);
        if !path.exists() {
            return Err(format!("Executable path does not exist: {}", exe_path));
        }
        Command::new(&exe_path)
    };

    if let Some(ref envs) = env_vars {
        for (k, v) in envs {
            cmd.env(k, v);
        }
    }

    let path = Path::new(&exe_path);
    let working_directory = match working_dir {
        Some(ref dir) if !dir.trim().is_empty() => {
            let p = PathBuf::from(dir);
            // If dir is not the immediate parent and exe is in a subfolder, use exe's parent
            if let Some(parent) = path.parent() {
                if parent.exists() && parent != p {
                    parent.to_path_buf()
                } else {
                    p
                }
            } else {
                p
            }
        }
        _ => path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from(".")),
    };
    cmd.current_dir(&working_directory);

    let start_time = Instant::now();

    let mut spawn_result = cmd.spawn();

    // If we hit error 32 (Sharing violation / file locked by torrent engine or AV), retry with brief delay
    if let Err(ref e) = spawn_result {
        if e.raw_os_error() == Some(32)
            || e.to_string().contains("os error 32")
            || e.to_string().contains("used by another process")
        {
            for _ in 0..4 {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let mut retry_cmd = if let Some(ref runner) = runner_command {
                    if !runner.trim().is_empty() {
                        let mut c = Command::new(runner);
                        if let Some(ref args) = runner_args {
                            c.args(args);
                        }
                        c
                    } else {
                        Command::new(&exe_path)
                    }
                } else {
                    Command::new(&exe_path)
                };
                if let Some(ref envs) = env_vars {
                    for (k, v) in envs {
                        retry_cmd.env(k, v);
                    }
                }
                retry_cmd.current_dir(&working_directory);
                spawn_result = retry_cmd.spawn();
                if spawn_result.is_ok() {
                    break;
                }
            }
        }
    }

    let mut child = match spawn_result {
        Ok(c) => c,
        Err(ref e)
            if e.raw_os_error() == Some(740)
                || e.to_string().contains("740")
                || e.to_string().contains("elevation")
                || e.raw_os_error() == Some(32)
                || e.to_string().contains("os error 32") =>
        {
            let ps_cmd = format!(
                "Start-Process -FilePath '{}' -WorkingDirectory '{}' -Verb RunAs",
                exe_path.replace("'", "''"),
                working_directory.to_string_lossy().replace("'", "''")
            );
            let mut fallback_cmd = Command::new("powershell");
            fallback_cmd.args(["-NoProfile", "-Command", &ps_cmd]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                fallback_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            fallback_cmd
                .spawn()
                .map_err(|err| format!("Failed launching process with elevation/fallback: {}", err))?
        }
        Err(err) => return Err(format!("Failed launching process {}: {}", exe_path, err)),
    };

    let gid = game_id.clone();
    let tracked_exe = exe_path.clone();
    if let Some(ref id) = gid {
        set_game_running(id, &tracked_exe, true);
    }

    std::thread::spawn(move || {
        let exe_file = Path::new(&tracked_exe)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string();

        // 1. Give the game process up to 20s startup grace window to appear in process list
        let mut process_seen = false;
        if !exe_file.is_empty() {
            for _ in 0..20 {
                if is_process_running_by_name(&exe_file) {
                    process_seen = true;
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(1000));
            }
        }

        // 2. Active monitoring: stay active as long as the game executable is running
        if process_seen {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(2));
                if !is_process_running_by_name(&exe_file) {
                    // Double check after 1.5s to prevent false positives on level transitions
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    if !is_process_running_by_name(&exe_file) {
                        break;
                    }
                }
            }
        } else {
            // Fallback: wait on direct child handle
            let _ = child.wait();
        }

        let elapsed_secs = start_time.elapsed().as_secs();
        let elapsed_mins = (elapsed_secs / 60) as i64;

        if let Some(ref id) = gid {
            set_game_running(id, "", false);

            use tauri::Emitter;
            let _ = app_handle.emit(
                "game-process-closed",
                serde_json::json!({
                    "gameId": id,
                    "elapsedSeconds": elapsed_secs,
                    "elapsedMinutes": elapsed_mins.max(1)
                }),
            );
        }
    });

    Ok(format!("Successfully launched {}", exe_path))
}

#[command]
fn set_folder_cover_icon(folder_path: String, cover_url: String) -> Result<bool, String> {
    use base64::Engine;
    println!("[FitRepacks Backend] [Folder Cover] Setting custom folder icon for: {}", folder_path);
    let dir = Path::new(&folder_path);
    if !dir.exists() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    // 1. Fetch or decode image bytes
    let img_bytes: Vec<u8> = if cover_url.starts_with("data:image/") {
        let base64_str = cover_url
            .split(',')
            .nth(1)
            .ok_or_else(|| "Invalid base64 image data".to_string())?;
        base64::engine::general_purpose::STANDARD
            .decode(base64_str)
            .map_err(|e| e.to_string())?
    } else if cover_url.starts_with("http://") || cover_url.starts_with("https://") {
        println!("[FitRepacks Backend] [Folder Cover] Downloading cover artwork from: {}", cover_url);
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get(&cover_url).send().map_err(|e| e.to_string())?;
        resp.bytes().map_err(|e| e.to_string())?.to_vec()
    } else {
        return Err("Unsupported cover image format".to_string());
    };

    // 2. Decode and convert to 256x256 ICO
    let img = image::load_from_memory(&img_bytes).map_err(|e| format!("Failed to decode image: {}", e))?;
    let resized = img.resize_exact(256, 256, image::imageops::FilterType::Lanczos3);

    let ico_path = dir.join("folder.ico");
    let ini_path = dir.join("desktop.ini");

    // Remove old attributes if they exist
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("attrib").args(["-h", "-s", "-r", &ini_path.to_string_lossy()]).spawn();
        let _ = Command::new("attrib").args(["-h", "-s", "-r", &ico_path.to_string_lossy()]).spawn();
    }

    resized
        .save_with_format(&ico_path, image::ImageFormat::Ico)
        .map_err(|e| format!("Failed to save folder.ico: {}", e))?;

    // 3. Write desktop.ini
    let desktop_ini_content = "[.ShellClassInfo]\r\nIconResource=folder.ico,0\r\nIconFile=folder.ico\r\nIconIndex=0\r\n[ViewState]\r\nMode=\r\nVid=\r\nFolderType=Generic\r\nLogo=folder.ico\r\n";
    std::fs::write(&ini_path, desktop_ini_content).map_err(|e| e.to_string())?;

    // 4. Apply Windows file & folder attributes synchronously and notify Shell
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;

        let ini_wide: Vec<u16> = OsStr::new(&ini_path).encode_wide().chain(Some(0)).collect();
        let ico_wide: Vec<u16> = OsStr::new(&ico_path).encode_wide().chain(Some(0)).collect();
        let folder_wide: Vec<u16> = OsStr::new(&folder_path).encode_wide().chain(Some(0)).collect();

        unsafe {
            extern "system" {
                fn SetFileAttributesW(lpFileName: *const u16, dwFileAttributes: u32) -> i32;
                fn SHChangeNotify(wEventId: i32, uFlags: u32, dwItem1: *const u16, dwItem2: *const u16);
            }

            // FILE_ATTRIBUTE_READONLY = 0x1, FILE_ATTRIBUTE_HIDDEN = 0x2, FILE_ATTRIBUTE_SYSTEM = 0x4
            // 1. Set desktop.ini as Hidden + System (0x06)
            SetFileAttributesW(ini_wide.as_ptr(), 0x02 | 0x04);

            // 2. Set folder.ico as Hidden (0x02)
            SetFileAttributesW(ico_wide.as_ptr(), 0x02);

            // 3. Set the target folder as Read-Only (0x01) so Windows Explorer parses desktop.ini
            SetFileAttributesW(folder_wide.as_ptr(), 0x01);

            // 4. Notify Windows Shell to refresh folder icon cache
            // SHCNE_UPDATEITEM = 0x00002000, SHCNF_PATHW = 0x0005
            SHChangeNotify(0x00002000, 0x0005, folder_wide.as_ptr(), std::ptr::null());
            // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
            SHChangeNotify(0x08000000, 0x0000, std::ptr::null(), std::ptr::null());
        }
    }

    println!("[FitRepacks Backend] [Folder Cover] Successfully set Windows Explorer icon for: {}", folder_path);
    Ok(true)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RealTorrentFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: String,
    pub bytes: u64,
    pub is_optional: bool,
    pub is_selected: bool,
    pub file_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RealTorrentMetadata {
    pub name: String,
    pub info_hash: String,
    pub total_size: String,
    pub total_bytes: u64,
    pub piece_length: u64,
    pub files_count: usize,
    pub files: Vec<RealTorrentFile>,
}

#[derive(Debug, Clone)]
enum BValue {
    Int(i64),
    Bytes(Vec<u8>),
    List(Vec<BValue>),
    Dict(std::collections::BTreeMap<String, BValue>),
}

fn parse_bval(bytes: &[u8], idx: &mut usize) -> Option<BValue> {
    if *idx >= bytes.len() {
        return None;
    }
    match bytes[*idx] {
        b'i' => {
            *idx += 1;
            let start = *idx;
            while *idx < bytes.len() && bytes[*idx] != b'e' {
                *idx += 1;
            }
            if *idx >= bytes.len() {
                return None;
            }
            let s = std::str::from_utf8(&bytes[start..*idx]).ok()?;
            *idx += 1;
            let val: i64 = s.parse().ok()?;
            Some(BValue::Int(val))
        }
        b'l' => {
            *idx += 1;
            let mut list = Vec::new();
            while *idx < bytes.len() && bytes[*idx] != b'e' {
                let val = parse_bval(bytes, idx)?;
                list.push(val);
            }
            if *idx < bytes.len() {
                *idx += 1;
            }
            Some(BValue::List(list))
        }
        b'd' => {
            *idx += 1;
            let mut map = std::collections::BTreeMap::new();
            while *idx < bytes.len() && bytes[*idx] != b'e' {
                let key_val = parse_bval(bytes, idx)?;
                let key = match key_val {
                    BValue::Bytes(b) => String::from_utf8_lossy(&b).to_string(),
                    _ => return None,
                };
                let val = parse_bval(bytes, idx)?;
                map.insert(key, val);
            }
            if *idx < bytes.len() {
                *idx += 1;
            }
            Some(BValue::Dict(map))
        }
        b'0'..=b'9' => {
            let start = *idx;
            while *idx < bytes.len() && bytes[*idx] != b':' {
                *idx += 1;
            }
            if *idx >= bytes.len() {
                return None;
            }
            let len_str = std::str::from_utf8(&bytes[start..*idx]).ok()?;
            let len: usize = len_str.parse().ok()?;
            *idx += 1;
            if *idx + len > bytes.len() {
                return None;
            }
            let slice = bytes[*idx..*idx + len].to_vec();
            *idx += len;
            Some(BValue::Bytes(slice))
        }
        _ => None,
    }
}

fn format_bytes_to_str(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.2} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

#[command]
fn fetch_torrent_metadata(magnet_or_hash: String) -> Result<RealTorrentMetadata, String> {
    // 1. Extract hash (40-char hex)
    let hash = if magnet_or_hash.starts_with("magnet:") {
        let re_hash = magnet_or_hash
            .split("xt=urn:btih:")
            .nth(1)
            .and_then(|s| s.split('&').next())
            .ok_or_else(|| "Invalid magnet link: missing BTIH hash".to_string())?
            .to_string();
        re_hash
    } else {
        magnet_or_hash.trim().to_string()
    };

    let uppercase_hash = hash.to_uppercase();

    // 2. Fetch .torrent file from public caches
    let cache_urls = vec![
        format!("https://itorrents.org/torrent/{}.torrent", uppercase_hash),
        format!("https://btcache.me/torrent/{}", uppercase_hash),
        format!("http://torrage.info/torrent.php?h={}", uppercase_hash),
    ];

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let mut torrent_bytes: Option<Vec<u8>> = None;

    for url in cache_urls {
        if let Ok(res) = client.get(&url).send() {
            if res.status().is_success() {
                if let Ok(bytes) = res.bytes() {
                    if bytes.len() > 100 && bytes[0] == b'd' {
                        torrent_bytes = Some(bytes.to_vec());
                        break;
                    }
                }
            }
        }
    }

    let bytes = torrent_bytes.ok_or_else(|| {
        format!(
            "Could not fetch torrent metadata for hash '{}' from torrent caches.",
            hash
        )
    })?;

    // 3. Parse bencode
    let mut idx = 0;
    let root = parse_bval(&bytes, &mut idx)
        .ok_or_else(|| "Failed to decode torrent bencode structure".to_string())?;

    let root_dict = match root {
        BValue::Dict(d) => d,
        _ => return Err("Invalid torrent file root (not a dictionary)".to_string()),
    };

    let info_dict = match root_dict.get("info") {
        Some(BValue::Dict(d)) => d,
        _ => return Err("Torrent missing 'info' dictionary".to_string()),
    };

    let torrent_name = match info_dict.get("name") {
        Some(BValue::Bytes(b)) => String::from_utf8_lossy(b).to_string(),
        _ => "Torrent Repack".to_string(),
    };

    let piece_length = match info_dict.get("piece length") {
        Some(BValue::Int(p)) => *p as u64,
        _ => 0,
    };

    let mut files: Vec<RealTorrentFile> = Vec::new();
    let mut total_bytes: u64 = 0;

    // Check if multi-file or single-file torrent
    if let Some(BValue::List(files_list)) = info_dict.get("files") {
        for (i, file_val) in files_list.iter().enumerate() {
            if let BValue::Dict(f_dict) = file_val {
                let length = match f_dict.get("length") {
                    Some(BValue::Int(l)) => *l as u64,
                    _ => 0,
                };
                total_bytes += length;

                let path_str = if let Some(BValue::List(p_list)) = f_dict.get("path") {
                    let parts: Vec<String> = p_list
                        .iter()
                        .filter_map(|p| match p {
                            BValue::Bytes(b) => Some(String::from_utf8_lossy(b).to_string()),
                            _ => None,
                        })
                        .collect();
                    parts.join("/")
                } else {
                    format!("file_{}", i)
                };

                let file_name = path_str.split('/').last().unwrap_or(&path_str).to_string();
                let lower_name = file_name.to_lowercase();

                let is_selective_lang = lower_name.contains("selective-")
                    || lower_name.contains("optional-") && (
                        lower_name.contains("english")
                            || lower_name.contains("french")
                            || lower_name.contains("german")
                            || lower_name.contains("spanish")
                            || lower_name.contains("russian")
                            || lower_name.contains("japanese")
                            || lower_name.contains("chinese")
                            || lower_name.contains("italian")
                            || lower_name.contains("korean")
                            || lower_name.contains("polish")
                            || lower_name.contains("portuguese")
                            || lower_name.contains("brazilian")
                            || lower_name.contains("arabic")
                    );

                let is_bonus = lower_name.contains("bonus")
                    || lower_name.contains("credits")
                    || lower_name.contains("4k")
                    || lower_name.contains("soundtrack")
                    || lower_name.contains("artbook");

                let is_installer = lower_name.ends_with(".exe") || lower_name == "setup.exe";
                let is_tool = lower_name.ends_with(".md5") || lower_name.ends_with(".bat") || lower_name.ends_with(".ini");

                let (file_type, is_optional, is_selected) = if is_installer {
                    ("installer", false, true)
                } else if is_tool {
                    ("tool", false, true)
                } else if is_selective_lang {
                    let is_english = lower_name.contains("english");
                    ("selective_language", true, is_english)
                } else if is_bonus {
                    ("optional_bonus", true, false)
                } else if lower_name.contains("optional") {
                    ("optional_bonus", true, false)
                } else {
                    ("data", false, true)
                };

                files.push(RealTorrentFile {
                    id: format!("real-f-{}", i + 1),
                    name: file_name,
                    path: path_str,
                    size: format_bytes_to_str(length),
                    bytes: length,
                    is_optional,
                    is_selected,
                    file_type: file_type.to_string(),
                });
            }
        }
    } else {
        // Single file
        let length = match info_dict.get("length") {
            Some(BValue::Int(l)) => *l as u64,
            _ => 0,
        };
        total_bytes = length;
        files.push(RealTorrentFile {
            id: "real-f-1".to_string(),
            name: torrent_name.clone(),
            path: torrent_name.clone(),
            size: format_bytes_to_str(length),
            bytes: length,
            is_optional: false,
            is_selected: true,
            file_type: "data".to_string(),
        });
    }

    Ok(RealTorrentMetadata {
        name: torrent_name,
        info_hash: uppercase_hash,
        total_size: format_bytes_to_str(total_bytes),
        total_bytes,
        piece_length,
        files_count: files.len(),
        files,
    })
}

use librqbit::{Session, SessionOptions, AddTorrent, AddTorrentOptions};
use librqbit::limits::LimitsConfig;
use std::num::NonZeroU32;
use std::sync::Arc;
use tokio::sync::RwLock;

static TORRENT_SESSION: RwLock<Option<Arc<Session>>> = RwLock::const_new(None);

async fn get_or_init_torrent_session(download_dir: &str) -> Result<Arc<Session>, String> {
    let mut lock = TORRENT_SESSION.write().await;
    if let Some(ref session) = *lock {
        return Ok(Arc::clone(session));
    }

    println!("[FitRepacks BitTorrent] Initializing new BitTorrent engine session in: {}", download_dir);
    let out_dir = PathBuf::from(download_dir);
    if !out_dir.exists() {
        let _ = fs::create_dir_all(&out_dir);
    }

    // Read speed limits and apply them at session creation
    let ratelimits = read_speed_limits();

    let mut session_opts = SessionOptions::default();
    session_opts.ratelimits = ratelimits;
    session_opts.disable_dht_persistence = true;
    session_opts.fastresume = true;

    let persistence_folder = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("FitRepacks Library")
        .join("torrent_session");
    if !persistence_folder.exists() {
        let _ = fs::create_dir_all(&persistence_folder);
    }
    session_opts.persistence = Some(librqbit::SessionPersistenceConfig::Json {
        folder: Some(persistence_folder),
    });

    let session = Session::new_with_opts(out_dir, session_opts)
        .await
        .map_err(|e| {
            println!("[FitRepacks BitTorrent] Failed to create Session: {:?}", e);
            format!("Failed to create BitTorrent session: {:?}", e)
        })?;

    println!("[FitRepacks BitTorrent] BitTorrent engine session started successfully.");
    *lock = Some(Arc::clone(&session));
    Ok(session)
}

fn read_speed_limits() -> LimitsConfig {
    LimitsConfig::default()
}

/// Update speed limits on the live session without restarting it.
#[command]
async fn set_torrent_speed_limits(
    download_kbps: u64,
    upload_kbps: u64,
) -> Result<(), String> {
    let kbps_to_bps = |kbps: u64| -> Option<NonZeroU32> {
        if kbps == 0 { return None; }
        NonZeroU32::new((kbps * 1024).min(u32::MAX as u64) as u32)
    };

    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        session.ratelimits.set_download_bps(kbps_to_bps(download_kbps));
        session.ratelimits.set_upload_bps(kbps_to_bps(upload_kbps));
        println!(
            "[FitRepacks BitTorrent] Speed limits updated: download={}kbps upload={}kbps",
            download_kbps, upload_kbps
        );
    } else {
        println!("[FitRepacks BitTorrent] set_torrent_speed_limits: no active session yet; limits will apply on next session start.");
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TorrentLiveStats {
    pub info_hash: String,
    pub name: String,
    pub progress_percent: f64,
    pub download_speed_bytes: u64,
    pub upload_speed_bytes: u64,
    pub download_speed_formatted: String,
    pub upload_speed_formatted: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub downloaded_formatted: String,
    pub total_formatted: String,
    pub status: String,
    pub eta: String,
    pub peers: usize,
    pub file_progress_bytes: Vec<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AggregateBandwidthStats {
    pub total_down_speed_formatted: String,
    pub total_up_speed_formatted: String,
    pub total_down_speed_bytes: u64,
    pub total_up_speed_bytes: u64,
    pub active_downloads_count: usize,
    pub torrents: Vec<TorrentLiveStats>,
}

#[command]
async fn start_torrent_download(
    magnet_url: String,
    download_dir: String,
    selected_file_indices: Option<Vec<usize>>,
) -> Result<String, String> {
    println!("[FitRepacks BitTorrent] [Add Torrent] Starting download in folder: {}", download_dir);
    if let Some(ref indices) = selected_file_indices {
        println!("[FitRepacks BitTorrent] [Add Torrent] Selective file filter active: {} files selected", indices.len());
    } else {
        println!("[FitRepacks BitTorrent] [Add Torrent] All files in torrent selected");
    }

    let session = get_or_init_torrent_session(&download_dir).await?;

    let add_torrent = AddTorrent::from_url(&magnet_url);
    let mut opts = AddTorrentOptions::default();
    opts.output_folder = Some(download_dir.clone());
    opts.overwrite = true;

    if let Some(indices) = selected_file_indices {
        opts.only_files = Some(indices.into_iter().map(|i| i as usize).collect());
    }

    let response = session
        .add_torrent(add_torrent, Some(opts))
        .await
        .map_err(|e| {
            println!("[FitRepacks BitTorrent] [Add Torrent] Error adding torrent: {:?}", e);
            format!("Failed to add torrent: {:?}", e)
        })?;

    let info_hash = match response {
        librqbit::AddTorrentResponse::Added(_, handle) => {
            let h = handle.info_hash().as_string();
            println!("[FitRepacks BitTorrent] [Add Torrent] Added new torrent: hash={}", h);
            h
        },
        librqbit::AddTorrentResponse::AlreadyManaged(_, handle) => {
            let h = handle.info_hash().as_string();
            println!("[FitRepacks BitTorrent] [Add Torrent] Torrent already managed in session: hash={}", h);
            h
        },
        librqbit::AddTorrentResponse::ListOnly(_) => {
            println!("[FitRepacks BitTorrent] [Add Torrent] List only response received");
            "list_only".to_string()
        },
    };
    Ok(info_hash)
}

#[command]
async fn pause_torrent_download(info_hash: String) -> Result<bool, String> {
    println!("[FitRepacks BitTorrent] [Pause] Request to pause hash={}", info_hash);
    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        let handle_opt = session.with_torrents(|iter| {
            for (_id, handle) in iter {
                if handle.info_hash().as_string() == info_hash {
                    return Some(handle.clone());
                }
            }
            None
        });
        if let Some(handle) = handle_opt {
            session.pause(&handle).await.map_err(|e| {
                println!("[FitRepacks BitTorrent] [Pause] Error pausing handle: {:?}", e);
                format!("{:?}", e)
            })?;
            println!("[FitRepacks BitTorrent] [Pause] Successfully paused hash={}", info_hash);
            return Ok(true);
        }
    }
    println!("[FitRepacks BitTorrent] [Pause] Handle not found for hash={}", info_hash);
    Ok(false)
}

#[command]
async fn resume_torrent_download(info_hash: String) -> Result<bool, String> {
    println!("[FitRepacks BitTorrent] [Resume] Request to resume/unpause hash={}", info_hash);
    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        let handle_opt = session.with_torrents(|iter| {
            for (_id, handle) in iter {
                if handle.info_hash().as_string() == info_hash {
                    return Some(handle.clone());
                }
            }
            None
        });
        if let Some(handle) = handle_opt {
            session.unpause(&handle).await.map_err(|e| {
                println!("[FitRepacks BitTorrent] [Resume] Error unpausing handle: {:?}", e);
                format!("{:?}", e)
            })?;
            println!("[FitRepacks BitTorrent] [Resume] Successfully resumed hash={}", info_hash);
            return Ok(true);
        }
    }
    println!("[FitRepacks BitTorrent] [Resume] Handle not found for hash={}", info_hash);
    Ok(false)
}

#[command]
async fn cancel_torrent_download(info_hash: String) -> Result<bool, String> {
    println!("[FitRepacks BitTorrent] [Cancel] Removing torrent from session hash={}", info_hash);
    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        let handle_opt = session.with_torrents(|iter| {
            for (_id, handle) in iter {
                if handle.info_hash().as_string().eq_ignore_ascii_case(&info_hash) {
                    return Some(handle.clone());
                }
            }
            None
        });
        if let Some(handle) = handle_opt {
            session.delete(handle.info_hash().into(), false).await.map_err(|e| {
                println!("[FitRepacks BitTorrent] [Cancel] Error deleting torrent: {:?}", e);
                format!("{:?}", e)
            })?;
            println!("[FitRepacks BitTorrent] [Cancel] Deleted torrent from swarm: hash={}", info_hash);
            return Ok(true);
        }
    }
    Ok(false)
}

#[command]
async fn release_torrent_for_install(info_hash: String) -> Result<bool, String> {
    println!("[FitRepacks BitTorrent] [Release For Install] Releasing session and file handles for hash={}", info_hash);
    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        let handle_opt = session.with_torrents(|iter| {
            for (_id, handle) in iter {
                if handle.info_hash().as_string().eq_ignore_ascii_case(&info_hash) {
                    return Some(handle.clone());
                }
            }
            None
        });
        if let Some(handle) = handle_opt {
            session.delete(handle.info_hash().into(), false).await.map_err(|e| {
                println!("[FitRepacks BitTorrent] [Release For Install] Error unloading torrent handle: {:?}", e);
                format!("{:?}", e)
            })?;
            println!("[FitRepacks BitTorrent] [Release For Install] Successfully released torrent handle and file locks for hash={}", info_hash);
            // Brief sleep to allow OS kernel to finish closing all file handles
            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
            return Ok(true);
        }
    }
    Ok(false)
}

#[command]
async fn recheck_torrent_download(
    info_hash: String,
    magnet_url: String,
    download_dir: String,
    selected_file_indices: Option<Vec<usize>>,
) -> Result<String, String> {
    println!("[FitRepacks BitTorrent] [Recheck] Rechecking torrent hash={} in dir={}", info_hash, download_dir);
    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        let handle_opt = session.with_torrents(|iter| {
            for (_id, handle) in iter {
                if handle.info_hash().as_string() == info_hash {
                    return Some(handle.clone());
                }
            }
            None
        });
        if let Some(handle) = handle_opt {
            let _ = session.delete(handle.info_hash().into(), false).await;
            println!("[FitRepacks BitTorrent] [Recheck] Unloaded handle for recheck: hash={}", info_hash);
        }
    }
    drop(lock);

    start_torrent_download(magnet_url, download_dir, selected_file_indices).await
}

#[command]
async fn get_all_torrent_stats() -> Result<AggregateBandwidthStats, String> {
    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        let torrents: Vec<TorrentLiveStats> = session.with_torrents(|torrents_iter| {
            let mut list = Vec::new();
            for (_id, handle) in torrents_iter {
                let stats = handle.stats();
                let down_speed = stats.live.as_ref().map(|l| (l.download_speed.mbps * 1024.0 * 1024.0) as u64).unwrap_or(0);
                let up_speed = stats.live.as_ref().map(|l| (l.upload_speed.mbps * 1024.0 * 1024.0) as u64).unwrap_or(0);

                let downloaded = stats.progress_bytes.min(stats.total_bytes);
                let total = stats.total_bytes;
                let progress_percent = if total > 0 {
                    ((downloaded as f64 / total as f64) * 100.0).min(100.0)
                } else {
                    0.0
                };

                let peers = stats.live.as_ref().map(|l| l.snapshot.peer_stats.live).unwrap_or(0);

                let is_initializing = matches!(stats.state, librqbit::TorrentStatsState::Initializing);

                let eta = if is_initializing {
                    "Rehashing / Checking...".to_string()
                } else if down_speed > 0 && total > downloaded {
                    let rem_bytes = total - downloaded;
                    let rem_secs = rem_bytes / down_speed;
                    if rem_secs > 3600 {
                        format!("{}h {}m", rem_secs / 3600, (rem_secs % 3600) / 60)
                    } else if rem_secs > 60 {
                        format!("{}m {}s", rem_secs / 60, rem_secs % 60)
                    } else {
                        format!("{}s", rem_secs)
                    }
                } else if progress_percent >= 100.0 {
                    "Completed".to_string()
                } else {
                    "Connecting...".to_string()
                };

                let status_str = match stats.state {
                    librqbit::TorrentStatsState::Initializing => "checking".to_string(),
                    librqbit::TorrentStatsState::Paused => "paused".to_string(),
                    librqbit::TorrentStatsState::Error => "error".to_string(),
                    librqbit::TorrentStatsState::Live => {
                        if progress_percent >= 100.0 {
                            "completed".to_string()
                        } else {
                            "downloading".to_string()
                        }
                    }
                };

                // let fetched_bytes = stats.live.as_ref().map(|l| l.snapshot.fetched_bytes).unwrap_or(0);
                
                // println!(
                //     "[FitRepacks BitTorrent] [Stats] name=\"{}\" hash={} status={} progress={:.2}% ({}/{}) down={}/s up={}/s peers={} fetched_raw={} verified_progress={} file_progress_entries={:?}",
                //     handle.name().unwrap_or_else(|| "Torrent".to_string()),
                //     handle.info_hash().as_string(),
                //     status_str,
                //     progress_percent,
                //     format_bytes_to_str(downloaded),
                //     format_bytes_to_str(total),
                //     format_bytes_to_str(down_speed),
                //     format_bytes_to_str(up_speed),
                //     peers,
                //     format_bytes_to_str(fetched_bytes),
                //     format_bytes_to_str(stats.progress_bytes),
                //     stats.file_progress
                // );

                list.push(TorrentLiveStats {
                    info_hash: handle.info_hash().as_string(),
                    name: handle.name().unwrap_or_else(|| "Torrent".to_string()),
                    progress_percent,
                    download_speed_bytes: down_speed,
                    upload_speed_bytes: up_speed,
                    download_speed_formatted: format!("{}/s", format_bytes_to_str(down_speed)),
                    upload_speed_formatted: format!("{}/s", format_bytes_to_str(up_speed)),
                    downloaded_bytes: downloaded,
                    total_bytes: total,
                    downloaded_formatted: format_bytes_to_str(downloaded),
                    total_formatted: format_bytes_to_str(total),
                    status: status_str,
                    eta,
                    peers,
                    file_progress_bytes: stats.file_progress.clone(),
                });
            }
            list
        });

        let mut total_down: u64 = 0;
        let mut total_up: u64 = 0;
        let mut active_count = 0;
        for t in &torrents {
            total_down += t.download_speed_bytes;
            total_up += t.upload_speed_bytes;
            if t.status == "downloading" {
                active_count += 1;
            }
        }

        return Ok(AggregateBandwidthStats {
            total_down_speed_formatted: format!("{}/s", format_bytes_to_str(total_down)),
            total_up_speed_formatted: format!("{}/s", format_bytes_to_str(total_up)),
            total_down_speed_bytes: total_down,
            total_up_speed_bytes: total_up,
            active_downloads_count: active_count,
            torrents,
        });
    }

    Ok(AggregateBandwidthStats {
        total_down_speed_formatted: "0.0 B/s".to_string(),
        total_up_speed_formatted: "0.0 B/s".to_string(),
        total_down_speed_bytes: 0,
        total_up_speed_bytes: 0,
        active_downloads_count: 0,
        torrents: Vec::new(),
    })
}

#[cfg(target_os = "windows")]
fn register_windows_aumid() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;

    #[link(name = "shell32")]
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }

    let aumid = "com.fitrepacks.library";
    let wide_id: Vec<u16> = OsStr::new(aumid)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(wide_id.as_ptr());
    }

    // Ensure HKCU\Software\Classes\AppUserModelId registry key exists so Windows Toast displays app name
    let _ = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "$a='com.fitrepacks.library'; $p=\"HKCU:\\Software\\Classes\\AppUserModelId\\$a\"; if (!(Test-Path $p)) { New-Item -Path $p -Force | Out-Null; Set-ItemProperty -Path $p -Name 'DisplayName' -Value 'FitRepacks Library' | Out-Null; Set-ItemProperty -Path $p -Name 'ShowInSettings' -Value 1 -Type DWord | Out-Null; }"
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn();
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShortcutTargetInfo {
    pub shortcut_path: String,
    pub target_exe: String,
    pub working_dir: String,
    pub name: String,
}

#[command]
fn find_installer_exe(folder_path: String) -> Result<Option<String>, String> {
    let dir = Path::new(&folder_path);
    if !dir.exists() || !dir.is_dir() {
        return Ok(None);
    }

    let mut found_setup: Option<String> = None;
    let mut found_install: Option<String> = None;
    let mut found_any_exe: Option<String> = None;

    let scan_dir = |d: &Path, setup_out: &mut Option<String>, install_out: &mut Option<String>, any_out: &mut Option<String>| {
        if let Ok(entries) = fs::read_dir(d) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().and_then(|s| s.to_str()).map(|ext| ext.eq_ignore_ascii_case("exe")).unwrap_or(false) {
                    let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    let full = p.to_string_lossy().to_string();

                    if name == "setup.exe" {
                        if setup_out.is_none() {
                            *setup_out = Some(full);
                        }
                    } else if name == "install.exe" || name.contains("setup") || name.contains("installer") {
                        if install_out.is_none() {
                            *install_out = Some(full);
                        }
                    } else if any_out.is_none() {
                        *any_out = Some(full);
                    }
                }
            }
        }
    };

    // 1. Check direct folder
    scan_dir(dir, &mut found_setup, &mut found_install, &mut found_any_exe);

    // 2. If nothing found directly, check immediate subdirectories
    if found_setup.is_none() && found_install.is_none() && found_any_exe.is_none() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    scan_dir(&p, &mut found_setup, &mut found_install, &mut found_any_exe);
                    if found_setup.is_some() {
                        break;
                    }
                }
            }
        }
    }

    if let Some(setup) = found_setup {
        Ok(Some(setup))
    } else if let Some(install) = found_install {
        Ok(Some(install))
    } else {
        Ok(found_any_exe)
    }
}

#[command]
fn open_folder_in_explorer(folder_path: String) -> Result<(), String> {
    let mut path = PathBuf::from(&folder_path);

    // If the path doesn't exist, try its parent directory
    if !path.exists() {
        if let Some(parent) = path.parent() {
            if parent.exists() {
                path = parent.to_path_buf();
            }
        }
    }

    // Ensure directory exists
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("explorer");
        cmd.arg(path.as_os_str());
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.spawn().map_err(|e| format!("Failed to open Explorer: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path.as_os_str()).spawn().map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(path.as_os_str()).spawn().map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }
}

#[command]
fn get_desktop_shortcuts() -> Result<Vec<String>, String> {
    let mut list = Vec::new();
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        let user_desktop = PathBuf::from(user_profile).join("Desktop");
        if user_desktop.exists() {
            if let Ok(entries) = fs::read_dir(user_desktop) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
                        list.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    let public_desktop = PathBuf::from("C:\\Users\\Public\\Desktop");
    if public_desktop.exists() {
        if let Ok(entries) = fs::read_dir(public_desktop) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
                    list.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(list)
}

#[command]
fn resolve_shortcut_target(shortcut_path: String) -> Result<ShortcutTargetInfo, String> {
    let ps_cmd = format!(
        "$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut('{}'); @{{ TargetPath = $s.TargetPath; WorkingDirectory = $s.WorkingDirectory }} | ConvertTo-Json",
        shortcut_path.replace("'", "''")
    );

    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", &ps_cmd]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("PowerShell error: {}", e))?;
    if !output.status.success() {
        return Err("Failed to resolve shortcut".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    #[derive(Deserialize)]
    struct PsResult {
        #[serde(rename = "TargetPath")]
        target_path: Option<String>,
        #[serde(rename = "WorkingDirectory")]
        working_directory: Option<String>,
    }

    let parsed: PsResult = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    let target = parsed.target_path.unwrap_or_default();
    let work_dir = parsed.working_directory.unwrap_or_default();
    let name = Path::new(&shortcut_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Game")
        .to_string();

    Ok(ShortcutTargetInfo {
        shortcut_path,
        target_exe: target,
        working_dir: work_dir,
        name,
    })
}

#[command]
fn get_game_last_modified(path: String) -> Result<u64, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    let metadata = fs::metadata(p).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    Ok(duration.as_millis() as u64)
}

#[command]
fn get_autostart_status() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let ps_cmd = r#"$p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; (Get-ItemProperty -Path $p -Name 'FitRepacksLibrary' -ErrorAction SilentlyContinue) -ne $null"#;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-Command", ps_cmd]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd.output().map_err(|e| e.to_string())?;
        let res_str = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
        Ok(res_str == "true")
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[command]
fn set_autostart(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let current_exe = std::env::current_exe().map_err(|e| format!("Failed to get current executable path: {}", e))?;
        let exe_str = current_exe.to_string_lossy().replace("'", "''");

        let ps_cmd = if enabled {
            format!(
                r#"$p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Set-ItemProperty -Path $p -Name 'FitRepacksLibrary' -Value '\"{}\"'"#,
                exe_str
            )
        } else {
            r#"$p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Remove-ItemProperty -Path $p -Name 'FitRepacksLibrary' -ErrorAction SilentlyContinue"#.to_string()
        };

        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-Command", &ps_cmd]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(format!(
                "Failed to update startup registry: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(enabled)
    }
}

#[command]
fn get_close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

#[command]
fn set_close_to_tray(enabled: bool) -> bool {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
    enabled
}

#[cfg(target_os = "windows")]
fn update_windows_jumplist(games: &[RecentGameItem]) -> Result<(), String> {
    use windows::{
        core::{Interface, GUID, HSTRING, PCWSTR},
        Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER,
                COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{
                Common::{IObjectArray, IObjectCollection},
                DestinationList, EnumerableObjectCollection, ICustomDestinationList,
                IShellLinkW, PropertiesSystem::{IPropertyStore, PROPERTYKEY},
                ShellLink,
            },
        },
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let dest_list: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("Failed to create DestinationList: {}", e))?;

        let app_id = HSTRING::from("com.fitrepacks.library");
        dest_list
            .SetAppID(PCWSTR(app_id.as_ptr()))
            .map_err(|e| format!("Failed to SetAppID: {}", e))?;

        let mut min_slots = 0u32;
        let _removed: windows::core::Result<IObjectArray> = dest_list.BeginList(&mut min_slots);

        if !games.is_empty() {
            let collection: IObjectCollection =
                CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("Failed to create EnumerableObjectCollection: {}", e))?;

            let pkey_title = PROPERTYKEY {
                fmtid: GUID::from_u128(0xF29F85E0_4FF9_1068_AB91_08002B27B3D9),
                pid: 2,
            };

            let max_slots = if min_slots > 0 { min_slots as usize } else { 5 };
            for g in games.iter().take(max_slots.min(7)) {
                if g.exe_path.trim().is_empty() {
                    continue;
                }

                let link: IShellLinkW = match CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) {
                    Ok(l) => l,
                    Err(_) => continue,
                };

                let exe_h = HSTRING::from(g.exe_path.trim());
                let _ = link.SetPath(PCWSTR(exe_h.as_ptr()));

                if let Some(ref dir) = g.working_dir {
                    if !dir.trim().is_empty() {
                        let dir_h = HSTRING::from(dir.trim());
                        let _ = link.SetWorkingDirectory(PCWSTR(dir_h.as_ptr()));
                    }
                }

                let _ = link.SetIconLocation(PCWSTR(exe_h.as_ptr()), 0);

                if let Ok(prop_store) = link.cast::<IPropertyStore>() {
                    let clean_title = if g.title.trim().is_empty() {
                        "Game"
                    } else {
                        g.title.trim()
                    };
                    let pv = windows::core::PROPVARIANT::from(clean_title);
                    let _ = prop_store.SetValue(&pkey_title, &pv);
                    let _ = prop_store.Commit();
                }

                let _ = collection.AddObject(&link);
            }

            if let Ok(array) = collection.cast::<IObjectArray>() {
                let _ = dest_list.AddUserTasks(&array);
            }
        }

        let _ = dest_list.CommitList();
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn extract_exe_icon(exe_path: &str) -> Option<tauri::image::Image<'static>> {
    use windows::{
        core::{HSTRING, PCWSTR},
        Win32::{
            Graphics::Gdi::{
                CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO,
                BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, HGDIOBJ,
            },
            UI::Shell::ExtractIconExW,
            UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
        },
    };

    if !Path::new(exe_path).exists() {
        return None;
    }

    let exe_h = HSTRING::from(exe_path);
    let mut small_icon = HICON::default();
    let count = unsafe {
        ExtractIconExW(
            PCWSTR(exe_h.as_ptr()),
            0,
            None,
            Some(&mut small_icon),
            1,
        )
    };

    if count == 0 || small_icon.is_invalid() {
        return None;
    }

    let mut icon_info = ICONINFO::default();
    let success = unsafe { GetIconInfo(small_icon, &mut icon_info).is_ok() };
    if !success {
        unsafe {
            let _ = DestroyIcon(small_icon);
        }
        return None;
    }

    let hbm_color = icon_info.hbmColor;
    let hbm_mask = icon_info.hbmMask;

    let res = (|| {
        unsafe {
            let hdc = CreateCompatibleDC(HDC::default());
            if hdc.is_invalid() {
                return None;
            }

            let width = 16i32;
            let height = 16i32;
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height, // top-down DIB
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };

            let mut bgra_buf: Vec<u8> = vec![0u8; (width * height * 4) as usize];
            let lines = GetDIBits(
                hdc,
                hbm_color,
                0,
                height as u32,
                Some(bgra_buf.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );

            let _ = DeleteDC(hdc);

            if lines == 0 {
                return None;
            }

            // Convert BGRA to RGBA
            let mut rgba_buf = vec![0u8; bgra_buf.len()];
            let mut has_alpha = false;
            for i in (0..bgra_buf.len()).step_by(4) {
                rgba_buf[i] = bgra_buf[i + 2];     // R
                rgba_buf[i + 1] = bgra_buf[i + 1]; // G
                rgba_buf[i + 2] = bgra_buf[i];     // B
                rgba_buf[i + 3] = bgra_buf[i + 3]; // A
                if rgba_buf[i + 3] > 0 {
                    has_alpha = true;
                }
            }

            // If alpha channel is completely 0, make it fully opaque
            if !has_alpha {
                for i in (0..rgba_buf.len()).step_by(4) {
                    rgba_buf[i + 3] = 255;
                }
            }

            Some(tauri::image::Image::new_owned(rgba_buf, width as u32, height as u32))
        }
    })();

    unsafe {
        let _ = DestroyIcon(small_icon);
        if !hbm_color.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
        }
        if !hbm_mask.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
        }
    }

    res
}

fn get_game_icon(game: &RecentGameItem) -> Option<tauri::image::Image<'static>> {
    // 1. Try folder.ico in working directory or exe directory
    let check_dirs = [
        game.working_dir.as_ref().map(PathBuf::from),
        Path::new(&game.exe_path).parent().map(|p| p.to_path_buf()),
    ];
    for dir_opt in check_dirs.into_iter().flatten() {
        let ico = dir_opt.join("folder.ico");
        if ico.exists() {
            if let Ok(bytes) = fs::read(&ico) {
                if let Ok(img) = image::load_from_memory(&bytes) {
                    let resized = img
                        .resize_exact(16, 16, image::imageops::FilterType::Lanczos3)
                        .to_rgba8();
                    return Some(tauri::image::Image::new_owned(resized.into_raw(), 16, 16));
                }
            }
        }
    }

    // 2. On Windows, extract icon directly from the game's executable
    #[cfg(target_os = "windows")]
    {
        if let Some(img) = extract_exe_icon(&game.exe_path) {
            return Some(img);
        }
    }

    // 3. Try base64 cover URL if available
    if let Some(ref cover) = game.cover_url {
        if cover.starts_with("data:image/") {
            if let Some(b64) = cover.split(',').nth(1) {
                use base64::Engine;
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                    if let Ok(img) = image::load_from_memory(&bytes) {
                        let resized = img
                            .resize_exact(16, 16, image::imageops::FilterType::Lanczos3)
                            .to_rgba8();
                        return Some(tauri::image::Image::new_owned(resized.into_raw(), 16, 16));
                    }
                }
            }
        }
    }

    None
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    games: &[RecentGameItem],
    downloads: &[TrayDownloadItem],
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    use tauri::menu::IconMenuItem;

    let show_item = MenuItem::with_id(app, "show", "Show FitRepacks Library", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit FitRepacks", true, None::<&str>)?;

    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    items.push(Box::new(show_item));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // Downloads section
    if !downloads.is_empty() {
        let active_count = downloads.iter().filter(|d| d.status == "downloading").count();
        let header_title = if active_count > 0 {
            format!("── Downloads ({} Active) ──", active_count)
        } else {
            format!("── Downloads ({}) ──", downloads.len())
        };
        let dl_header = MenuItem::with_id(app, "header_downloads", &header_title, false, None::<&str>)?;
        items.push(Box::new(dl_header));

        for d in downloads.iter().take(5) {
            let item_id = format!("open_download:{}", d.id);
            let display_title = if d.status == "paused" {
                format!("{} - Paused ({:.0}%)", d.title, d.progress)
            } else if d.status == "checking" {
                format!("{} - Checking...", d.title)
            } else if d.status == "completed" {
                format!("{} - Completed", d.title)
            } else {
                format!("{} - {:.0}% ({})", d.title, d.progress, d.speed)
            };
            let dl_item = MenuItem::with_id(app, &item_id, &display_title, true, None::<&str>)?;
            items.push(Box::new(dl_item));
        }

        let open_dl_item = MenuItem::with_id(app, "open_downloads", "View All Downloads", true, None::<&str>)?;
        items.push(Box::new(open_dl_item));
        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }

    // Recent games section
    if !games.is_empty() {
        let recent_header = MenuItem::with_id(
            app,
            "header_recent",
            "── Recent Games ──",
            false,
            None::<&str>,
        )?;
        items.push(Box::new(recent_header));

        for g in games.iter().take(5) {
            let item_id = format!("play_game:{}", g.id);
            let item_title = g.title.trim().to_string();

            if let Some(icon) = get_game_icon(g) {
                if let Ok(icon_item) =
                    IconMenuItem::with_id(app, &item_id, &item_title, true, Some(icon), None::<&str>)
                {
                    items.push(Box::new(icon_item));
                    continue;
                }
            }

            let item = MenuItem::with_id(app, &item_id, &item_title, true, None::<&str>)?;
            items.push(Box::new(item));
        }

        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }

    items.push(Box::new(quit_item));

    let item_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &item_refs)
}

#[command]
fn update_recent_games(
    app: tauri::AppHandle,
    games: Vec<RecentGameItem>,
) -> Result<(), String> {
    if let Ok(mut lock) = RECENT_GAMES.lock() {
        *lock = games.clone();
    }

    let downloads = if let Ok(lock) = TRAY_DOWNLOADS.lock() {
        lock.clone()
    } else {
        Vec::new()
    };

    if let Some(tray) = app.tray_by_id("main_tray") {
        if let Ok(menu) = build_tray_menu(&app, &games, &downloads) {
            let _ = tray.set_menu(Some(menu));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = update_windows_jumplist(&games);
    }

    Ok(())
}

#[command]
fn update_tray_downloads(
    app: tauri::AppHandle,
    downloads: Vec<TrayDownloadItem>,
) -> Result<(), String> {
    if let Ok(mut lock) = TRAY_DOWNLOADS.lock() {
        *lock = downloads.clone();
    }

    let games = if let Ok(lock) = RECENT_GAMES.lock() {
        lock.clone()
    } else {
        Vec::new()
    };

    if let Some(tray) = app.tray_by_id("main_tray") {
        if let Ok(menu) = build_tray_menu(&app, &games, &downloads) {
            let _ = tray.set_menu(Some(menu));
        }

        // Update Tray Icon Tooltip
        if downloads.is_empty() {
            let _ = tray.set_tooltip(Some("FitRepacks Library & Launcher"));
        } else {
            let active = downloads.iter().filter(|d| d.status == "downloading").count();
            if active > 0 {
                let total_progress: f64 = downloads.iter().map(|d| d.progress).sum::<f64>() / downloads.len() as f64;
                let _ = tray.set_tooltip(Some(format!(
                    "FitRepacks Library - Downloading ({} active): {:.0}%",
                    active, total_progress
                )));
            } else {
                let _ = tray.set_tooltip(Some(format!(
                    "FitRepacks Library - Downloads Paused ({})",
                    downloads.len()
                )));
            }
        }
    }

    Ok(())
}

#[command]
fn is_dev_mode() -> bool {
    cfg!(debug_assertions)
}

#[command]
fn close_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    } else if let Some(wv_win) = app.get_webview_window(&label) {
        wv_win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
fn set_webview_bounds(
    app: tauri::AppHandle,
    label: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.set_position(tauri::LogicalPosition::new(x as f64, y as f64));
        let _ = webview.set_size(tauri::LogicalSize::new(width as f64, height as f64));
    }
    Ok(())
}

#[command]
fn eval_in_webview(app: tauri::AppHandle, label: String, script: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())
    } else if let Some(webview_window) = app.get_webview_window(&label) {
        webview_window.eval(&script).map_err(|e| e.to_string())
    } else {
        Err(format!("Webview '{}' not found", label))
    }
}

#[command]
fn get_webview_url(app: tauri::AppHandle, label: String) -> Result<String, String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.url().map(|u| u.to_string()).map_err(|e| e.to_string())
    } else if let Some(webview_window) = app.get_webview_window(&label) {
        webview_window.url().map(|u| u.to_string()).map_err(|e| e.to_string())
    } else {
        Err(format!("Webview '{}' not found", label))
    }
}

#[command]
fn navigate_webview(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(parsed_url) = url.parse::<tauri::Url>() {
            let _ = webview.navigate(parsed_url);
        } else {
            let script = format!("window.location.href = {};", serde_json::to_string(&url).unwrap_or_default());
            let _ = webview.eval(&script);
        }
        return Ok(());
    } else if let Some(wv_win) = app.get_webview_window(&label) {
        if let Ok(parsed_url) = url.parse::<tauri::Url>() {
            let _ = wv_win.navigate(parsed_url);
        } else {
            let script = format!("window.location.href = {};", serde_json::to_string(&url).unwrap_or_default());
            let _ = wv_win.eval(&script);
        }
        return Ok(());
    }
    Err(format!("Webview '{}' not found", label))
}

fn show_and_focus_window(window: &tauri::WebviewWindow) {
    let _ = window.show();
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.set_focus();
}

fn handle_tray_menu_event(app: &tauri::AppHandle, id_str: &str) {
    if id_str == "show" {
        if let Some(window) = app.get_webview_window("main") {
            show_and_focus_window(&window);
        }
    } else if id_str == "quit" {
        std::process::exit(0);
    } else if id_str == "open_downloads" || id_str.starts_with("open_download:") {
        let _ = app.emit("tray-open-downloads", ());
        if let Some(window) = app.get_webview_window("main") {
            show_and_focus_window(&window);
        }
    } else if let Some(game_id) = id_str.strip_prefix("play_game:") {
        let found = {
            if let Ok(lock) = RECENT_GAMES.lock() {
                lock.iter().find(|g| g.id == game_id).cloned()
            } else {
                None
            }
        };

        let _ = app.emit("tray-launch-game", game_id);

        if let Some(window) = app.get_webview_window("main") {
            show_and_focus_window(&window);
        }

        if let Some(g) = found {
            let _ = launch_game_exe(
                app.clone(),
                g.exe_path,
                g.working_dir,
                Some(g.id),
                None,
                None,
                None,
            );
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    {
        register_windows_aumid();
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .on_menu_event(|app, event| {
            handle_tray_menu_event(app, event.id().as_ref());
        });

    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                show_and_focus_window(&window);
            }
        }));
    }

    builder
        .manage(Mutex::new(AppState {}))
        .setup(|app| {
            let initial_games = {
                if let Ok(lock) = RECENT_GAMES.lock() {
                    lock.clone()
                } else {
                    Vec::new()
                }
            };
            let initial_downloads = {
                if let Ok(lock) = TRAY_DOWNLOADS.lock() {
                    lock.clone()
                } else {
                    Vec::new()
                }
            };
            let menu = build_tray_menu(app.handle(), &initial_games, &initial_downloads)?;

            let mut tray_builder = TrayIconBuilder::with_id("main_tray")
                .tooltip("FitRepacks Library & Launcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    handle_tray_menu_event(app, event.id.as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            let is_minimized = window.is_minimized().unwrap_or(false);
                            if is_visible && !is_minimized {
                                let _ = window.set_focus();
                            } else {
                                show_and_focus_window(&window);
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Never close to tray in development / debug mode
                if !cfg!(debug_assertions) && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            launch_game_exe,
            is_game_running,
            set_folder_cover_icon,
            fetch_torrent_metadata,
            start_torrent_download,
            pause_torrent_download,
            resume_torrent_download,
            cancel_torrent_download,
            release_torrent_for_install,
            recheck_torrent_download,
            get_all_torrent_stats,
            set_torrent_speed_limits,
            find_installer_exe,
            open_folder_in_explorer,
            get_game_last_modified,
            get_desktop_shortcuts,
            resolve_shortcut_target,
            get_autostart_status,
            set_autostart,
            get_close_to_tray,
            set_close_to_tray,
            update_recent_games,
            update_tray_downloads,
            is_dev_mode,
            eval_in_webview,
            navigate_webview,
            get_webview_url,
            close_webview,
            set_webview_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

