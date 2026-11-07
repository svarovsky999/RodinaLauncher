
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Write};
use std::fs::OpenOptions;
use std::sync::Mutex;
use std::time::{UNIX_EPOCH, SystemTime};
use sha2::{Digest, Sha256};

// Тестовая команда Tauri
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


#[derive(serde::Serialize)]
struct MoonloaderScript {
    name: String,
    path: String,
    enabled: bool,
}


#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogFile {
    id: String,
    name: String,
    path: String,
    relative_path: String,
    extension: String,
    categories: Vec<String>,
    location: String,
    enabled: bool,
    can_toggle: bool,
    can_delete: bool,
    size: u64,
    modified_at: Option<u64>,
    sha256: Option<String>,
    conflicts: Vec<CatalogConflict>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CatalogConflict {
    kind: String,
    severity: String,
    message: String,
    related_paths: Vec<String>,
    same_sha256: Option<bool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallConflictReport {
    source_name: String,
    source_sha256: String,
    target_relative_path: String,
    blocked: bool,
    identical_target: bool,
    conflicts: Vec<CatalogConflict>,
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Не удалось открыть файл для SHA-256: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let read = file.read(&mut buffer)
            .map_err(|e| format!("Ошибка чтения файла при вычислении SHA-256: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn catalog_display_name(file_name: &str) -> (&str, String, bool) {
    let is_disabled = file_name.to_lowercase().ends_with(".disabled");
    let display_name = if is_disabled {
        &file_name[..file_name.len() - ".disabled".len()]
    } else {
        file_name
    };
    let extension = display_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_lowercase())
        .unwrap_or_default();

    (display_name, extension, !is_disabled)
}

fn add_catalog_file(
    game_dir: &Path,
    directory: &Path,
    entry_path: &Path,
    location: &str,
    seen: &mut HashSet<PathBuf>,
    files: &mut Vec<CatalogFile>,
) -> Result<(), String> {
    let canonical_path = fs::canonicalize(entry_path)
        .map_err(|e| format!("Не удалось проверить файл каталога: {}", e))?;

    // Каталог управляет только непосредственными файлами разрешённых директорий.
    if canonical_path.parent() != Some(directory) || !canonical_path.is_file() {
        return Ok(());
    }

    if !seen.insert(canonical_path.clone()) {
        return Ok(());
    }

    let file_name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Не удалось прочитать имя файла.".to_string())?;
    let (display_name, extension, enabled) = catalog_display_name(file_name);

    // Игровой лог остаётся в разделе логов, а не в менеджере модификаций.
    if location == "MoonLoader" && display_name.eq_ignore_ascii_case("moonloader.log") {
        return Ok(());
    }

    let lower_display_name = display_name.to_lowercase();
    let is_root = location == "Корень сборки";
    let is_sampfuncs_plugin = lower_display_name == "sampfuncs.asi";

    let mut categories: Vec<String> = Vec::new();

    if is_root {
        match extension.as_str() {
            "asi" => {
                categories.push("asi".to_string());
                if is_sampfuncs_plugin {
                    categories.push("sampfuncs".to_string());
                }
            }
            "ini" => categories.push("ini".to_string()),
            _ => return Ok(()),
        }
    } else {
        match location {
            "MoonLoader" => match extension.as_str() {
                "lua" | "luac" => categories.push("moonloader".to_string()),
                "ini" => categories.push("ini".to_string()),
                _ => categories.push("other".to_string()),
            },
            "CLEO" => match extension.as_str() {
                "cleo" | "cs" => categories.push("cleo".to_string()),
                "ini" => categories.push("ini".to_string()),
                _ => categories.push("other".to_string()),
            },
            "Sampfuncs" => {
                categories.push("sampfuncs".to_string());
                if extension == "ini" {
                    categories.push("ini".to_string());
                } else if !matches!(extension.as_str(), "sf" | "asi") {
                    categories.push("other".to_string());
                }
            }
            _ => return Ok(()),
        }
    }

    let can_toggle = match location {
        "Корень сборки" => matches!(extension.as_str(), "asi" | "ini"),
        "MoonLoader" => matches!(extension.as_str(), "lua" | "luac" | "ini"),
        "CLEO" => matches!(extension.as_str(), "cleo" | "cs" | "ini"),
        "Sampfuncs" => matches!(extension.as_str(), "sf" | "ini"),
        _ => false,
    };

    let metadata = fs::metadata(&canonical_path)
        .map_err(|e| format!("Не удалось получить сведения о файле: {}", e))?;
    let relative_path = canonical_path
        .strip_prefix(game_dir)
        .map_err(|_| "Файл находится за пределами игровой сборки.".to_string())?
        .to_string_lossy()
        .to_string();
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());

    categories.sort();
    categories.dedup();

    files.push(CatalogFile {
        id: relative_path.to_lowercase(),
        name: display_name.to_string(),
        path: canonical_path.to_string_lossy().to_string(),
        relative_path,
        extension,
        categories,
        location: location.to_string(),
        enabled,
        can_toggle,
        can_delete: true,
        size: metadata.len(),
        modified_at,
        // Ошибка чтения одного файла не должна ломать весь каталог.
        sha256: sha256_file(&canonical_path).ok(),
        conflicts: Vec::new(),
    });

    Ok(())
}

fn scan_catalog_directory(
    game_dir: &Path,
    directory: &Path,
    location: &str,
    seen: &mut HashSet<PathBuf>,
    files: &mut Vec<CatalogFile>,
) -> Result<(), String> {
    let directory_metadata = match fs::symlink_metadata(directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!("Не удалось проверить папку {}: {}", location, error));
        }
    };

    // Не следуем по символическим ссылкам и не сканируем папки, подменённые ссылками.
    if !directory_metadata.file_type().is_dir() {
        return Ok(());
    }

    let canonical_directory = fs::canonicalize(directory)
        .map_err(|e| format!("Не удалось открыть папку {}: {}", location, e))?;

    // Все управляемые папки должны быть непосредственными дочерними папками сборки.
    if location != "Корень сборки" && canonical_directory.parent() != Some(game_dir) {
        return Err(format!("Папка {} находится вне корня сборки.", location));
    }

    let entries = fs::read_dir(&canonical_directory)
        .map_err(|e| format!("Не удалось прочитать папку {}: {}", location, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Ошибка чтения элемента каталога: {}", e))?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;

        // Не обходим подпапки и символические ссылки.
        if !file_type.is_file() {
            continue;
        }

        add_catalog_file(
            game_dir,
            &canonical_directory,
            &entry.path(),
            location,
            seen,
            files,
        )?;
    }

    Ok(())
}

fn normalized_relative_path(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

fn append_group_conflict(
    files: &mut [CatalogFile],
    indices: &[usize],
    kind: &str,
    severity: &str,
    message: &str,
    same_sha256: Option<bool>,
) {
    if indices.len() < 2 {
        return;
    }

    let paths: Vec<String> = indices
        .iter()
        .map(|index| files[*index].relative_path.clone())
        .collect();

    for index in indices {
        let own_path = files[*index].relative_path.clone();
        let related_paths = paths
            .iter()
            .filter(|path| path.as_str() != own_path.as_str())
            .cloned()
            .collect();

        files[*index].conflicts.push(CatalogConflict {
            kind: kind.to_string(),
            severity: severity.to_string(),
            message: message.to_string(),
            related_paths,
            same_sha256,
        });
    }
}

fn annotate_catalog_conflicts(files: &mut [CatalogFile]) {
    let mut by_path: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_name: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_hash: HashMap<String, Vec<usize>> = HashMap::new();

    for (index, file) in files.iter().enumerate() {
        by_path
            .entry(normalized_relative_path(&file.relative_path))
            .or_default()
            .push(index);
        by_name
            .entry(file.name.to_lowercase())
            .or_default()
            .push(index);
        if let Some(hash) = &file.sha256 {
            by_hash.entry(hash.clone()).or_default().push(index);
        }
    }

    for indices in by_path.values() {
        append_group_conflict(
            files,
            indices,
            "relativePath",
            "error",
            "Обнаружено совпадение относительного пути.",
            None,
        );
    }

    for indices in by_name.values() {
        if indices.len() < 2 {
            continue;
        }
        let hashes_available = indices.iter().all(|index| files[*index].sha256.is_some());
        let same_hash = hashes_available && indices.iter().all(|index| {
            files[*index].sha256 == files[indices[0]].sha256
        });
        let kind = if !hashes_available {
            "sameNameUnverified"
        } else if same_hash {
            "sameNameSameContent"
        } else {
            "sameNameDifferentContent"
        };
        let message = if !hashes_available {
            "Файлы с одинаковым именем найдены в разных местах, но SHA-256 одного из файлов вычислить не удалось."
        } else if same_hash {
            "Файлы с одинаковым именем и одинаковым содержимым найдены в разных местах."
        } else {
            "Файлы с одинаковым именем имеют разное содержимое. Проверьте возможный конфликт версий."
        };
        append_group_conflict(
            files,
            indices,
            kind,
            if same_hash { "info" } else { "warning" },
            message,
            if hashes_available { Some(same_hash) } else { None },
        );
    }

    for indices in by_hash.values() {
        if indices.len() < 2 {
            continue;
        }
        let has_different_names = indices
            .iter()
            .any(|index| files[*index].name.to_lowercase() != files[indices[0]].name.to_lowercase());
        if has_different_names {
            append_group_conflict(
                files,
                indices,
                "sameContent",
                "info",
                "Одинаковое содержимое (SHA-256) найдено под разными именами или в разных папках.",
                Some(true),
            );
        }
    }
}

fn collect_catalog_files(game_dir: &Path) -> Result<Vec<CatalogFile>, String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();

    // В корне сборки ищем только ASI и INI, не перечисляя файлы самой игры.
    scan_catalog_directory(
        game_dir,
        game_dir,
        "Корень сборки",
        &mut seen,
        &mut files,
    )?;

    for (folder, location) in [
        ("moonloader", "MoonLoader"),
        ("cleo", "CLEO"),
        ("sampfuncs", "Sampfuncs"),
    ] {
        scan_catalog_directory(
            game_dir,
            &game_dir.join(folder),
            location,
            &mut seen,
            &mut files,
        )?;
    }

    annotate_catalog_conflicts(&mut files);
    files.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()))
    });

    Ok(files)
}

#[tauri::command]
async fn get_catalog_files(game_path: String) -> Result<Vec<CatalogFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let game_dir = fs::canonicalize(&game_path)
            .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
        if !game_dir.is_dir() {
            return Err("Выбранный путь не является папкой игры.".to_string());
        }
        collect_catalog_files(&game_dir)
    }).await.map_err(|e| format!("Ошибка фонового сканирования каталога: {}", e))?
}

fn build_lua_install_conflict_report(
    game_dir: &Path,
    moonloader_dir: &Path,
    source: &Path,
) -> Result<InstallConflictReport, String> {
    let source_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Не удалось определить имя исходного файла.")?
        .to_string();
    let source_hash = sha256_file(source)?;
    let target = moonloader_dir.join(&source_name);
    let disabled_target = moonloader_dir.join(format!("{}.disabled", source_name));
    let mut conflicts = Vec::new();
    let mut blocked = false;
    let mut identical_target = true;

    for candidate in [&target, &disabled_target] {
        match fs::symlink_metadata(candidate) {
            Ok(metadata) => {
                blocked = true;
                let relative_path = candidate
                    .strip_prefix(game_dir)
                    .unwrap_or(candidate)
                    .to_string_lossy()
                    .replace('\\', "/");
                let existing_hash = if metadata.file_type().is_file() {
                    Some(sha256_file(candidate)?)
                } else {
                    None
                };
                let same = existing_hash.as_deref() == Some(source_hash.as_str());
                if !same {
                    identical_target = false;
                }
                let message = if same {
                    "По целевому пути уже находится идентичный файл. Установка не требуется.".to_string()
                } else if existing_hash.is_some() {
                    "Целевой относительный путь уже занят файлом с другим содержимым. Автоматическая замена запрещена.".to_string()
                } else {
                    "Целевой относительный путь занят не обычным файлом (например, папкой или ссылкой). Установка запрещена.".to_string()
                };
                conflicts.push(CatalogConflict {
                    kind: "relativePath".to_string(),
                    severity: "error".to_string(),
                    message,
                    related_paths: vec![relative_path],
                    same_sha256: if existing_hash.is_some() { Some(same) } else { None },
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("Не удалось проверить целевой путь установки: {}", error));
            }
        }
    }

    // Если ни один целевой файл не найден, идентичного целевого совпадения нет.
    if !blocked {
        identical_target = false;
    }

    // Сравниваем исходник со всеми файлами разрешённых областей каталога.
    let catalog = collect_catalog_files(game_dir)?;
    let source_name_lower = source_name.to_lowercase();
    let target_relative = target
        .strip_prefix(game_dir)
        .unwrap_or(&target)
        .to_string_lossy()
        .replace('\\', "/");

    let mut same_name_paths = Vec::new();
    let mut same_name_hashes_match = true;
    let mut same_name_hashes_available = true;
    let mut same_content_paths = Vec::new();

    for file in catalog {
        if normalized_relative_path(&file.relative_path) == normalized_relative_path(&target_relative) {
            continue;
        }

        if file.name.to_lowercase() == source_name_lower {
            same_name_paths.push(file.relative_path.clone());
            match file.sha256.as_deref() {
                Some(hash) if hash == source_hash => {}
                Some(_) => same_name_hashes_match = false,
                None => {
                    same_name_hashes_available = false;
                    same_name_hashes_match = false;
                }
            }
        }

        if file.sha256.as_deref() == Some(source_hash.as_str()) {
            same_content_paths.push(file.relative_path.clone());
        }
    }

    if !same_name_paths.is_empty() {
        let same = same_name_hashes_match && same_name_hashes_available;
        let unverified = !same_name_hashes_available;
        conflicts.push(CatalogConflict {
            kind: if unverified {
                "sameNameUnverified"
            } else if same {
                "sameNameSameContent"
            } else {
                "sameNameDifferentContent"
            }.to_string(),
            severity: if same { "info" } else { "warning" }.to_string(),
            message: if unverified {
                "Файл с таким именем найден в другой разрешённой папке, но SHA-256 сравнить не удалось.".to_string()
            } else if same {
                "Файл с таким именем и таким же SHA-256 уже найден в другой разрешённой папке.".to_string()
            } else {
                "Файл с таким именем уже найден в другой разрешённой папке, но его SHA-256 отличается.".to_string()
            },
            related_paths: same_name_paths.clone(),
            same_sha256: if same_name_hashes_available { Some(same) } else { None },
        });
    }

    // Не показываем один и тот же путь дважды, если он уже указан как совпадение имени.
    same_content_paths.retain(|path| !same_name_paths.contains(path));

    if !same_content_paths.is_empty() {
        conflicts.push(CatalogConflict {
            kind: "sameContent".to_string(),
            severity: "info".to_string(),
            message: "Идентичное содержимое (SHA-256) уже присутствует в каталоге под другим путём.".to_string(),
            related_paths: same_content_paths,
            same_sha256: Some(true),
        });
    }

    Ok(InstallConflictReport {
        source_name,
        source_sha256: source_hash,
        target_relative_path: target_relative,
        blocked,
        identical_target,
        conflicts,
    })
}

#[tauri::command]
fn check_lua_install_conflicts(
    game_path: String,
    source_path: String,
) -> Result<InstallConflictReport, String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let moonloader_dir = fs::canonicalize(game_dir.join("moonloader"))
        .map_err(|_| "Папка MoonLoader не найдена.".to_string())?;
    if moonloader_dir.parent() != Some(game_dir.as_path()) {
        return Err("Некорректный путь к папке MoonLoader.".to_string());
    }

    let source = fs::canonicalize(&source_path)
        .map_err(|e| format!("Не удалось открыть исходный файл: {}", e))?;
    if !source.is_file() {
        return Err("Выбранный путь не является файлом.".to_string());
    }
    let is_lua = source.extension().and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("lua") || ext.eq_ignore_ascii_case("luac"))
        .unwrap_or(false);
    if !is_lua {
        return Err("Проверка установки поддерживает только .lua и .luac.".to_string());
    }

    build_lua_install_conflict_report(&game_dir, &moonloader_dir, &source)
}

fn resolve_catalog_file(
    game_path: &str,
    file_path: &str,
) -> Result<(PathBuf, PathBuf, String, String, bool), String> {
    let game_dir = fs::canonicalize(game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let file = fs::canonicalize(file_path)
        .map_err(|e| format!("Файл не найден: {}", e))?;

    if !file.is_file() {
        return Err("Выбранный путь не является файлом.".to_string());
    }

    let parent = file.parent().ok_or("Не удалось определить папку файла.")?;
    let location = if parent == game_dir.as_path() {
        "Корень сборки".to_string()
    } else {
        let mut matched = None;
        for (folder, label) in [
            ("moonloader", "MoonLoader"),
            ("cleo", "CLEO"),
            ("sampfuncs", "Sampfuncs"),
        ] {
            let candidate = game_dir.join(folder);
            let candidate_metadata = match fs::symlink_metadata(&candidate) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => {
                    return Err(format!("Ошибка проверки папки {}: {}", label, error));
                }
            };

            if !candidate_metadata.file_type().is_dir() {
                continue;
            }

            let canonical_candidate = fs::canonicalize(&candidate)
                .map_err(|e| format!("Ошибка проверки папки {}: {}", label, e))?;
            if canonical_candidate.parent() == Some(game_dir.as_path())
                && parent == canonical_candidate.as_path()
            {
                matched = Some(label.to_string());
                break;
            }
        }
        matched.ok_or("Файл находится вне разрешённых папок каталога.".to_string())?
    };

    let file_name = file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Некорректное имя файла.")?;
    let (display_name, extension, enabled) = catalog_display_name(file_name);

    // Корень игры содержит только ASI и INI. В служебных папках допускаются
    // только непосредственные файлы; подпапки никогда не затрагиваются.
    let allowed_location = match location.as_str() {
        "Корень сборки" => matches!(extension.as_str(), "asi" | "ini"),
        "MoonLoader" | "CLEO" | "Sampfuncs" => {
            !display_name.eq_ignore_ascii_case("moonloader.log")
        }
        _ => false,
    };

    if !allowed_location {
        return Err("Этот файл не входит в управляемый каталог.".to_string());
    }

    Ok((game_dir, file, location, extension, enabled))
}

#[tauri::command]
async fn toggle_catalog_file(
    game_path: String,
    file_path: String,
    enabled: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let (_game_dir, file, location, extension, currently_enabled) =
        resolve_catalog_file(&game_path, &file_path)?;

    let can_toggle = match location.as_str() {
        "Корень сборки" => matches!(extension.as_str(), "asi" | "ini"),
        "MoonLoader" => matches!(extension.as_str(), "lua" | "luac" | "ini"),
        "CLEO" => matches!(extension.as_str(), "cleo" | "cs" | "ini"),
        "Sampfuncs" => matches!(extension.as_str(), "sf" | "ini"),
        _ => false,
    };

    if !can_toggle {
        return Err("Для этого типа файла переключение не поддерживается.".to_string());
    }

    if currently_enabled == enabled {
        return Ok("Состояние файла не изменилось.".to_string());
    }

    let file_name = file.file_name().and_then(|name| name.to_str())
        .ok_or("Некорректное имя файла.")?;
    let new_name = if enabled {
        file_name[..file_name.len() - ".disabled".len()].to_string()
    } else {
        format!("{}.disabled", file_name)
    };
    let new_path = file.parent().unwrap().join(new_name);

    if new_path.exists() {
        return Err("Нельзя изменить состояние: файл с таким именем уже существует.".to_string());
    }

    fs::rename(&file, &new_path)
        .map_err(|e| format!("Не удалось изменить состояние файла: {}", e))?;
    let game_label = _game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let action = if enabled { "enabled" } else { "disabled" };
    let title = if enabled { "Включена модификация" } else { "Отключена модификация" };
    let _ = append_activity_entry(&_game_dir, game_label, "catalog", action, title,
        &format!("{} → {}", file.file_name().unwrap_or_default().to_string_lossy(), new_path.file_name().unwrap_or_default().to_string_lossy()), "success");

    Ok(if enabled { "Файл включён." } else { "Файл отключён." }.to_string())
    }).await.map_err(|e| format!("Ошибка фонового переключения файла: {}", e))?
}

#[tauri::command]
fn delete_catalog_file(
    game_path: String,
    file_path: String,
) -> Result<String, String> {
    let (_game_dir, file, _location, _extension, _enabled) =
        resolve_catalog_file(&game_path, &file_path)?;

    let file_name = file.file_name().and_then(|name| name.to_str()).unwrap_or("Файл").to_string();
    let game_label = _game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    fs::remove_file(&file)
        .map_err(|e| format!("Не удалось удалить файл: {}", e))?;
    let _ = append_activity_entry(&_game_dir, game_label, "catalog", "deleted", "Удалена модификация", &file_name, "success");

    Ok("Файл успешно удалён.".to_string())
}


fn collect_lua_scripts(
    directory: &Path,
    scripts: &mut Vec<MoonloaderScript>,
) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|e| format!("Ошибка чтения папки: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        let file_type = entry
            .file_type()
            .map_err(|e| e.to_string())?;

        if !file_type.is_file() {
            continue;
        }

        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let lower_name = file_name.to_lowercase();

        // Проверяем поддерживаемые форматы
        let enabled =
            lower_name.ends_with(".lua") ||
            lower_name.ends_with(".luac");

        let disabled =
            lower_name.ends_with(".lua.disabled") ||
            lower_name.ends_with(".luac.disabled");

        if !enabled && !disabled {
            continue;
        }

        // Убираем .disabled из отображаемого имени
        let name = if disabled {
            file_name[..file_name.len() - ".disabled".len()].to_string()
        } else {
            file_name.clone()
        };

        scripts.push(MoonloaderScript {
            name,
            path: path.to_string_lossy().to_string(),
            enabled,
        });
    }

    Ok(())
}


#[tauri::command]
async fn get_moonloader_scripts(game_path: String) -> Result<Vec<MoonloaderScript>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let game_dir = PathBuf::from(&game_path);
        let moonloader_dir = game_dir.join("moonloader");
        if !moonloader_dir.is_dir() {
            return Err("Папка MoonLoader не найдена.".to_string());
        }
        let mut scripts = Vec::new();
        collect_lua_scripts(&moonloader_dir, &mut scripts)?;
        scripts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(scripts)
    }).await.map_err(|e| format!("Ошибка фонового сканирования MoonLoader: {}", e))?
}


#[tauri::command]
fn delete_moonloader_script(
    game_path: String,
    script_path: String,
) -> Result<String, String> {
    let moonloader_dir = PathBuf::from(&game_path).join("moonloader");

    let moonloader_dir = fs::canonicalize(&moonloader_dir)
        .map_err(|e| format!("Ошибка доступа к MoonLoader: {}", e))?;

    let script_file = fs::canonicalize(&script_path)
        .map_err(|e| format!("Файл не найден: {}", e))?;

    // Разрешаем удалять только файлы непосредственно в MoonLoader
    if script_file.parent() != Some(moonloader_dir.as_path()) {
        return Err("Удаление разрешено только из корня MoonLoader.".to_string());
    }

    if !script_file.is_file() {
        return Err("Указанный путь не является файлом.".to_string());
    }

    // Разрешаем удалять Lua, LUAC и их отключённые версии
let file_name = script_file
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or("Некорректное имя файла.")?;

let lower_name = file_name.to_lowercase();

let is_supported =
    lower_name.ends_with(".lua") ||
    lower_name.ends_with(".luac") ||
    lower_name.ends_with(".lua.disabled") ||
    lower_name.ends_with(".luac.disabled");

if !is_supported {
    return Err(
        "Можно удалять только файлы .lua и .luac.".to_string()
    );
}

    let script_name = script_file.file_name().unwrap_or_default().to_string_lossy().to_string();
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    fs::remove_file(&script_file)
        .map_err(|e| format!("Не удалось удалить скрипт: {}", e))?;
    let _ = append_activity_entry(&game_dir, game_label, "scripts", "deleted", "Удалён Lua/LUAC-скрипт", &script_name, "success");

    Ok("Скрипт успешно удалён.".to_string())
}

#[tauri::command]
fn toggle_moonloader_script(
    game_path: String,
    script_path: String,
    enabled: bool,
) -> Result<String, String> {
    let moonloader_dir = PathBuf::from(&game_path).join("moonloader");

    let moonloader_dir = fs::canonicalize(&moonloader_dir)
        .map_err(|e| format!("Ошибка доступа к MoonLoader: {}", e))?;

    let script_file = fs::canonicalize(&script_path)
        .map_err(|e| format!("Файл не найден: {}", e))?;

    if script_file.parent() != Some(moonloader_dir.as_path()) {
        return Err("Переключать можно только скрипты из корня MoonLoader.".to_string());
    }

    if !script_file.is_file() {
        return Err("Указанный путь не является файлом.".to_string());
    }

    let file_name = script_file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Некорректное имя файла.")?;

    let lower_name = file_name.to_lowercase();

    let is_enabled =
    lower_name.ends_with(".lua") ||
    lower_name.ends_with(".luac");

let is_disabled =
    lower_name.ends_with(".lua.disabled") ||
    lower_name.ends_with(".luac.disabled");

    if !is_enabled && !is_disabled {
        return Err("Поддерживаются только Lua-скрипты.".to_string());
    }

    if enabled && is_disabled {
        let new_name = &file_name[..file_name.len() - ".disabled".len()];
        let new_path = moonloader_dir.join(new_name);

        if new_path.exists() {
            return Err("Файл с таким именем уже существует.".to_string());
        }

        fs::rename(&script_file, &new_path)
            .map_err(|e| format!("Не удалось включить скрипт: {}", e))?;
        let game_dir = fs::canonicalize(&game_path).map_err(|e| e.to_string())?;
        let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
        let _ = append_activity_entry(&game_dir, game_label, "scripts", "enabled", "Включён Lua/LUAC-скрипт", file_name, "success");

    } else if !enabled && is_enabled {
        let new_name = format!("{}.disabled", file_name);
        let new_path = moonloader_dir.join(new_name);

        if new_path.exists() {
            return Err("Файл с таким именем уже существует.".to_string());
        }

        fs::rename(&script_file, &new_path)
            .map_err(|e| format!("Не удалось выключить скрипт: {}", e))?;
        let game_dir = fs::canonicalize(&game_path).map_err(|e| e.to_string())?;
        let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
        let _ = append_activity_entry(&game_dir, game_label, "scripts", "disabled", "Отключён Lua/LUAC-скрипт", file_name, "success");
    }

        Ok("Состояние скрипта изменено.".to_string())
}

// Чтение логов MoonLoader
// Чтение логов MoonLoader
#[tauri::command]
fn get_moonloader_log(game_path: String) -> Result<String, String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;

    let moonloader_dir = fs::canonicalize(game_dir.join("moonloader"))
        .map_err(|_| "Папка MoonLoader не найдена.".to_string())?;

    if moonloader_dir.parent() != Some(game_dir.as_path()) {
        return Err("Некорректный путь к папке MoonLoader.".to_string());
    }

    let log_path = fs::canonicalize(moonloader_dir.join("moonloader.log"))
        .map_err(|_| "Файл moonloader.log не найден.".to_string())?;

    if log_path.parent() != Some(moonloader_dir.as_path()) || !log_path.is_file() {
        return Err("Некорректный файл логов.".to_string());
    }

    let bytes = fs::read(&log_path)
        .map_err(|e| format!("Не удалось прочитать лог: {}", e))?;

    let content = match String::from_utf8(bytes.clone()) {
        Ok(text) => text,
        Err(_) => {
            let (decoded, _, _) = encoding_rs::WINDOWS_1251.decode(&bytes);
            decoded.into_owned()
        }
    };

    Ok(content)
}

// Постоянный журнал действий RodinaLauncher.
// Хранится отдельно от MoonLoader: .rodina_launcher/activity_log.jsonl
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ActivityLogEntry {
    id: String,
    timestamp: u64,
    game: String,
    category: String,
    action: String,
    title: String,
    details: String,
    status: String,
}

static ACTIVITY_LOG_MUTEX: Mutex<()> = Mutex::new(());

fn activity_log_path(game_dir: &Path) -> Result<PathBuf, String> {
    let launcher_dir = game_dir.join(".rodina_launcher");
    match fs::symlink_metadata(&launcher_dir) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err("Служебная папка .rodina_launcher имеет недопустимый тип.".to_string());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(&launcher_dir)
                .map_err(|e| format!("Не удалось создать служебную папку лаунчера: {}", e))?;
        }
        Err(error) => return Err(format!("Не удалось проверить служебную папку лаунчера: {}", error)),
    }
    Ok(launcher_dir.join("activity_log.jsonl"))
}

fn trim_log_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn append_activity_entry(
    game_dir: &Path,
    game: &str,
    category: &str,
    action: &str,
    title: &str,
    details: &str,
    status: &str,
) -> Result<(), String> {
    let _guard = ACTIVITY_LOG_MUTEX.lock()
        .map_err(|_| "Не удалось получить блокировку журнала лаунчера.".to_string())?;
    let path = activity_log_path(game_dir)?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err("Файл журнала лаунчера имеет недопустимый тип.".to_string());
        }
        Ok(metadata) if metadata.len() > 2 * 1024 * 1024 => {
            // Ограничиваем размер журнала: оставляем последние 1500 строк.
            if let Ok(content) = fs::read_to_string(&path) {
                let mut retained: Vec<&str> = content.lines().rev().take(1500).collect();
                retained.reverse();
                if let Ok(mut rotated) = OpenOptions::new().write(true).truncate(true).open(&path) {
                    for line in retained {
                        if rotated.write_all(line.as_bytes()).is_err() || rotated.write_all(b"\n").is_err() {
                            break;
                        }
                    }
                }
            }
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Не удалось проверить файл журнала: {}", error)),
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Ошибка системного времени: {}", e))?;
    let timestamp = now.as_millis() as u64;
    let entry = ActivityLogEntry {
        id: format!("{}-{}", timestamp, now.subsec_nanos()),
        timestamp,
        game: trim_log_text(game, 80),
        category: trim_log_text(category, 40),
        action: trim_log_text(action, 60),
        title: trim_log_text(title, 240),
        details: trim_log_text(details, 1600),
        status: if matches!(status, "success" | "error" | "warning" | "info") {
            status.to_string()
        } else {
            "info".to_string()
        },
    };
    let mut file = OpenOptions::new().create(true).append(true).open(&path)
        .map_err(|e| format!("Не удалось открыть журнал лаунчера: {}", e))?;
    let mut bytes = serde_json::to_vec(&entry)
        .map_err(|e| format!("Не удалось сериализовать запись журнала: {}", e))?;
    bytes.push(b'\n');
    file.write_all(&bytes)
        .map_err(|e| format!("Не удалось записать событие в журнал: {}", e))
}

#[tauri::command]
fn record_activity_log(
    game_path: String,
    game: String,
    category: String,
    action: String,
    title: String,
    details: String,
    status: String,
) -> Result<(), String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    if !game_dir.is_dir() {
        return Err("Выбранный путь не является папкой игры.".to_string());
    }
    append_activity_entry(&game_dir, &game, &category, &action, &title, &details, &status)
}

#[tauri::command]
fn list_activity_log(game_path: String, limit: Option<usize>) -> Result<Vec<ActivityLogEntry>, String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let path = activity_log_path(&game_dir)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Не удалось проверить журнал лаунчера: {}", error)),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Файл журнала лаунчера имеет недопустимый тип.".to_string());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Не удалось прочитать журнал лаунчера: {}", e))?;
    let max_entries = limit.unwrap_or(500).clamp(1, 1000);
    let mut entries: Vec<ActivityLogEntry> = content.lines()
        .filter_map(|line| serde_json::from_str::<ActivityLogEntry>(line).ok())
        .collect();
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then_with(|| b.id.cmp(&a.id)));
    entries.truncate(max_entries);
    Ok(entries)
}

#[tauri::command]
fn clear_activity_log(game_path: String) -> Result<(), String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let _guard = ACTIVITY_LOG_MUTEX.lock()
        .map_err(|_| "Не удалось получить блокировку журнала лаунчера.".to_string())?;
    let path = activity_log_path(&game_dir)?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("Файл журнала лаунчера имеет недопустимый тип.".to_string());
            }
            fs::remove_file(&path)
                .map_err(|e| format!("Не удалось очистить журнал лаунчера: {}", e))?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Не удалось проверить журнал лаунчера: {}", error)),
    }
    Ok(())
}

// Резервные копии MoonLoader хранятся вне самой папки MoonLoader.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct BackupFileEntry {
    relative_path: String,
    size: u64,
    sha256: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BackupManifest {
    id: String,
    created_at: u64,
    source_game_path: String,
    file_count: usize,
    total_bytes: u64,
    files: Vec<BackupFileEntry>,
}

#[derive(serde::Serialize)]
struct BackupInfo {
    id: String,
    created_at: u64,
    file_count: usize,
    total_bytes: u64,
    integrity_ok: bool,
}

fn backup_root(game_dir: &Path) -> PathBuf {
    let location_file = game_dir.join(".rodina_launcher").join("backup_location.json");
    if let Ok(bytes) = fs::read(location_file) {
        if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(path) = value.get("path").and_then(|v| v.as_str()) {
                let candidate = PathBuf::from(path);
                if candidate.is_dir() { return candidate; }
            }
        }
    }
    game_dir.join(".rodina_launcher").join("backups")
}

fn copy_tree_and_manifest(
    source: &Path,
    destination: &Path,
    relative: &Path,
    entries: &mut Vec<BackupFileEntry>,
    total_bytes: &mut u64,
) -> Result<(), String> {
    // Итеративный обход исключает переполнение стека на глубоко вложенных папках.
    // Эта же функция используется при восстановлении резервной копии.
    let mut pending: Vec<(PathBuf, PathBuf, PathBuf)> = vec![(
        source.to_path_buf(),
        destination.to_path_buf(),
        relative.to_path_buf(),
    )];

    while let Some((current_source, current_destination, current_relative)) = pending.pop() {
        let metadata = fs::symlink_metadata(&current_source)
            .map_err(|e| format!("Не удалось прочитать {}: {}", current_source.display(), e))?;

        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Резервирование остановлено: обнаружена символическая ссылка {}",
                current_source.display()
            ));
        }

        if metadata.is_dir() {
            fs::create_dir_all(&current_destination)
                .map_err(|e| format!("Не удалось создать папку резервной копии: {}", e))?;
            let mut children = fs::read_dir(&current_source)
                .map_err(|e| format!("Не удалось прочитать {}: {}", current_source.display(), e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Ошибка чтения папки: {}", e))?;
            children.sort_by_key(|entry| entry.file_name());

            // Обратная загрузка в стек сохраняет сортированный порядок обхода.
            for child in children.into_iter().rev() {
                let name = child.file_name();
                pending.push((
                    child.path(),
                    current_destination.join(&name),
                    current_relative.join(&name),
                ));
            }
        } else if metadata.is_file() {
            if let Some(parent) = current_destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Не удалось создать папку: {}", e))?;
            }

            // Копирование и SHA-256 выполняются за один проход чтения файла.
            let mut input = File::open(&current_source)
                .map_err(|e| format!("Не удалось открыть {}: {}", current_source.display(), e))?;
            let mut output = File::create(&current_destination)
                .map_err(|e| format!("Не удалось создать {}: {}", current_destination.display(), e))?;
            let mut hasher = Sha256::new();
            let mut size = 0u64;
            let mut buffer = [0u8; 256 * 1024];

            loop {
                let count = input.read(&mut buffer)
                    .map_err(|e| format!("Ошибка чтения {}: {}", current_source.display(), e))?;
                if count == 0 { break; }
                output.write_all(&buffer[..count])
                    .map_err(|e| format!("Ошибка записи {}: {}", current_destination.display(), e))?;
                hasher.update(&buffer[..count]);
                size = size.saturating_add(count as u64);
            }
            output.flush()
                .map_err(|e| format!("Ошибка завершения записи копии: {}", e))?;

            let hash = format!("{:x}", hasher.finalize());
            let relative_path = current_relative.to_string_lossy().replace('\\', "/");
            entries.push(BackupFileEntry { relative_path, size, sha256: hash });
            *total_bytes = total_bytes.saturating_add(size);
        } else {
            return Err(format!(
                "Резервирование остановлено: неподдерживаемый объект {}",
                current_source.display()
            ));
        }
    }

    Ok(())
}

fn create_moonloader_backup(game_dir: &Path, moonloader_dir: &Path, reason: &str) -> Result<BackupInfo, String> {
    let root = backup_root(game_dir);
    fs::create_dir_all(&root)
        .map_err(|e| format!("Не удалось создать хранилище резервных копий: {}", e))?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Ошибка системного времени: {}", e))?;
    let stamp = now.as_nanos();
    let id = format!("moonloader-{}", stamp);
    let backup_dir = root.join(&id);
    fs::create_dir(&backup_dir)
        .map_err(|e| format!("Не удалось создать резервную копию: {}", e))?;
    let payload_dir = backup_dir.join("MoonLoader");
    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    let result = copy_tree_and_manifest(
        moonloader_dir,
        &payload_dir,
        Path::new(""),
        &mut files,
        &mut total_bytes,
    );
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&backup_dir);
        return Err(error);
    }
    let created_at = now.as_millis() as u64;
    let manifest = BackupManifest {
        id: id.clone(),
        created_at,
        source_game_path: game_dir.to_string_lossy().to_string(),
        file_count: files.len(),
        total_bytes,
        files,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| format!("Не удалось сформировать манифест: {}", e))?;
    if let Err(error) = fs::write(backup_dir.join("manifest.json"), manifest_bytes) {
        let _ = fs::remove_dir_all(&backup_dir);
        return Err(format!("Не удалось сохранить манифест резервной копии: {}", error));
    }
    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let details = format!("{} · {} файлов · {} байт · ID {}", reason, manifest.file_count, total_bytes, id);
    let _ = append_activity_entry(game_dir, game_label, "backup", "created", "Создана резервная копия MoonLoader", &details, "success");
    Ok(BackupInfo { id, created_at, file_count: manifest.file_count, total_bytes, integrity_ok: true })
}

fn read_backup_manifest(game_dir: &Path, id: &str) -> Result<(PathBuf, BackupManifest), String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id == "." || id == ".." {
        return Err("Некорректный идентификатор резервной копии.".to_string());
    }
    let backup_dir = backup_root(game_dir).join(id);
    let canonical_root = fs::canonicalize(backup_root(game_dir))
        .map_err(|e| format!("Хранилище резервных копий не найдено: {}", e))?;
    let canonical_backup = fs::canonicalize(&backup_dir)
        .map_err(|e| format!("Резервная копия не найдена: {}", e))?;
    if canonical_backup.parent() != Some(canonical_root.as_path()) || !canonical_backup.is_dir() {
        return Err("Некорректный путь резервной копии.".to_string());
    }
    let bytes = fs::read(canonical_backup.join("manifest.json"))
        .map_err(|e| format!("Не удалось прочитать манифест: {}", e))?;
    let manifest: BackupManifest = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Манифест резервной копии повреждён: {}", e))?;
    if manifest.id != id {
        return Err("Идентификатор манифеста не совпадает.".to_string());
    }
    Ok((canonical_backup, manifest))
}

fn verify_backup_payload_metadata(backup_dir: &Path, manifest: &BackupManifest) -> Result<(), String> {
    for entry in &manifest.files {
        let relative = Path::new(&entry.relative_path);
        if relative.is_absolute() || relative.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_))) {
            return Err("Некорректный путь в манифесте резервной копии.".to_string());
        }
        let file = backup_dir.join("MoonLoader").join(relative);
        let metadata = fs::symlink_metadata(&file)
            .map_err(|e| format!("Файл резервной копии отсутствует: {} ({})", entry.relative_path, e))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() != entry.size {
            return Err(format!("Размер или тип файла не совпадает: {}", entry.relative_path));
        }
    }
    Ok(())
}

fn verify_backup_payload(backup_dir: &Path, manifest: &BackupManifest) -> Result<(), String> {
    for entry in &manifest.files {
        let relative = Path::new(&entry.relative_path);
        if relative.components().any(|part| !matches!(part, std::path::Component::Normal(_))) {
            return Err("Манифест содержит небезопасный относительный путь.".to_string());
        }
        let file = backup_dir.join("MoonLoader").join(relative);
        let metadata = fs::symlink_metadata(&file)
            .map_err(|e| format!("Файл резервной копии отсутствует: {} ({})", entry.relative_path, e))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(format!("Некорректный файл в резервной копии: {}", entry.relative_path));
        }
        if metadata.len() != entry.size || sha256_file(&file)? != entry.sha256 {
            return Err(format!("Проверка SHA-256 не пройдена: {}", entry.relative_path));
        }
    }
    Ok(())
}

#[tauri::command]
async fn create_moonloader_backup_command(game_path: String, destination_path: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let moonloader_dir = fs::canonicalize(game_dir.join("moonloader"))
        .map_err(|_| "Папка MoonLoader не найдена.".to_string())?;
    if moonloader_dir.parent() != Some(game_dir.as_path()) {
        return Err("Некорректный путь к папке MoonLoader.".to_string());
    }
    let destination = fs::canonicalize(&destination_path)
        .map_err(|e| format!("Не удалось открыть выбранную папку: {}", e))?;
    if !destination.is_dir() { return Err("Выбранное место не является папкой.".to_string()); }
    let launcher_dir = game_dir.join(".rodina_launcher");
    fs::create_dir_all(&launcher_dir).map_err(|e| format!("Не удалось сохранить настройки резервирования: {}", e))?;
    let config = serde_json::json!({ "path": destination.to_string_lossy() });
    fs::write(launcher_dir.join("backup_location.json"), serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Не удалось сохранить выбранную папку: {}", e))?;
    create_moonloader_backup(&game_dir, &moonloader_dir, &format!("Ручное создание в {}", destination.display()))
    }).await.map_err(|e| format!("Фоновая задача резервирования завершилась с ошибкой: {}", e))?
}

#[tauri::command]
async fn list_moonloader_backups(game_path: String) -> Result<Vec<BackupInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let root = backup_root(&game_dir);
    if !root.exists() { return Ok(Vec::new()); }
    let mut backups = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| format!("Не удалось прочитать резервные копии: {}", e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() { continue; }
        let id = entry.file_name().to_string_lossy().to_string();
        let info = match read_backup_manifest(&game_dir, &id) {
            Ok((dir, manifest)) => {
                let integrity_ok = verify_backup_payload_metadata(&dir, &manifest).is_ok();
                BackupInfo { id, created_at: manifest.created_at, file_count: manifest.file_count,
                    total_bytes: manifest.total_bytes, integrity_ok }
            }
            Err(_) => BackupInfo { id, created_at: 0, file_count: 0, total_bytes: 0, integrity_ok: false },
        };
        backups.push(info);
    }
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
    }).await.map_err(|e| format!("Фоновая задача чтения резервных копий завершилась с ошибкой: {}", e))?
}

#[tauri::command]
fn restore_moonloader_backup(game_path: String, backup_id: String) -> Result<String, String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let current = fs::canonicalize(game_dir.join("moonloader"))
        .map_err(|_| "Папка MoonLoader не найдена.".to_string())?;
    if current.parent() != Some(game_dir.as_path()) { return Err("Некорректный путь MoonLoader.".to_string()); }
    let (backup_dir, manifest) = read_backup_manifest(&game_dir, &backup_id)?;
    verify_backup_payload(&backup_dir, &manifest)?;

    // Сохраняем текущее состояние перед восстановлением, чтобы операция была обратимой.
    let safety_backup = create_moonloader_backup(&game_dir, &current, "Защитная копия перед восстановлением")?;
    let staging = game_dir.join(format!(".moonloader_restore_{}", backup_id));
    let rollback = game_dir.join(format!(".moonloader_rollback_{}", backup_id));
    if staging.exists() { fs::remove_dir_all(&staging).map_err(|e| format!("Не удалось очистить временную папку: {}", e))?; }
    if rollback.exists() { return Err("Найдена незавершённая папка отката. Удалите её вручную после проверки.".to_string()); }
    let mut restored_entries = Vec::new();
    let mut restored_bytes = 0u64;
    if let Err(error) = copy_tree_and_manifest(
        &backup_dir.join("MoonLoader"), &staging, Path::new(""),
        &mut restored_entries, &mut restored_bytes,
    ) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if let Err(error) = fs::rename(&current, &rollback) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Не удалось подготовить восстановление: {}", error));
    }
    if let Err(error) = fs::rename(&staging, game_dir.join("moonloader")) {
        let rollback_result = fs::rename(&rollback, &current);
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Не удалось применить резервную копию: {}. Откат: {}", error,
            rollback_result.map(|_| "успешен".to_string()).unwrap_or_else(|e| format!("ошибка ({})", e))));
    }
    fs::remove_dir_all(&rollback)
        .map_err(|e| format!("Восстановление выполнено, но временную папку отката удалить не удалось: {}. Защитная копия: {}", e, safety_backup.id))?;
    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let _ = append_activity_entry(&game_dir, game_label, "backup", "restored", "Восстановлена резервная копия MoonLoader",
        &format!("Использована копия {}; защитная копия текущего состояния: {}", backup_id, safety_backup.id), "success");
    Ok(format!("MoonLoader восстановлен. Перед восстановлением создана защитная копия {}.", safety_backup.id))
}

#[tauri::command]
fn delete_moonloader_backup(game_path: String, backup_id: String) -> Result<String, String> {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    if backup_id.is_empty() || backup_id.contains('/') || backup_id.contains('\\') || backup_id == "." || backup_id == ".." {
        return Err("Некорректный идентификатор резервной копии.".to_string());
    }
    let root = fs::canonicalize(backup_root(&game_dir))
        .map_err(|e| format!("Хранилище резервных копий не найдено: {}", e))?;
    let backup_dir = fs::canonicalize(root.join(&backup_id))
        .map_err(|e| format!("Резервная копия не найдена: {}", e))?;
    if backup_dir.parent() != Some(root.as_path()) || !backup_dir.is_dir() {
        return Err("Некорректный путь резервной копии.".to_string());
    }
    fs::remove_dir_all(&backup_dir)
        .map_err(|e| format!("Не удалось удалить резервную копию: {}", e))?;
    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let _ = append_activity_entry(&game_dir, game_label, "backup", "deleted", "Удалена резервная копия MoonLoader",
        &format!("ID {}", backup_id), "success");
    Ok(format!("Резервная копия {} удалена.", backup_id))
}

// Установка Lua-скрипта в MoonLoader
#[tauri::command]
async fn install_lua_script(
    game_path: String,
    source_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let game_dir = fs::canonicalize(&game_path)
        .map_err(|e| format!("Ошибка доступа к папке игры: {}", e))?;
    let moonloader_dir = fs::canonicalize(game_dir.join("moonloader"))
        .map_err(|_| "Папка MoonLoader не найдена.".to_string())?;

    if moonloader_dir.parent() != Some(game_dir.as_path()) {
        return Err("Некорректный путь к папке MoonLoader.".to_string());
    }

    let source = fs::canonicalize(&source_path)
        .map_err(|e| format!("Не удалось открыть Lua-файл: {}", e))?;
    if !source.is_file() {
        return Err("Выбранный путь не является файлом.".to_string());
    }

    let is_lua = source.extension().and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("lua") || ext.eq_ignore_ascii_case("luac"))
        .unwrap_or(false);
    if !is_lua {
        return Err("Можно устанавливать только файлы .lua и .luac.".to_string());
    }

    let file_name = source.file_name()
        .ok_or("Не удалось определить имя файла.")?;
    let source_hash = sha256_file(&source)?;
    let destination = moonloader_dir.join(file_name);
    let disabled_destination = moonloader_dir.join(format!("{}.disabled", file_name.to_string_lossy()));

    // Последняя проверка непосредственно перед копированием защищает от гонки
    // между frontend-предупреждением и изменением содержимого папки.
    for candidate in [&destination, &disabled_destination] {
        match fs::symlink_metadata(candidate) {
            Ok(metadata) => {
                if !metadata.file_type().is_file() {
                    return Err(format!(
                        "Целевой путь уже занят не обычным файлом: {}",
                        candidate.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }

                let existing_hash = sha256_file(candidate)?;
                if existing_hash == source_hash {
                    return Err(format!(
                        "Идентичный файл {} уже существует. Установка пропущена.",
                        candidate.file_name().unwrap_or_default().to_string_lossy()
                    ));
                }

                return Err(format!(
                    "Целевой файл {} уже существует и имеет другое содержимое. Автоматическая замена запрещена.",
                    candidate.file_name().unwrap_or_default().to_string_lossy()
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("Не удалось проверить целевой путь: {}", error));
            }
        }
    }

    // Автоматическая защитная копия создаётся непосредственно перед установкой.
    let backup = create_moonloader_backup(&game_dir, &moonloader_dir, &format!("Автоматически перед установкой {}", file_name.to_string_lossy()))?;

    fs::copy(&source, &destination)
        .map_err(|e| format!("Ошибка установки скрипта (резервная копия {} сохранена): {}", backup.id, e))?;

    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let _ = append_activity_entry(&game_dir, game_label, "scripts", "installed", "Установлен Lua/LUAC-скрипт",
        &format!("Файл {}; резервная копия {}", file_name.to_string_lossy(), backup.id), "success");
    Ok(format!("Скрипт {} успешно установлен. Создана резервная копия {}.", file_name.to_string_lossy(), backup.id))
    }).await.map_err(|e| format!("Ошибка фоновой установки Lua: {}", e))?
}

// Запуск выбранного сервера Rodina RP
#[tauri::command]
fn launch_rodina(
    game_path: String,
    server: Option<String>,
    nickname: String,
) -> Result<String, String> {
    let game_dir = PathBuf::from(&game_path);

    if !game_dir.is_dir() {
        return Err("Выбранная папка игры не существует.".to_string());
    }

    let exe_path = game_dir.join("gta_sa.exe");

    if !exe_path.is_file() {
        return Err("В выбранной папке не найден gta_sa.exe.".to_string());
    }

    // Настройки серверов
    let server = server.unwrap_or_else(|| "Federal".to_string());

    let (host, port, mode, rodina_flag) = match server.as_str() {
        "Central" => (
    "central.rodina-rp.com",
    "7777",
    "-x",
    true,
), 

        "Southern" => (
            "southern.rodina-rp.com",
            "8904",
            "-z",
            true,
        ),

        "Federal" => (
            "federal.rodina-rp.com",
            "7777",
            "-x",
            true,
        ),

        "Northern" => (
            "northern.rodina-rp.com",
            "8904",
            "-x",
            true,
        ),

        "Primorsky" => (
            "primorsky.rodina-rp.com",
            "7777",
            "-x",
            true,
        ),

        "Western" => (
            "western.rodina-rp.com",
            "7777",
            "-x",
            false,
        ),

        "Eastern" => (
            "eastern.rodina-rp.com",
            "7777",
            "-x",
            true,
        ),

        _ => return Err("Неизвестный сервер Rodina RP.".to_string()),
    };

    let mut args = vec![
        "-c".to_string(),
        "-h".to_string(),
        host.to_string(),
        "-p".to_string(),
        port.to_string(),
        "-n".to_string(),
        nickname.trim().to_string(),
    ];

    if rodina_flag {
        args.push("-rodina".to_string());
    }

    args.push(mode.to_string());

    args.extend([
        "-mem".to_string(),
        "4096".to_string(),
        "-referrer".to_string(),
        "-ldo".to_string(),
        "-window".to_string(),
        "-modern_scale".to_string(),
        "-auth_cef_enable".to_string(),
    ]);

    Command::new(&exe_path)
        .args(&args)
        .current_dir(&game_dir)
        .spawn()
        .map_err(|error| {
            format!("Не удалось запустить Rodina RP: {}", error)
        })?;
    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let _ = append_activity_entry(&game_dir, game_label, "launch", "launched", "Запущена Rodina RP",
        &format!("Сервер {}; ник {}", server, nickname.trim()), "success");

    Ok(format!("Запуск сервера {} отправлен.", server))
}

// Запуск выбранного сервера Arizona RP
#[tauri::command]
fn launch_arizona(
    game_path: String,
    server: Option<String>,
    nickname: String,
) -> Result<String, String> {
    let game_dir = PathBuf::from(&game_path);

    if !game_dir.is_dir() {
        return Err("Выбранная папка игры не существует.".to_string());
    }

    let exe_path = game_dir.join("gta_sa.exe");

    if !exe_path.is_file() {
        return Err("В выбранной папке не найден gta_sa.exe.".to_string());
    }

    let server = server.unwrap_or_else(|| "Phoenix".to_string());

    let host = match server.as_str() {
        "Phoenix" => "185.169.134.3",
        "Tucson" => "185.169.134.4",
        "Scottdale" => "185.169.134.43",
        "Chandler" => "185.169.134.44",
        "Brainburg" => "185.169.134.45",
        "Saint Rose" => "185.169.134.5",
        "Mesa" => "185.169.134.59",
        "Red Rock" => "185.169.134.61",
        "Yuma" => "185.169.134.107",
        "Surprise" => "185.169.134.109",
        "Prescott" => "185.169.134.166",
        "Glendale" => "185.169.134.171",
        "Kingman" => "185.169.134.172",
        "Winslow" => "185.169.134.173",
        "Payson" => "185.169.134.174",
        "Gilbert" => "80.66.82.191",
        "Show-Low" => "80.66.82.190",
        "Casa-Grande" => "80.66.82.188",
        "Page" => "80.66.82.168",
        "Sun-City" => "80.66.82.159",
        "Queen-Creek" => "80.66.82.200",
        "Sedona" => "80.66.82.144",
        "Holiday" => "80.66.82.132",
        "Wednesday" => "80.66.82.128",
        "Yava" => "80.66.82.113",
        "Faraway" => "80.66.82.82",
        "Bumble Bee" => "80.66.82.87",
        "Christmas" => "80.66.82.54",
        "Mirage" => "mirage.arizona-rp.com",
        "Love" => "love.arizona-rp.com",
        "Drake" => "drake.arizona-rp.com",
        "Space" => "space.arizona-rp.com",
        "Home" => "home.arizona-rp.com",
        _ => return Err("Неизвестный сервер Arizona RP.".to_string()),
    };

    let args = vec![
        "-c".to_string(),
        "-h".to_string(),
        host.to_string(),
        "-p".to_string(),
        "7777".to_string(),
        "-n".to_string(),
        nickname.trim().to_string(),
    ];

    Command::new(&exe_path)
        .args(&args)
        .current_dir(&game_dir)
        .spawn()
        .map_err(|error| {
            format!("Не удалось запустить Arizona RP: {}", error)
        })?;
    let game_label = game_dir.file_name().and_then(|name| name.to_str()).unwrap_or("Сборка");
    let _ = append_activity_entry(&game_dir, game_label, "launch", "launched", "Запущена Arizona RP",
        &format!("Сервер {}; ник {}", server, nickname.trim()), "success");

    Ok(format!("Запуск сервера Arizona RP: {} отправлен.", server))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
        greet,
    launch_rodina,
    launch_arizona,
    get_moonloader_scripts,
    get_catalog_files,
    check_lua_install_conflicts,
    toggle_catalog_file,
    delete_catalog_file,
    delete_moonloader_script,
    toggle_moonloader_script,
    get_moonloader_log,
    install_lua_script,
    create_moonloader_backup_command,
    list_moonloader_backups,
    restore_moonloader_backup,
    delete_moonloader_backup,
    record_activity_log,
    list_activity_log,
    clear_activity_log
])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
