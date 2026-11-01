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
static IS_QUITTING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Default)]
struct RunningGameTrack {
    active_exe: String,
    candidate_exes: Vec<String>,
    tracked_pids: Vec<u32>,
}

static RUNNING_GAMES: Mutex<Option<std::collections::HashMap<String, RunningGameTrack>>> = Mutex::new(None);
static RECENT_GAMES: Mutex<Vec<RecentGameItem>> = Mutex::new(Vec::new());
static TRAY_DOWNLOADS: Mutex<Vec<TrayDownloadItem>> = Mutex::new(Vec::new());

#[cfg(target_os = "windows")]
struct SystemProcessSnapshot {
    running_names: std::collections::HashSet<String>,
    parent_to_children: std::collections::HashMap<u32, Vec<u32>>,
    active_pids: std::collections::HashSet<u32>,
}

#[cfg(target_os = "windows")]
fn capture_system_process_snapshot() -> Option<SystemProcessSnapshot> {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::Foundation::INVALID_HANDLE_VALUE;

    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(h) if h != INVALID_HANDLE_VALUE => h,
            _ => return None,
        };

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut running_names = std::collections::HashSet::new();
        let mut parent_to_children = std::collections::HashMap::new();
        let mut active_pids = std::collections::HashSet::new();

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let pid = entry.th32ProcessID;
                let parent_pid = entry.th32ParentProcessID;
                active_pids.insert(pid);
                parent_to_children.entry(parent_pid).or_insert_with(Vec::new).push(pid);

                let len = entry.szExeFile.iter().position(|&ch| ch == 0).unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
                if !exe_name.is_empty() {
                    running_names.insert(exe_name);
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        use windows::Win32::Foundation::CloseHandle;
        let _ = CloseHandle(snapshot);

        Some(SystemProcessSnapshot {
            running_names,
            parent_to_children,
            active_pids,
        })
    }
}

#[cfg(target_os = "windows")]
fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, GetExitCodeProcess};
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut exit_code: u32 = 0;
            let ok = GetExitCodeProcess(handle, &mut exit_code);
            let _ = CloseHandle(handle);
            return ok.is_ok() && exit_code == 259;
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn is_pid_alive(_pid: u32) -> bool {
    false
}

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

fn scan_folder_for_game_exes(
    dir: &Path,
    current_depth: usize,
    max_depth: usize,
    ignored: &[&str],
    candidates: &mut Vec<String>,
) {
    if current_depth > max_depth {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("exe") {
                        if let Some(name) = path.file_name().and_then(|f| f.to_str()) {
                            let lower = name.to_lowercase();
                            if !ignored.contains(&lower.as_str()) && !candidates.contains(&lower) {
                                candidates.push(lower);
                            }
                        }
                    }
                }
            } else if path.is_dir() && current_depth < max_depth {
                let dir_name = path.file_name().and_then(|f| f.to_str()).unwrap_or("").to_lowercase();
                if dir_name != "backup" && dir_name != "redist" && dir_name != "_redist" && dir_name != "__installer" {
                    scan_folder_for_game_exes(&path, current_depth + 1, max_depth, ignored, candidates);
                }
            }
        }
    }
}

fn find_candidate_game_exes(exe_path: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let path = Path::new(exe_path);
    let primary_name = path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !primary_name.is_empty() {
        candidates.push(primary_name.clone());
    }

    let mut search_dirs = Vec::new();
    if let Some(parent) = path.parent() {
        search_dirs.push(parent.to_path_buf());
        if let Some(grandparent) = parent.parent() {
            let parent_name = parent.file_name().and_then(|f| f.to_str()).unwrap_or("").to_lowercase();
            if parent_name == "x64" || parent_name == "x64_plus" || parent_name == "x64_legacy" || parent_name == "bin" || parent_name == "win64" || parent_name == "shipping" {
                search_dirs.push(grandparent.to_path_buf());
                if let Some(ggrandparent) = grandparent.parent() {
                    search_dirs.push(ggrandparent.to_path_buf());
                }
            }
        }
    }

    let lower_path = exe_path.to_lowercase();
    if primary_name.contains("launcher") || primary_name.contains("play") || primary_name.contains("start") {
        if lower_path.contains("witcher") {
            candidates.push("witcher3.exe".to_string());
        }
        if lower_path.contains("cyberpunk") {
            candidates.push("cyberpunk2077.exe".to_string());
        }
        if lower_path.contains("gta") {
            candidates.push("gta5.exe".to_string());
        }
        if lower_path.contains("rdr") {
            candidates.push("rdr2.exe".to_string());
        }
        if lower_path.contains("baldur") || lower_path.contains("bg3") {
            candidates.push("bg3.exe".to_string());
            candidates.push("bg3_dx11.exe".to_string());
        }
    }

    let ignored = [
        "unins000.exe", "uninstall.exe", "uninstaller.exe", "setup.exe",
        "dxsetup.exe", "dxwebsetup.exe", "vc_redist.x64.exe", "vc_redist.x86.exe",
        "vcredist_x64.exe", "vcredist_x86.exe", "crashreporter.exe", "crashmailer.exe",
        "redengineerrorreporter.exe", "rapidcrc.exe", "quicksfv.exe", "7za.exe"
    ];

    for dir in search_dirs {
        scan_folder_for_game_exes(&dir, 0, 3, &ignored, &mut candidates);
    }

    candidates.dedup();
    candidates
}

fn set_game_running_track(gid: &str, active_exe: &str, candidate_exes: Vec<String>, pids: Vec<u32>, is_running: bool) {
    if let Ok(mut lock) = RUNNING_GAMES.lock() {
        let map = lock.get_or_insert_with(std::collections::HashMap::new);
        if is_running {
            map.insert(gid.to_string(), RunningGameTrack {
                active_exe: active_exe.to_string(),
                candidate_exes,
                tracked_pids: pids,
            });
        } else {
            map.remove(gid);
        }
    }
}

fn update_active_game_exe(gid: &str, active_exe: &str) {
    if let Ok(mut lock) = RUNNING_GAMES.lock() {
        if let Some(ref mut map) = *lock {
            if let Some(info) = map.get_mut(gid) {
                info.active_exe = active_exe.to_string();
            }
        }
    }
}

#[command]
fn is_game_running(game_id: String, exe_path: Option<String>) -> bool {
    // 1. Check RUNNING_GAMES registry for this game_id
    if let Ok(lock) = RUNNING_GAMES.lock() {
        if let Some(ref map) = *lock {
            if let Some(info) = map.get(&game_id) {
                if !info.active_exe.is_empty() && is_process_running_by_name(&info.active_exe) {
                    return true;
                }
                for candidate in &info.candidate_exes {
                    if is_process_running_by_name(candidate) {
                        return true;
                    }
                }
                #[cfg(target_os = "windows")]
                for &pid in &info.tracked_pids {
                    if is_pid_alive(pid) {
                        return true;
                    }
                }
                return true;
            }
        }
    }

    // 2. Fallback check using exe_path
    if let Some(ref path) = exe_path {
        if !path.trim().is_empty() {
            if is_process_running_by_name(path) {
                return true;
            }
            let candidates = find_candidate_game_exes(path);
            for candidate in &candidates {
                if is_process_running_by_name(candidate) {
                    return true;
                }
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
    if let Some(ref gid) = game_id {
        if let Ok(mut lock) = ACTIVE_GAME_OVERLAY_INFO.lock() {
            *lock = Some((gid.clone(), "default".to_string(), String::new()));
        }
    }

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
        let mut c = Command::new(&exe_path);
        if let Some(ref args) = runner_args {
            c.args(args);
        }
        c
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

    let child_proc: Option<std::process::Child> = match spawn_result {
        Ok(c) => Some(c),
        Err(ref e)
            if e.raw_os_error() == Some(740)
                || e.to_string().contains("740")
                || e.to_string().contains("elevation")
                || e.raw_os_error() == Some(32)
                || e.to_string().contains("os error 32") =>
        {
            #[cfg(target_os = "windows")]
            {
                use windows::core::{HSTRING, PCWSTR};
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::Shell::ShellExecuteW;
                use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

                let wide_file = HSTRING::from(&exe_path);
                let wide_dir = HSTRING::from(working_directory.to_string_lossy().as_ref());
                let wide_verb = HSTRING::from("runas");
                let wide_args = if let Some(ref args) = runner_args {
                    HSTRING::from(args.join(" "))
                } else {
                    HSTRING::new()
                };

                let hinstance = unsafe {
                    ShellExecuteW(
                        HWND::default(),
                        PCWSTR(wide_verb.as_ptr()),
                        PCWSTR(wide_file.as_ptr()),
                        if wide_args.is_empty() {
                            PCWSTR::null()
                        } else {
                            PCWSTR(wide_args.as_ptr())
                        },
                        PCWSTR(wide_dir.as_ptr()),
                        SW_SHOWNORMAL,
                    )
                };

                if (hinstance.0 as usize) <= 32 {
                    return Err(format!(
                        "Failed launching elevated installer/process {} (ShellExecute error code: {})",
                        exe_path, hinstance.0 as usize
                    ));
                }
                None
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err(format!("Process requires elevation: {}", e));
            }
        }
        Err(err) => return Err(format!("Failed launching process {}: {}", exe_path, err)),
    };

    let initial_pid = child_proc.as_ref().map(|c| c.id());
    let candidate_exes = find_candidate_game_exes(&exe_path);
    let mut initial_pids = Vec::new();
    if let Some(pid) = initial_pid {
        initial_pids.push(pid);
    }

    let gid = game_id.clone();
    let tracked_exe = exe_path.clone();
    if let Some(ref id) = gid {
        set_game_running_track(id, &tracked_exe, candidate_exes.clone(), initial_pids.clone(), true);
    }

    std::thread::spawn(move || {
        let exe_file = Path::new(&tracked_exe)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mut tracked_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();
        for p in initial_pids {
            tracked_pids.insert(p);
        }

        // 1. Give the game process up to 35s startup grace window to appear in process list (covers launcher opening & launching game)
        let mut process_seen = false;
        let mut active_game_exe = exe_file.clone();

        for _ in 0..35 {
            // Check candidate exes
            for candidate in &candidate_exes {
                if is_process_running_by_name(candidate) {
                    process_seen = true;
                    // If a non-launcher candidate (e.g. witcher3.exe) is running, prioritize it!
                    if !candidate.contains("launcher") && !candidate.contains("prelauncher") {
                        active_game_exe = candidate.clone();
                        if let Some(ref id) = gid {
                            update_active_game_exe(id, &active_game_exe);
                        }
                    }
                }
            }

            // Capture child processes spawned by initial launcher PID
            #[cfg(target_os = "windows")]
            {
                let current_pids: Vec<u32> = tracked_pids.iter().cloned().collect();
                for p in current_pids {
                    let tree = get_own_process_tree_pids(p);
                    for child in tree {
                        tracked_pids.insert(child);
                    }
                }
            }

            if process_seen {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }

        // 2. Active monitoring: stay active as long as ANY candidate game exe or child PID is running
        if process_seen {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(2));

                #[cfg(target_os = "windows")]
                let (any_candidate_running, any_pid_running) = {
                    if let Some(snap) = capture_system_process_snapshot() {
                        // Capture new child processes in tree
                        let current_pids: Vec<u32> = tracked_pids.iter().cloned().collect();
                        for p in current_pids {
                            if let Some(children) = snap.parent_to_children.get(&p) {
                                for &child in children {
                                    tracked_pids.insert(child);
                                }
                            }
                        }

                        let mut cand_running = false;
                        for candidate in &candidate_exes {
                            if snap.running_names.contains(candidate) {
                                cand_running = true;
                                if candidate != &active_game_exe && !candidate.contains("launcher") && !candidate.contains("prelauncher") {
                                    active_game_exe = candidate.clone();
                                    if let Some(ref id) = gid {
                                        update_active_game_exe(id, &active_game_exe);
                                    }
                                }
                                break;
                            }
                        }

                        // Prune dead PIDs and check if any tracked PID is still alive
                        tracked_pids.retain(|pid| snap.active_pids.contains(pid));
                        let pid_running = !tracked_pids.is_empty();

                        (cand_running, pid_running)
                    } else {
                        (false, false)
                    }
                };

                #[cfg(not(target_os = "windows"))]
                let (any_candidate_running, any_pid_running) = (false, false);

                if !any_candidate_running && !any_pid_running {
                    // Double check after 3s to prevent false positives when launcher closes as game launches or on level load
                    std::thread::sleep(std::time::Duration::from_millis(3000));

                    #[cfg(target_os = "windows")]
                    let still_alive = {
                        if let Some(snap) = capture_system_process_snapshot() {
                            let mut alive = candidate_exes.iter().any(|c| snap.running_names.contains(c));
                            if !alive {
                                alive = tracked_pids.iter().any(|pid| snap.active_pids.contains(pid));
                            }
                            alive
                        } else {
                            false
                        }
                    };
                    #[cfg(not(target_os = "windows"))]
                    let still_alive = false;

                    if !still_alive {
                        break;
                    }
                }
            }
        } else if let Some(mut c) = child_proc {
            // Fallback: wait on direct child handle
            let _ = c.wait();
        }

        let elapsed_secs = start_time.elapsed().as_secs();
        let elapsed_mins = (elapsed_secs / 60) as i64;

        if let Some(ref id) = gid {
            set_game_running_track(id, "", Vec::new(), Vec::new(), false);

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
async fn set_folder_cover_icon(folder_path: String, cover_url: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || set_folder_cover_icon_sync(folder_path, cover_url))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

fn set_folder_cover_icon_sync(folder_path: String, cover_url: String) -> Result<bool, String> {
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

    // Remove old attributes synchronously before writing
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;
        extern "system" {
            fn SetFileAttributesW(lpFileName: *const u16, dwFileAttributes: u32) -> i32;
        }
        if ini_path.exists() {
            let ini_w: Vec<u16> = OsStr::new(&ini_path).encode_wide().chain(Some(0)).collect();
            unsafe { SetFileAttributesW(ini_w.as_ptr(), 0x80); } // FILE_ATTRIBUTE_NORMAL = 0x80
        }
        if ico_path.exists() {
            let ico_w: Vec<u16> = OsStr::new(&ico_path).encode_wide().chain(Some(0)).collect();
            unsafe { SetFileAttributesW(ico_w.as_ptr(), 0x80); }
        }
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
async fn fetch_torrent_metadata(magnet_or_hash: String) -> Result<RealTorrentMetadata, String> {
    tokio::task::spawn_blocking(move || fetch_torrent_metadata_sync(magnet_or_hash))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

fn fetch_torrent_metadata_sync(magnet_or_hash: String) -> Result<RealTorrentMetadata, String> {
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
static CONFIGURED_SPEED_LIMITS: std::sync::RwLock<(u64, u64)> = std::sync::RwLock::new((0, 0));

fn kbps_to_bps(kbps: u64) -> Option<NonZeroU32> {
    if kbps == 0 {
        return None;
    }
    NonZeroU32::new((kbps.saturating_mul(1024)).min(u32::MAX as u64) as u32)
}

fn read_speed_limits() -> LimitsConfig {
    let (down_kb, up_kb) = *CONFIGURED_SPEED_LIMITS
        .read()
        .unwrap_or_else(|e| e.into_inner());
    LimitsConfig {
        download_bps: kbps_to_bps(down_kb),
        upload_bps: kbps_to_bps(up_kb),
    }
}

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

    // Apply any configured speed limits to active session limiter
    let (down_kb, up_kb) = *CONFIGURED_SPEED_LIMITS.read().unwrap_or_else(|e| e.into_inner());
    let down_bps = kbps_to_bps(down_kb);
    let up_bps = kbps_to_bps(up_kb);
    session.ratelimits.set_download_bps(down_bps);
    session.ratelimits.set_upload_bps(up_bps);

    println!(
        "[FitRepacks BitTorrent] BitTorrent engine session started successfully (Limits: down={:?} bps, up={:?} bps).",
        down_bps, up_bps
    );
    *lock = Some(Arc::clone(&session));
    Ok(session)
}

/// Update speed limits on the live session without restarting it.
#[command]
async fn set_torrent_speed_limits(
    download_kbps: u64,
    upload_kbps: u64,
) -> Result<(), String> {
    if let Ok(mut limits) = CONFIGURED_SPEED_LIMITS.write() {
        *limits = (download_kbps, upload_kbps);
    }

    let down_bps = kbps_to_bps(download_kbps);
    let up_bps = kbps_to_bps(upload_kbps);

    let lock = TORRENT_SESSION.read().await;
    if let Some(ref session) = *lock {
        session.ratelimits.set_download_bps(down_bps);
        session.ratelimits.set_upload_bps(up_bps);
        println!(
            "[FitRepacks BitTorrent] Speed limits updated on live session: download={:?} bps, upload={:?} bps",
            down_bps, up_bps
        );
    } else {
        println!(
            "[FitRepacks BitTorrent] Stored speed limits for upcoming session: download={} KB/s, upload={} KB/s",
            download_kbps, upload_kbps
        );
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
                if handle.info_hash().as_string().eq_ignore_ascii_case(&info_hash) {
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
                if handle.info_hash().as_string().eq_ignore_ascii_case(&info_hash) {
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
                if handle.info_hash().as_string().eq_ignore_ascii_case(&info_hash) {
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

    let current_exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Ensure HKCU\Software\Classes\AppUserModelId registry key exists with DisplayName AND IconUri
    // so Windows Taskbar and Windows Toast display the app icon and title properly instead of a blank page.
    let script = format!(
        "$a='com.fitrepacks.library'; $p=\"HKCU:\\Software\\Classes\\AppUserModelId\\$a\"; \
         $exe='{}'; \
         if (!(Test-Path $p)) {{ New-Item -Path $p -Force | Out-Null; }} \
         Set-ItemProperty -Path $p -Name 'DisplayName' -Value 'FitRepacks Library' -Force | Out-Null; \
         Set-ItemProperty -Path $p -Name 'ShowInSettings' -Value 1 -Type DWord -Force | Out-Null; \
         if ($exe) {{ Set-ItemProperty -Path $p -Name 'IconUri' -Value $exe -Force | Out-Null; }}",
        current_exe.replace("'", "''")
    );

    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
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
                r#"$p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Set-ItemProperty -Path $p -Name 'FitRepacksLibrary' -Value '"{}"'"#,
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
    let quit_item = PredefinedMenuItem::quit(app, Some("Quit FitRepacks"))?;

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
    } else if id_str == "quit" || id_str.eq_ignore_ascii_case("quit") || id_str.contains("quit") {
        IS_QUITTING.store(true, Ordering::Relaxed);
        app.exit(0);
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

#[command]
async fn fetch_mapgenie_games() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(35))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get("https://mapgenie.io/api/v1/games")
            .header("Referer", "https://mapgenie.io/")
            .header("Accept", "application/json")
            .send()
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("MapGenie API error: HTTP {}", resp.status()));
        }

        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        String::from_utf8(bytes.to_vec())
            .or_else(|_| Ok(String::from_utf8_lossy(&bytes).to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
async fn fetch_mapgenie_map(map_id: u64) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(35))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .map_err(|e| e.to_string())?;

        let data_url = format!("https://mapgenie.io/api/v1/maps/{}/data", map_id);
        let resp = match client
            .get(&data_url)
            .header("Referer", "https://mapgenie.io/")
            .header("Accept", "application/json")
            .send()
        {
            Ok(r) if r.status().is_success() => Ok(r),
            _ => {
                let full_url = format!("https://mapgenie.io/api/v1/maps/{}/full", map_id);
                client
                    .get(&full_url)
                    .header("Referer", "https://mapgenie.io/")
                    .header("Accept", "application/json")
                    .send()
            }
        }
        .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("MapGenie Map API error: HTTP {}", resp.status()));
        }

        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        String::from_utf8(bytes.to_vec())
            .or_else(|_| Ok(String::from_utf8_lossy(&bytes).to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
async fn fetch_mapgenie_page(game_slug: String, map_slug: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(35))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("https://mapgenie.io/{}/maps/{}", game_slug, map_slug);
        let resp = client
            .get(&url)
            .header("Referer", "https://mapgenie.io/")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("MapGenie page error: HTTP {}", resp.status()));
        }

        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        String::from_utf8(bytes.to_vec())
            .or_else(|_| Ok(String::from_utf8_lossy(&bytes).to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub body: String,
    pub headers: std::collections::HashMap<String, String>,
}

#[cfg(windows)]
fn fetch_via_curl(
    url: &str,
    headers: Option<&std::collections::HashMap<String, String>>,
) -> Result<HttpResponsePayload, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut cmd = std::process::Command::new("curl.exe");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.arg("-s");
    cmd.arg("-i");
    cmd.arg("-L");
    cmd.arg("--compressed");
    cmd.arg("-H").arg("User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    cmd.arg("-H").arg("Accept: application/json, text/plain, */*");
    cmd.arg("-H").arg("Accept-Language: en-US,en;q=0.9");
    cmd.arg("-H").arg("Referer: https://steamrip.com/");

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            cmd.arg("-H").arg(format!("{}: {}", k, v));
        }
    }

    cmd.arg(url);

    let output = cmd.output().map_err(|e| format!("curl execution error: {}", e))?;
    let raw_bytes = output.stdout;
    let text = String::from_utf8(raw_bytes.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&raw_bytes).to_string());

    let (header_part, body_part) = if let Some(pos) = text.find("\r\n\r\n") {
        let (h, b) = text.split_at(pos);
        (h, &b[4..])
    } else if let Some(pos) = text.find("\n\n") {
        let (h, b) = text.split_at(pos);
        (h, &b[2..])
    } else {
        ("", text.as_str())
    };

    let (final_headers_str, final_body) = if body_part.starts_with("HTTP/") {
        let all_blocks: Vec<&str> = text.split("\r\n\r\n").collect();
        if all_blocks.len() >= 2 {
            (all_blocks[all_blocks.len() - 2], all_blocks[all_blocks.len() - 1])
        } else {
            (header_part, body_part)
        }
    } else {
        (header_part, body_part)
    };

    let mut status = 200u16;
    let mut headers_map = std::collections::HashMap::new();

    for (idx, line) in final_headers_str.lines().enumerate() {
        if idx == 0 {
            let status_parts: Vec<&str> = line.split_whitespace().collect();
            if status_parts.len() >= 2 {
                if let Ok(code) = status_parts[1].parse::<u16>() {
                    status = code;
                }
            }
        } else if let Some((name, val)) = line.split_once(':') {
            headers_map.insert(name.trim().to_lowercase(), val.trim().to_string());
        }
    }

    Ok(HttpResponsePayload {
        status,
        body: final_body.to_string(),
        headers: headers_map,
    })
}

#[command]
async fn fetch_http_url(
    url: String,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<HttpResponsePayload, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            if let Ok(payload) = fetch_via_curl(&url, headers.as_ref()) {
                if payload.status == 200 || !payload.body.trim().starts_with("<!DOCTYPE") {
                    return Ok(payload);
                }
            }
        }

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(35))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .map_err(|e| e.to_string())?;

        let mut req = client.get(&url);

        if let Some(hdrs) = headers {
            for (k, v) in hdrs {
                req = req.header(k, v);
            }
        }

        let resp = req.send().map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();

        let mut headers_map = std::collections::HashMap::new();
        for (name, val) in resp.headers() {
            if let Ok(v_str) = val.to_str() {
                headers_map.insert(name.as_str().to_lowercase(), v_str.to_string());
            }
        }

        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        let body = String::from_utf8(bytes.to_vec())
            .unwrap_or_else(|_| String::from_utf8_lossy(&bytes).to_string());

        Ok(HttpResponsePayload {
            status,
            body,
            headers: headers_map,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn get_maps_base_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        if let Ok(curr) = std::env::current_dir() {
            if curr.join("package.json").exists() || curr.join("src-tauri").exists() {
                let p = curr.join("maps");
                let _ = std::fs::create_dir_all(&p);
                return p;
            }
            if let Some(parent) = curr.parent() {
                if parent.join("package.json").exists() {
                    let p = parent.join("maps");
                    let _ = std::fs::create_dir_all(&p);
                    return p;
                }
            }
            let p = curr.join("maps");
            let _ = std::fs::create_dir_all(&p);
            return p;
        }
    }

    let fallback = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("FitRepacks Library")
        .join("maps");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

fn sanitize_map_subpath(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let clean = rel.replace('\\', "/");
    let mut normalized = PathBuf::new();
    for part in clean.split('/') {
        let p = part.trim();
        if p.is_empty() || p == "." {
            continue;
        }
        if p == ".." || p.contains(':') {
            return Err("Invalid path component: path traversal detected".to_string());
        }
        normalized.push(p);
    }
    if normalized.as_os_str().is_empty() {
        return Err("Empty or invalid relative path".to_string());
    }
    Ok(base.join(normalized))
}

fn sanitize_slug(slug: &str) -> Result<String, String> {
    let s = slug.trim();
    if s.is_empty() || s.contains("..") || s.contains('/') || s.contains('\\') || s.contains(':') {
        return Err("Invalid slug identifier".to_string());
    }
    Ok(s.to_string())
}

#[command]
fn get_maps_folder() -> Result<String, String> {
    let dir = get_maps_base_dir();
    Ok(dir.to_string_lossy().to_string())
}

#[command]
fn save_map_file(relative_path: String, data: Vec<u8>) -> Result<bool, String> {
    let base = get_maps_base_dir();
    let full_path = sanitize_map_subpath(&base, &relative_path)?;
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&full_path, data).map_err(|e| format!("Failed to write map file: {}", e))?;
    Ok(true)
}

#[command]
fn save_map_text_file(relative_path: String, content: String) -> Result<bool, String> {
    let base = get_maps_base_dir();
    let full_path = sanitize_map_subpath(&base, &relative_path)?;
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&full_path, content.as_bytes()).map_err(|e| format!("Failed to write map file: {}", e))?;
    Ok(true)
}

#[command]
fn read_map_file(relative_path: String) -> Result<Vec<u8>, String> {
    let base = get_maps_base_dir();
    let full_path = sanitize_map_subpath(&base, &relative_path)?;
    std::fs::read(&full_path).map_err(|e| format!("Failed to read map file: {}", e))
}

#[command]
fn read_map_text_file(relative_path: String) -> Result<String, String> {
    let base = get_maps_base_dir();
    let full_path = sanitize_map_subpath(&base, &relative_path)?;
    std::fs::read_to_string(&full_path).map_err(|e| format!("Failed to read map text file: {}", e))
}

#[command]
fn map_file_exists(relative_path: String) -> Result<bool, String> {
    let base = get_maps_base_dir();
    let full_path = sanitize_map_subpath(&base, &relative_path)?;
    Ok(full_path.exists())
}

#[command]
fn get_map_absolute_path(relative_path: String) -> Result<String, String> {
    let base = get_maps_base_dir();
    let full_path = sanitize_map_subpath(&base, &relative_path)?;
    Ok(full_path.to_string_lossy().to_string())
}

#[command]
fn delete_map_folder(game_slug: String, map_slug: Option<String>) -> Result<bool, String> {
    let base = get_maps_base_dir();
    let safe_game = sanitize_slug(&game_slug)?;
    let target = match map_slug {
        Some(ref ms) if !ms.trim().is_empty() => {
            let safe_map = sanitize_slug(ms)?;
            base.join(&safe_game).join(safe_map)
        }
        _ => base.join(&safe_game),
    };
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Failed to delete map folder: {}", e))?;
    }

    // If game folder now has no remaining map directories with map.json or meta.json, clean up the whole game directory (including assets)
    let game_dir = base.join(&safe_game);
    if game_dir.exists() {
        let has_other_maps = if let Ok(entries) = std::fs::read_dir(&game_dir) {
            entries.flatten().any(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name == "assets" || name == "media" {
                    false
                } else if e.path().is_dir() {
                    e.path().join("map.json").exists() || e.path().join("meta.json").exists()
                } else {
                    false
                }
            })
        } else {
            false
        };

        if !has_other_maps {
            let _ = std::fs::remove_dir_all(&game_dir);
        }
    }

    Ok(true)
}

#[command]
fn list_downloaded_maps() -> Result<Vec<String>, String> {
    let base = get_maps_base_dir();
    let mut downloaded = Vec::new();
    if !base.exists() {
        return Ok(downloaded);
    }
    if let Ok(entries) = std::fs::read_dir(&base) {
        for game_entry in entries.flatten() {
            if game_entry.path().is_dir() {
                let game_name = game_entry.file_name().to_string_lossy().to_string();
                if let Ok(map_entries) = std::fs::read_dir(game_entry.path()) {
                    for map_entry in map_entries.flatten() {
                        if map_entry.path().is_dir() {
                            let map_name = map_entry.file_name().to_string_lossy().to_string();
                            if map_name != "assets" && map_name != "media" {
                                if map_entry.path().join("meta.json").exists() {
                                    downloaded.push(format!("{}_{}", game_name, map_name));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(downloaded)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceProcess {
    pub pid: u32,
    pub name: String,
    pub memory_mb: u64,
    pub is_safe_to_kill: bool,
    pub is_recommended: bool,
}

#[cfg(target_os = "windows")]
const SYSTEM_PROCESS_WHITELIST: &[&str] = &[
    "system",
    "system idle process",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "dwm.exe",
    "explorer.exe",
    "conhost.exe",
    "winlogon.exe",
    "audiodg.exe",
    "fontdrvhost.exe",
    "sihost.exe",
    "taskhostw.exe",
    "searchhost.exe",
    "searchindexer.exe",
    "startmenuexperiencehost.exe",
    "ctfmon.exe",
    "securityhealthservice.exe",
    "securityhealthsystray.exe",
    "msmpeng.exe",
    "runtimebroker.exe",
    "shellexperiencehost.exe",
    "smartscreen.exe",
    "spoolsv.exe",
    "wudfhost.exe",
    "dashost.exe",
    "applicationframehost.exe",
    "lockapp.exe",
    "dllhost.exe",
    "searchapp.exe",
    "textinputhost.exe",
];

#[cfg(target_os = "windows")]
fn get_own_process_tree_pids(current_pid: u32) -> std::collections::HashSet<u32> {
    use std::collections::HashSet;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut own_pids = HashSet::new();
    own_pids.insert(current_pid);

    unsafe {
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            let mut pairs = Vec::new();
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    pairs.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);

            let mut added = true;
            while added {
                added = false;
                for &(pid, parent_pid) in &pairs {
                    if pid > 0 && own_pids.contains(&parent_pid) && !own_pids.contains(&pid) {
                        own_pids.insert(pid);
                        added = true;
                    }
                }
            }
        }
    }

    own_pids
}

#[command]
fn get_resource_processes() -> Result<Vec<ResourceProcess>, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        };
        use windows::Win32::System::ProcessStatus::{
            K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
        };
        use windows::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
        };

        let current_pid = std::process::id();
        let own_pids = get_own_process_tree_pids(current_pid);
        let mut processes = Vec::new();

        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|e| e.to_string())?;
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let null_pos = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let raw_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);
                    let clean_name = raw_name.to_lowercase();
                    let pid = entry.th32ProcessID;

                    if pid > 4
                        && !own_pids.contains(&pid)
                        && !SYSTEM_PROCESS_WHITELIST.contains(&clean_name.as_str())
                        && !clean_name.starts_with("fitrepacks")
                    {
                        let mut mem_mb = 0;
                        if let Ok(handle) =
                            OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
                        {
                            let mut counters = PROCESS_MEMORY_COUNTERS::default();
                            if K32GetProcessMemoryInfo(
                                handle,
                                &mut counters,
                                std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                            )
                            .as_bool()
                            {
                                mem_mb = (counters.WorkingSetSize / (1024 * 1024)) as u64;
                            }
                            let _ = CloseHandle(handle);
                        }

                        if mem_mb >= 25 {
                            let is_recommended = matches!(
                                clean_name.as_str(),
                                "chrome.exe"
                                    | "msedge.exe"
                                    | "firefox.exe"
                                    | "brave.exe"
                                    | "opera.exe"
                                    | "discord.exe"
                                    | "spotify.exe"
                                    | "slack.exe"
                                    | "teams.exe"
                                    | "whatsapp.exe"
                                    | "telegram.exe"
                                    | "qbittorrent.exe"
                                    | "utorrent.exe"
                                    | "epicgameslauncher.exe"
                                    | "steamwebhelper.exe"
                                    | "galaxyclient.exe"
                                    | "battlenet.exe"
                                    | "photoshop.exe"
                            );

                            processes.push(ResourceProcess {
                                pid,
                                name: raw_name,
                                memory_mb: mem_mb,
                                is_safe_to_kill: true,
                                is_recommended,
                            });
                        }
                    }

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }

        processes.sort_by(|a, b| b.memory_mb.cmp(&a.memory_mb));
        Ok(processes)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[command]
fn kill_processes(pids: Vec<u32>) -> Result<usize, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

        let current_pid = std::process::id();
        let own_pids = get_own_process_tree_pids(current_pid);
        let mut killed_count = 0;

        for pid in pids {
            if pid <= 4 || own_pids.contains(&pid) {
                continue;
            }
            unsafe {
                if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                    if TerminateProcess(handle, 1).is_ok() {
                        killed_count += 1;
                    }
                    let _ = CloseHandle(handle);
                }
            }
        }
        Ok(killed_count)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = pids;
        Ok(0)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OverlayShortcutConfig {
    pub enabled: bool,
    pub keyboard_shortcut: String,
    pub controller_shortcut: String,
}

static OVERLAY_SHORTCUT_CONFIG: Mutex<Option<OverlayShortcutConfig>> = Mutex::new(None);

#[command]
fn update_overlay_shortcut_config(config: OverlayShortcutConfig) {
    println!(
        "[Overlay Backend] Shortcut config updated: enabled={}, keyboard='{}', controller='{}'",
        config.enabled, config.keyboard_shortcut, config.controller_shortcut
    );
    if let Ok(mut lock) = OVERLAY_SHORTCUT_CONFIG.lock() {
        *lock = Some(config);
    }
}

#[cfg(target_os = "windows")]
fn force_bring_window_to_top(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId,
        SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOPMOST,
        SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
    };
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus, keybd_event, KEYEVENTF_KEYUP, VK_MENU};

    println!("[Overlay Backend] Bringing window '{}' to top and focusing...", window.label());
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    let _ = window.unminimize();
    let _ = window.set_focus();

    if let Ok(h) = window.hwnd() {
        let hwnd = windows::Win32::Foundation::HWND(h.0 as _);
        unsafe {
            let fg_hwnd = GetForegroundWindow();
            let fg_thread_id = GetWindowThreadProcessId(fg_hwnd, None);
            let current_thread_id = GetCurrentThreadId();

            let attached = if fg_thread_id != 0 && fg_thread_id != current_thread_id {
                AttachThreadInput(current_thread_id, fg_thread_id, true).as_bool()
            } else {
                false
            };

            // Press and release ALT key to bypass Windows focus stealing lock if active
            keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);

            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
            let _ = BringWindowToTop(hwnd);
            let _ = SetForegroundWindow(hwnd);
            let _ = SetActiveWindow(hwnd);
            let _ = SetFocus(hwnd);

            if attached {
                let _ = AttachThreadInput(current_thread_id, fg_thread_id, false);
            }
        }
    }
}

static ACTIVE_GAME_OVERLAY_INFO: Mutex<Option<(String, String, String)>> = Mutex::new(None);
static LAST_OVERLAY_TOGGLE_TS: Mutex<Option<Instant>> = Mutex::new(None);
static SAVED_OVERLAY_SIZE: Mutex<Option<(f64, f64)>> = Mutex::new(None);

fn show_or_create_overlay(
    app_handle: &tauri::AppHandle,
    toggle_if_visible: bool,
    new_info: Option<(String, String, String)>,
) {
    if let Some((slug, map, title)) = new_info {
        if let Ok(mut lock) = ACTIVE_GAME_OVERLAY_INFO.lock() {
            *lock = Some((slug, map, title));
        }
    }

    let (game_slug, map_slug, game_title) = {
        if let Ok(lock) = ACTIVE_GAME_OVERLAY_INFO.lock() {
            lock.clone().unwrap_or_else(|| {
                ("mafia-2".into(), "empire-bay".into(), "Mafia II".into())
            })
        } else {
            ("mafia-2".into(), "empire-bay".into(), "Mafia II".into())
        }
    };

    if let Some(overlay_win) = app_handle.get_webview_window("map-overlay") {
        let is_vis = overlay_win.is_visible().unwrap_or(false);
        let is_min = overlay_win.is_minimized().unwrap_or(false);
        if toggle_if_visible && is_vis && !is_min {
            let _ = overlay_win.hide();
            return;
        }

        #[cfg(target_os = "windows")]
        {
            force_bring_window_to_top(&overlay_win);
            let win_clone = overlay_win.clone();
            std::thread::spawn(move || {
                for delay in [60, 180] {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                    force_bring_window_to_top(&win_clone);
                }
            });
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = overlay_win.show();
            let _ = overlay_win.unminimize();
            let _ = overlay_win.set_focus();
        }

        use tauri::Emitter;
        let _ = app_handle.emit("map-overlay-change", serde_json::json!({
            "gameSlug": game_slug,
            "mapSlug": map_slug,
            "gameTitle": game_title
        }));
        return;
    }

    let (init_w, init_h) = {
        if let Ok(lock) = SAVED_OVERLAY_SIZE.lock() {
            lock.unwrap_or((780.0, 560.0))
        } else {
            (780.0, 560.0)
        }
    };

    let target_url: tauri::WebviewUrl = if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            tauri::Url::parse("http://localhost:3000/map-overlay").expect("Valid dev overlay url"),
        )
    } else {
        tauri::WebviewUrl::App("map-overlay.html".into())
    };

    let builder = tauri::WebviewWindowBuilder::new(
        app_handle,
        "map-overlay",
        target_url,
    )
    .title(if game_title.is_empty() { "Game Map Overlay" } else { &game_title })
    .inner_size(init_w, init_h)
    .min_inner_size(160.0, 160.0)
    .resizable(true)
    .always_on_top(true)
    .decorations(false)
    .transparent(false)
    .shadow(false)
    .center()
    .focused(true);

    if let Ok(win) = builder.build() {
        #[cfg(target_os = "windows")]
        {
            force_bring_window_to_top(&win);
            let win_clone = win.clone();
            std::thread::spawn(move || {
                for delay in [60, 180, 350] {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                    force_bring_window_to_top(&win_clone);
                }
            });
        }
    }
}

fn toggle_map_overlay_from_backend(app_handle: &tauri::AppHandle) {
    if let Ok(mut lock) = LAST_OVERLAY_TOGGLE_TS.lock() {
        if let Some(last) = *lock {
            if last.elapsed().as_millis() < 400 {
                return;
            }
        }
        *lock = Some(Instant::now());
    }
    show_or_create_overlay(app_handle, true, None);
}

#[command]
fn open_map_overlay_cmd(
    app_handle: tauri::AppHandle,
    game_slug: Option<String>,
    map_slug: Option<String>,
    game_title: Option<String>,
) {
    let new_info = game_slug.map(|s| {
        (s, map_slug.unwrap_or_else(|| "default".to_string()), game_title.unwrap_or_default())
    });
    show_or_create_overlay(&app_handle, false, new_info);
}

#[command]
fn toggle_map_overlay_cmd(app_handle: tauri::AppHandle) {
    toggle_map_overlay_from_backend(&app_handle);
}

#[command]
fn save_overlay_size(width: f64, height: f64) {
    if width >= 160.0 && height >= 160.0 {
        if let Ok(mut lock) = SAVED_OVERLAY_SIZE.lock() {
            *lock = Some((width, height));
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ActiveOverlayGameInfo {
    pub game_slug: String,
    pub map_slug: String,
    pub game_title: String,
}

#[command]
fn get_active_overlay_game() -> ActiveOverlayGameInfo {
    if let Ok(lock) = ACTIVE_GAME_OVERLAY_INFO.lock() {
        if let Some(ref info) = *lock {
            return ActiveOverlayGameInfo {
                game_slug: info.0.clone(),
                map_slug: info.1.clone(),
                game_title: info.2.clone(),
            };
        }
    }
    ActiveOverlayGameInfo {
        game_slug: "mafia-2".to_string(),
        map_slug: "empire-bay".to_string(),
        game_title: "Mafia II".to_string(),
    }
}

#[command]
fn set_active_overlay_game(game_slug: String, map_slug: Option<String>, game_title: Option<String>) {
    if let Ok(mut lock) = ACTIVE_GAME_OVERLAY_INFO.lock() {
        *lock = Some((
            game_slug,
            map_slug.unwrap_or_else(|| "default".to_string()),
            game_title.unwrap_or_default(),
        ));
    }
}

#[command]
fn force_overlay_focus(app_handle: tauri::AppHandle, label: Option<String>) {
    let target_label = label.unwrap_or_else(|| "map-overlay".to_string());
    if let Some(window) = app_handle.get_webview_window(&target_label) {
        #[cfg(target_os = "windows")]
        {
            force_bring_window_to_top(&window);
            let win_clone = window.clone();
            std::thread::spawn(move || {
                for delay in [50, 150] {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                    force_bring_window_to_top(&win_clone);
                }
            });
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

#[cfg(target_os = "windows")]
fn start_global_overlay_shortcut_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;

        #[repr(C)]
        #[derive(Clone, Copy, Default)]
        struct XInputGamepad {
            w_buttons: u16,
            b_left_trigger: u8,
            b_right_trigger: u8,
            s_thumb_lx: i16,
            s_thumb_ly: i16,
            s_thumb_rx: i16,
            s_thumb_ry: i16,
        }

        #[repr(C)]
        #[derive(Clone, Copy, Default)]
        struct XInputState {
            dw_packet_number: u32,
            gamepad: XInputGamepad,
        }

        type XInputGetStateFn = unsafe extern "system" fn(u32, *mut XInputState) -> u32;

        #[repr(C)]
        #[derive(Clone, Copy)]
        struct JoyInfoEx {
            dw_size: u32,
            dw_flags: u32,
            dw_xpos: u32,
            dw_ypos: u32,
            dw_zpos: u32,
            dw_rpos: u32,
            dw_upos: u32,
            dw_vpos: u32,
            dw_buttons: u32,
            dw_button_number: u32,
            dw_pov: u32,
            dw_reserved1: u32,
            dw_reserved2: u32,
        }

        impl Default for JoyInfoEx {
            fn default() -> Self {
                Self {
                    dw_size: std::mem::size_of::<JoyInfoEx>() as u32,
                    dw_flags: 0x000000FF, // JOY_RETURNALL
                    dw_xpos: 0,
                    dw_ypos: 0,
                    dw_zpos: 0,
                    dw_rpos: 0,
                    dw_upos: 0,
                    dw_vpos: 0,
                    dw_buttons: 0,
                    dw_button_number: 0,
                    dw_pov: 0,
                    dw_reserved1: 0,
                    dw_reserved2: 0,
                }
            }
        }

        type JoyGetPosExFn = unsafe extern "system" fn(u32, *mut JoyInfoEx) -> u32;

        let mut xinput_fn: Option<XInputGetStateFn> = None;
        let mut joy_fn: Option<JoyGetPosExFn> = None;

        unsafe {
            use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
            use windows::core::PCSTR;

            let dll_names = [
                b"xinput1_4.dll\0".as_ptr(),
                b"xinput1_3.dll\0".as_ptr(),
                b"xinput9_1_0.dll\0".as_ptr(),
                b"xinput1_2.dll\0".as_ptr(),
                b"xinput1_1.dll\0".as_ptr(),
            ];

            for dll in dll_names {
                let h = LoadLibraryA(PCSTR(dll));
                if let Ok(handle) = h {
                    if !handle.is_invalid() {
                        // 1. Try Ordinal 100 (XInputGetStateEx) - provides global background controller state even when game is focused
                        let proc_ex = GetProcAddress(handle, PCSTR(100 as usize as *const u8));
                        if let Some(p) = proc_ex {
                            xinput_fn = Some(std::mem::transmute(p));
                            break;
                        }
                        // 2. Fallback to named XInputGetState
                        let proc = GetProcAddress(handle, PCSTR(b"XInputGetState\0".as_ptr()));
                        if let Some(p) = proc {
                            xinput_fn = Some(std::mem::transmute(p));
                            break;
                        }
                    }
                }
            }

            // Also load winmm.dll for DirectInput / DualShock / generic controller fallback
            let h_winmm = LoadLibraryA(PCSTR(b"winmm.dll\0".as_ptr()));
            if let Ok(handle) = h_winmm {
                if !handle.is_invalid() {
                    let proc = GetProcAddress(handle, PCSTR(b"joyGetPosEx\0".as_ptr()));
                    if let Some(p) = proc {
                        joy_fn = Some(std::mem::transmute(p));
                    }
                }
            }
        }

        let mut key_was_down = false;
        let mut pad_was_down = false;
        let mut last_trigger_time = std::time::Instant::now();

        loop {
            let config = {
                if let Ok(lock) = OVERLAY_SHORTCUT_CONFIG.lock() {
                    lock.clone().unwrap_or_else(|| OverlayShortcutConfig {
                        enabled: true,
                        keyboard_shortcut: "F9".to_string(),
                        controller_shortcut: "Select+Start".to_string(),
                    })
                } else {
                    OverlayShortcutConfig {
                        enabled: true,
                        keyboard_shortcut: "F9".to_string(),
                        controller_shortcut: "Select+Start".to_string(),
                    }
                }
            };

            if !config.enabled {
                key_was_down = false;
                pad_was_down = false;
                std::thread::sleep(std::time::Duration::from_millis(500));
                continue;
            }

            std::thread::sleep(std::time::Duration::from_millis(25));

            // 1. Global Keyboard Check (GetAsyncKeyState)
            let mut key_is_down = false;
            let kb_shortcut = config.keyboard_shortcut.trim();
            if !kb_shortcut.is_empty() && kb_shortcut != "Disabled" {
                unsafe {
                    let is_key_pressed = |vk: i32| (GetAsyncKeyState(vk) as u16 & 0x8000) != 0;

                    let ctrl_down = is_key_pressed(0x11);
                    let shift_down = is_key_pressed(0x10);
                    let alt_down = is_key_pressed(0x12);
                    let m_down = is_key_pressed(0x4D);

                    if kb_shortcut.eq_ignore_ascii_case("F9") && is_key_pressed(0x78) {
                        key_is_down = true;
                    } else if kb_shortcut.eq_ignore_ascii_case("F8") && is_key_pressed(0x77) {
                        key_is_down = true;
                    } else if kb_shortcut.eq_ignore_ascii_case("F10") && is_key_pressed(0x79) {
                        key_is_down = true;
                    } else if kb_shortcut.eq_ignore_ascii_case("F11") && is_key_pressed(0x7A) {
                        key_is_down = true;
                    } else if kb_shortcut.eq_ignore_ascii_case("F7") && is_key_pressed(0x76) {
                        key_is_down = true;
                    } else if (kb_shortcut == "Ctrl+M" || kb_shortcut == "Ctrl + M") && ctrl_down && m_down && !shift_down && !alt_down {
                        key_is_down = true;
                    } else if (kb_shortcut == "Alt+M" || kb_shortcut == "Alt + M") && alt_down && m_down && !ctrl_down && !shift_down {
                        key_is_down = true;
                    } else if (kb_shortcut == "Ctrl+Shift+M" || kb_shortcut == "Ctrl + Shift + M") && ctrl_down && shift_down && m_down {
                        key_is_down = true;
                    }
                }
            }

            // 2. Global Gamepad Check (XInput via Ordinal 100 / XInputGetStateEx)
            let mut pad_is_down = false;
            let pad_shortcut = config.controller_shortcut.trim();

            if let Some(get_state) = xinput_fn {
                if !pad_shortcut.is_empty() && pad_shortcut != "Disabled" {
                    for user_idx in 0..4 {
                        let mut state = XInputState::default();
                        let res = unsafe { get_state(user_idx, &mut state) };
                        if res == 0 {
                            let btn = state.gamepad.w_buttons;
                            let lt = state.gamepad.b_left_trigger;
                            let rt = state.gamepad.b_right_trigger;

                            if (pad_shortcut == "L3+R3" || pad_shortcut == "L3 + R3") && (btn & 0x0040 != 0) && (btn & 0x0080 != 0) {
                                pad_is_down = true;
                                break;
                            } else if (pad_shortcut == "Select+Start" || pad_shortcut == "Select + Start") && (btn & 0x0020 != 0) && (btn & 0x0010 != 0) {
                                pad_is_down = true;
                                break;
                            } else if (pad_shortcut == "LB+RB+Down" || pad_shortcut == "LB + RB + Down") && (btn & 0x0100 != 0) && (btn & 0x0200 != 0) && (btn & 0x0002 != 0) {
                                pad_is_down = true;
                                break;
                            } else if (pad_shortcut == "LT+RT+Down" || pad_shortcut == "LT + RT + Down") && (lt > 120) && (rt > 120) && (btn & 0x0002 != 0) {
                                pad_is_down = true;
                                break;
                            } else if pad_shortcut == "Guide" && (btn & 0x0400 != 0) {
                                pad_is_down = true;
                                break;
                            }
                        }
                    }
                }
            }

            // 3. Global Gamepad Fallback (DirectInput / PS4 / PS5 / Generic pads via winmm)
            if !pad_is_down {
                if let Some(get_joy) = joy_fn {
                    if !pad_shortcut.is_empty() && pad_shortcut != "Disabled" {
                        for joy_id in 0..16 {
                            let mut info = JoyInfoEx::default();
                            let res = unsafe { get_joy(joy_id, &mut info) };
                            if res == 0 {
                                let b = info.dw_buttons;
                                if pad_shortcut == "L3+R3" || pad_shortcut == "L3 + R3" {
                                    let l3_r3_standard = (b & (1 << 10) != 0) && (b & (1 << 11) != 0);
                                    let l3_r3_fallback = (b & 0x0040 != 0) && (b & 0x0080 != 0);
                                    if l3_r3_standard || l3_r3_fallback {
                                        pad_is_down = true;
                                        break;
                                    }
                                } else if pad_shortcut == "Select+Start" || pad_shortcut == "Select + Start" {
                                    // Button 8 (Share / Back / Select) + Button 9 (Options / Start / Menu)
                                    let sel_start = (b & (1 << 8) != 0) && (b & (1 << 9) != 0);
                                    if sel_start {
                                        pad_is_down = true;
                                        break;
                                    }
                                } else if pad_shortcut == "LB+RB+Down" || pad_shortcut == "LB + RB + Down" {
                                    let bumpers = (b & (1 << 4) != 0) && (b & (1 << 5) != 0);
                                    let pov_down = info.dw_pov == 18000;
                                    if bumpers && pov_down {
                                        pad_is_down = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let triggered_key = key_is_down && !key_was_down;
            let triggered_pad = pad_is_down && !pad_was_down;

            key_was_down = key_is_down;
            pad_was_down = pad_is_down;

            if (triggered_key || triggered_pad) && last_trigger_time.elapsed().as_millis() > 400 {
                last_trigger_time = std::time::Instant::now();
                println!(
                    "[Overlay Listener] Triggered via: key={}, pad={}",
                    triggered_key, triggered_pad
                );
                toggle_map_overlay_from_backend(&app_handle);
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_global_overlay_shortcut_listener(_app_handle: tauri::AppHandle) {}

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
            start_global_overlay_shortcut_listener(app.handle().clone());

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

            let icon_opt = app.default_window_icon().cloned().or_else(|| {
                image::load_from_memory(include_bytes!("../icons/icon.png"))
                    .ok()
                    .map(|img| {
                        let rgba = img.to_rgba8();
                        let (width, height) = rgba.dimensions();
                        tauri::image::Image::new_owned(rgba.into_raw(), width, height)
                    })
            });

            if let Some(ref icon) = icon_opt {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder.build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                if let Some(ref icon) = icon_opt {
                    let _ = window.set_icon(icon.clone());
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // If close to tray is enabled (in release) and not quitting, prevent close and hide main window
                    if !IS_QUITTING.load(Ordering::Relaxed) && !cfg!(debug_assertions) && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        // Main window is closing: close the map-overlay window so app doesn't hang in background
                        let app = window.app_handle();
                        if let Some(overlay_win) = app.get_webview_window("map-overlay") {
                            let _ = overlay_win.close();
                        }
                    }
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
            set_webview_bounds,
            fetch_mapgenie_games,
            fetch_mapgenie_map,
            fetch_mapgenie_page,
            get_resource_processes,
            kill_processes,
            update_overlay_shortcut_config,
            force_overlay_focus,
            set_active_overlay_game,
            get_active_overlay_game,
            save_overlay_size,
            open_map_overlay_cmd,
            toggle_map_overlay_cmd,
            get_maps_folder,
            save_map_file,
            save_map_text_file,
            read_map_file,
            read_map_text_file,
            map_file_exists,
            get_map_absolute_path,
            delete_map_folder,
            list_downloaded_maps,
            fetch_http_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}



#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_sanitize_map_subpath_valid() {
        let base = PathBuf::from("C:\\Games\\maps");
        let safe = sanitize_map_subpath(&base, "cyberpunk/night-city/tiles/1/2/3.jpg").unwrap();
        assert_eq!(safe, base.join("cyberpunk").join("night-city").join("tiles").join("1").join("2").join("3.jpg"));
    }

    #[test]
    fn test_sanitize_map_subpath_traversal_rejected() {
        let base = PathBuf::from("C:\\Games\\maps");
        assert!(sanitize_map_subpath(&base, "../../windows/system32/cmd.exe").is_err());
        assert!(sanitize_map_subpath(&base, "cyberpunk/../../secret").is_err());
        assert!(sanitize_map_subpath(&base, "C:\\Windows\\System32").is_err());
    }

    #[test]
    fn test_sanitize_slug() {
        assert_eq!(sanitize_slug("witcher-3").unwrap(), "witcher-3");
        assert_eq!(sanitize_slug("cyberpunk_2077").unwrap(), "cyberpunk_2077");
        assert!(sanitize_slug("../etc").is_err());
        assert!(sanitize_slug("foo/bar").is_err());
        assert!(sanitize_slug("foo\\bar").is_err());
    }

    #[test]
    fn test_kbps_to_bps() {
        assert!(kbps_to_bps(0).is_none());
        let val = kbps_to_bps(100).unwrap();
        assert_eq!(val.get(), 102_400);
    }

    #[test]
    fn test_torrent_hash_case_matching() {
        let h1 = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
        let h2 = "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678";
        assert!(h1.eq_ignore_ascii_case(h2));
    }
}
