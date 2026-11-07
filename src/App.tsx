import { open, confirm } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type CSSProperties,
} from "react";
import {
  House,
  Code2,
  Search,
  Minus,
  Maximize2,
  X,
  Download,
  Settings,
  ChevronRight,
  Gamepad2,
  ArrowUpRight,
  Play,
  Activity,
  Folder,
  Monitor,
  Palette,
CheckCircle2,
Image,
Check,
SlidersHorizontal,
Puzzle,
UserRound,
CircleDot,
CalendarClock,
Trash2,
FileText,
  AlertTriangle,
  Fingerprint,
  Archive,
  RotateCcw,
  ShieldCheck,
  Trash,
  History,
  RefreshCw,
  Filter,
  CircleX,
  CircleCheck,
  Info
} from "lucide-react";

import "./App.css";

const navigation = [
  { id: "dashboard", label: "Главная", icon: House },
  { id: "scripts", label: "Каталог скриптов", icon: Code2 },
  { id: "downloads", label: "Загрузки", icon: Download },
  { id: "backups", label: "Резервные копии", icon: Archive },
  { id: "activity", label: "Лог лаунчера", icon: History },
  { id: "logs", label: "Логи MoonLoader", icon: FileText },
  { id: "settings", label: "Настройки", icon: Settings },
  { id: "updates", label: "Обновления", icon: RefreshCw },
];

const solidBackgrounds = {
  black: {
    name: "Pure Black",
    description: "Чистый чёрный",
    color: "#09090c",
  },
  graphite: {
    name: "Graphite",
    description: "Графитовый",
    color: "#15151b",
  },
  midnight: {
    name: "Midnight",
    description: "Тёмно-синий",
    color: "#0d1422",
  },
  wine: {
    name: "Dark Wine",
    description: "Тёмный бордовый",
    color: "#1b1016",
  },
} as const;

type SolidBackground = keyof typeof solidBackgrounds;

type NavigationPosition = "left" | "right" | "top" | "bottom";

type ButtonStyle =
  | "standard"
  | "glass"
  | "outline"
  | "filled"
  | "minimal";

type ButtonShape =
  | "square"
  | "rounded"
  | "oval"
  | "pill"
  | "cyber"
  | "hexagon"
  | "tech";

type FontFamily =
  | "inter"
  | "manrope"
  | "montserrat"
  | "exo2"
  | "roboto"
  | "russoone"
  | "gangoffour"
  | "modula"
  | "rubik";

type CatalogCategory =
  | "all"
  | "moonloader"
  | "cleo"
  | "asi"
  | "sampfuncs"
  | "ini"
  | "other";

type CatalogSort =
  | "name-asc"
  | "name-desc"
  | "size-asc"
  | "size-desc"
  | "date-desc"
  | "date-asc";

type CatalogConflict = {
  kind: string;
  severity: "info" | "warning" | "error";
  message: string;
  relatedPaths: string[];
  sameSha256: boolean | null;
};

type InstallConflictReport = {
  sourceName: string;
  sourceSha256: string;
  targetRelativePath: string;
  blocked: boolean;
  identicalTarget: boolean;
  conflicts: CatalogConflict[];
};

type MoonloaderBackup = {
  id: string;
  created_at: number;
  file_count: number;
  total_bytes: number;
  integrity_ok: boolean;
};

type LauncherActivity = {
  id: string;
  timestamp: number;
  game: string;
  category: string;
  action: string;
  title: string;
  details: string;
  status: "success" | "error" | "warning" | "info";
};

type CatalogFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  categories: CatalogCategory[];
  location: string;
  enabled: boolean;
  canToggle: boolean;
  canDelete: boolean;
  size: number;
  modifiedAt: number | null;
  sha256: string | null;
  conflicts: CatalogConflict[];
};

const catalogTabs: Array<{ id: CatalogCategory; label: string }> = [
  { id: "all", label: "Общее" },
  { id: "moonloader", label: "MoonLoader" },
  { id: "cleo", label: "CLEO" },
  { id: "asi", label: "ASI" },
  { id: "sampfuncs", label: "Sampfuncs" },
  { id: "ini", label: "INI" },
  { id: "other", label: "Прочее" },
];

const formatCatalogSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

function App() {

  const appWindow = getCurrentWindow();

const handleMinimize = async () => {
  await appWindow.minimize();
};

const handleMaximize = async () => {
  await appWindow.toggleMaximize();
};

const handleClose = async () => {
  await appWindow.close();
};

  const [activePage, setActivePage] = useState("dashboard");

  // ===== ЦЕНТР ОБНОВЛЕНИЙ =====

const [availableUpdate, setAvailableUpdate] =
  useState<Awaited<ReturnType<typeof check>>>(null);

const [updateChecking, setUpdateChecking] = useState(false);
const [updateInstalling, setUpdateInstalling] = useState(false);
const [updateProgress, setUpdateProgress] = useState(0);
const [updateStatus, setUpdateStatus] =
  useState("Проверка ещё не выполнялась");
const [updateError, setUpdateError] = useState("");

  // Выбранная игра
  const [game, setGame] = useState("Rodina RP");

  const [playerNickname, setPlayerNickname] = useState(
  () => localStorage.getItem("playerNickname") || ""
);

useEffect(() => {
  localStorage.setItem("playerNickname", playerNickname);
}, [playerNickname]);

  // Тип фонового оформления
const [backgroundMode, setBackgroundMode] = useState<
  "wallpaper" | "solid"
>(() => {
  return localStorage.getItem("rodina-background-mode") === "solid"
    ? "solid"
    : "wallpaper";
});

// Выбранный однотонный фон
const [solidBackground, setSolidBackground] =
  useState<SolidBackground>(() => {
    const saved = localStorage.getItem("rodina-solid-background");

    return saved && saved in solidBackgrounds
      ? saved as SolidBackground
      : "black";
  });

  // ===== НАСТРОЙКИ ОФОРМЛЕНИЯ =====

// Выбранные обои
const [selectedWallpaper, setSelectedWallpaper] = useState(() => {
  const saved = Number(localStorage.getItem("rodina-wallpaper"));

  return Number.isInteger(saved) && saved >= 1 && saved <= 11
    ? saved
    : 1;
});

// Два видеослота для плавного переключения обоев
const [wallpaperA, setWallpaperA] = useState<number | null>(
  selectedWallpaper
);

const [wallpaperB, setWallpaperB] = useState<number | null>(null);

const [activeWallpaperLayer, setActiveWallpaperLayer] =
  useState<"a" | "b">("a");

const [targetWallpaperLayer, setTargetWallpaperLayer] =
  useState<"a" | "b" | null>(null);

const [isWallpaperTransitioning, setIsWallpaperTransitioning] =
  useState(false);

// Цветовая тема
const [selectedTheme, setSelectedTheme] = useState<
  "auto" | "crimson" | "sakura" | "cyber" | "neon" | "monochrome"
>(() => {
  const saved = localStorage.getItem("rodina-theme");

  if (
    saved === "crimson" ||
    saved === "sakura" ||
    saved === "cyber" ||
    saved === "neon" ||
    saved === "monochrome"
  ) {
    return saved;
  }

  return "auto";
});

// Затемнение видеофона
const [backgroundDim, setBackgroundDim] = useState(() => {
  const saved = Number(localStorage.getItem("rodina-dim"));

  return Number.isFinite(saved) && saved >= 0 && saved <= 90
    ? saved
    : 58;
});

// Размытие видеофона
const [backgroundBlur, setBackgroundBlur] = useState(() => {
  const saved = Number(localStorage.getItem("rodina-blur"));

  return Number.isFinite(saved) && saved >= 0 && saved <= 10
    ? saved
    : 0;
});

// Прозрачность интерфейса
const [uiTransparency, setUiTransparency] = useState(() => {
  const saved = Number(
    localStorage.getItem("rodina-ui-transparency")
  );

  return Number.isFinite(saved) && saved >= 0 && saved <= 98
    ? saved
    : 18;
});

// Положение панели вкладок
const [navigationPosition, setNavigationPosition] =
  useState<NavigationPosition>("left");

// Стиль кнопок
const [buttonStyle, setButtonStyle] = useState<ButtonStyle>(() => {
  const saved = localStorage.getItem("rodina-button-style");

  return saved === "glass" ||
    saved === "outline" ||
    saved === "filled" ||
    saved === "minimal"
    ? saved
    : "standard";
});

// Форма кнопок
const [buttonShape, setButtonShape] = useState<ButtonShape>(() => {
  const saved = localStorage.getItem("rodina-button-shape");

  return saved === "rounded" ||
    saved === "oval" ||
    saved === "pill" ||
    saved === "cyber" ||
    saved === "hexagon" ||
    saved === "tech"
    ? saved
    : "square";
});

// Шрифт интерфейса
const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
  const saved = localStorage.getItem("rodina-font-family");

  return saved === "manrope" ||
    saved === "montserrat" ||
    saved === "exo2" ||
    saved === "roboto" ||
    saved === "russoone" ||
    saved === "gangoffour" ||
    saved === "modula" ||
    saved === "rubik"
    ? saved
    : "inter";
});

// Автоматическая цветовая гамма для каждого обоев
// Цветовая гамма для каждого обоя
const wallpaperThemes: Record<
  number,
  "crimson" | "sakura" | "cyber" | "neon" | "monochrome"
> = {
  1: "sakura",
  2: "cyber",
  3: "cyber",
  4: "cyber",
  5: "crimson",
  6: "sakura",
  7: "neon",
  8: "crimson",
  9: "monochrome",
  10: "monochrome",
  11: "neon",
};

// Цветовые палитры
const themePalettes = {
  crimson: {
    accent: "#d94a50",
    rgb: "217, 74, 80",
    light: "#ff8990",
    border: "#79343c",
  },

  sakura: {
    accent: "#c34c91",
    rgb: "195, 76, 145",
    light: "#f49acb",
    border: "#78385d",
  },

  cyber: {
    accent: "#398de0",
    rgb: "57, 141, 224",
    light: "#87c5ff",
    border: "#315b89",
  },

  neon: {
    accent: "#9955d9",
    rgb: "153, 85, 217",
    light: "#c99aff",
    border: "#604080",
  },

  monochrome: {
    accent: "#9299a8",
    rgb: "146, 153, 168",
    light: "#e0e3eb",
    border: "#555b69",
  },
};

const resolvedTheme =
  selectedTheme === "auto"
    ? backgroundMode === "solid"
      ? "crimson"
      : wallpaperThemes[selectedWallpaper] ?? "crimson"
    : selectedTheme;

const activePalette = themePalettes[resolvedTheme];

  const rodinaServers = [
  { id: "Central", name: "Центральный округ" },
  { id: "Southern", name: "Южный округ" },
  { id: "Federal", name: "Федеральный округ" },
  { id: "Northern", name: "Северный округ" },
  { id: "Primorsky", name: "Приморский округ" },
  { id: "Western", name: "Западный округ" },
  { id: "Eastern", name: "Восточный округ" },
];

const arizonaServers = [
  { id: "Phoenix", name: "Phoenix", address: "185.169.134.3:7777" },
  { id: "Tucson", name: "Tucson", address: "185.169.134.4:7777" },
  { id: "Scottdale", name: "Scottdale", address: "185.169.134.43:7777" },
  { id: "Chandler", name: "Chandler", address: "185.169.134.44:7777" },
  { id: "Brainburg", name: "Brainburg", address: "185.169.134.45:7777" },
  { id: "Saint Rose", name: "Saint Rose", address: "185.169.134.5:7777" },
  { id: "Mesa", name: "Mesa", address: "185.169.134.59:7777" },
  { id: "Red Rock", name: "Red Rock", address: "185.169.134.61:7777" },
  { id: "Yuma", name: "Yuma", address: "185.169.134.107:7777" },
  { id: "Surprise", name: "Surprise", address: "185.169.134.109:7777" },
  { id: "Prescott", name: "Prescott", address: "185.169.134.166:7777" },
  { id: "Glendale", name: "Glendale", address: "185.169.134.171:7777" },
  { id: "Kingman", name: "Kingman", address: "185.169.134.172:7777" },
  { id: "Winslow", name: "Winslow", address: "185.169.134.173:7777" },
  { id: "Payson", name: "Payson", address: "185.169.134.174:7777" },
  { id: "Gilbert", name: "Gilbert", address: "80.66.82.191:7777" },
  { id: "Show-Low", name: "Show-Low", address: "80.66.82.190:7777" },
  { id: "Casa-Grande", name: "Casa-Grande", address: "80.66.82.188:7777" },
  { id: "Page", name: "Page", address: "80.66.82.168:7777" },
  { id: "Sun-City", name: "Sun-City", address: "80.66.82.159:7777" },
  { id: "Queen-Creek", name: "Queen-Creek", address: "80.66.82.200:7777" },
  { id: "Sedona", name: "Sedona", address: "80.66.82.144:7777" },
  { id: "Holiday", name: "Holiday", address: "80.66.82.132:7777" },
  { id: "Wednesday", name: "Wednesday", address: "80.66.82.128:7777" },
  { id: "Yava", name: "Yava", address: "80.66.82.113:7777" },
  { id: "Faraway", name: "Faraway", address: "80.66.82.82:7777" },
  { id: "Bumble Bee", name: "Bumble Bee", address: "80.66.82.87:7777" },
  { id: "Christmas", name: "Christmas", address: "80.66.82.54:7777" },
  { id: "Mirage", name: "Mirage", address: "mirage.arizona-rp.com:7777" },
  { id: "Love", name: "Love", address: "love.arizona-rp.com:7777" },
  { id: "Drake", name: "Drake", address: "drake.arizona-rp.com:7777" },
  { id: "Space", name: "Space", address: "space.arizona-rp.com:7777" },
  { id: "Home", name: "Home", address: "home.arizona-rp.com:7777" },
];

const servers =
  game === "Arizona RP" ? arizonaServers : rodinaServers;

// Выбранный сервер
const [selectedServer, setSelectedServer] = useState(() => {
  return localStorage.getItem("selectedServer") || "Federal";
});

// Состояние меню выбора сервера
const [serverDropdownOpen, setServerDropdownOpen] = useState(false);

// Ссылка на выпадающее меню
const serverDropdownRef = useRef<HTMLDivElement | null>(null);

const handleServerChange = (value: string) => {
  setSelectedServer(value);

  localStorage.setItem(
    game === "Arizona RP"
      ? "selectedArizonaServer"
      : "selectedRodinaServer",
    value
  );
};

// Закрытие списка серверов при клике вне него
useEffect(() => {
  if (!serverDropdownOpen) return;

  const closeDropdown = (event: PointerEvent) => {
    const target = event.target;

    if (
      target instanceof Node &&
      !serverDropdownRef.current?.contains(target)
    ) {
      setServerDropdownOpen(false);
    }
  };

  window.addEventListener("pointerdown", closeDropdown);

  return () => {
    window.removeEventListener("pointerdown", closeDropdown);
  };
}, [serverDropdownOpen]);

// Состояние запуска
const [launching, setLaunching] = useState(false);
const [launchMessage, setLaunchMessage] = useState("");
const [launchError, setLaunchError] = useState(false);

// Пути к игровым папкам
const [gamePaths, setGamePaths] = useState<Record<string, string>>(() => {
  try {
    return JSON.parse(localStorage.getItem("gamePaths") || "{}");
  } catch {
    return {};
  }
});

// Каталог скриптов
const [moonloaderScripts, setMoonloaderScripts] = useState<
  Array<{ name: string; path: string; enabled: boolean }>
>([]);

const [scriptsStatus, setScriptsStatus] = useState(
  "Ожидает настройки пути"
);

// Универсальный локальный каталог модификаций.
const [catalogFiles, setCatalogFiles] = useState<CatalogFile[]>([]);
const [catalogCategory, setCatalogCategory] = useState<CatalogCategory>("all");
const [catalogSearches, setCatalogSearches] = useState<Record<CatalogCategory, string>>({
  all: "",
  moonloader: "",
  cleo: "",
  asi: "",
  sampfuncs: "",
  ini: "",
  other: "",
});
const [catalogSorts, setCatalogSorts] = useState<Record<CatalogCategory, CatalogSort>>({
  all: "name-asc",
  moonloader: "name-asc",
  cleo: "name-asc",
  asi: "name-asc",
  sampfuncs: "name-asc",
  ini: "name-asc",
  other: "name-asc",
});
const [catalogStatus, setCatalogStatus] = useState("Ожидает сканирования");
const [catalogLoading, setCatalogLoading] = useState(false);
const [expandedConflictId, setExpandedConflictId] = useState<string | null>(null);
const catalogRequestId = useRef(0);

// Состояние логов MoonLoader
const [moonloaderLog, setMoonloaderLog] = useState("");
const [logStatus, setLogStatus] = useState("Ожидает загрузки");
const [logLoading, setLogLoading] = useState(false);
const [logFilter, setLogFilter] = useState("all");
const [logSearch, setLogSearch] = useState("");
const [copyStatus, setCopyStatus] = useState("");
const [isDragOver, setIsDragOver] = useState(false);
const [installingScripts, setInstallingScripts] = useState(false);
const [installStatus, setInstallStatus] = useState("");
const [moonloaderBackups, setMoonloaderBackups] = useState<MoonloaderBackup[]>([]);
const [backupsLoading, setBackupsLoading] = useState(false);
const [backupActionLoading, setBackupActionLoading] = useState(false);
const [backupStatus, setBackupStatus] = useState("");

// Журнал действий самого RodinaLauncher.
const [activityEntries, setActivityEntries] = useState<LauncherActivity[]>([]);
const [activityLoading, setActivityLoading] = useState(false);
const [activityStatus, setActivityStatus] = useState("");
const [activityCategoryFilter, setActivityCategoryFilter] = useState("all");
const [activityResultFilter, setActivityResultFilter] = useState("all");
const [activitySearch, setActivitySearch] = useState("");
const [activityRefreshToken, setActivityRefreshToken] = useState(0);
// Сохранение настроек оформления
useEffect(() => {
  localStorage.setItem("rodina-wallpaper", String(selectedWallpaper));
}, [selectedWallpaper]);

useEffect(() => {
  localStorage.setItem("rodina-theme", selectedTheme);
}, [selectedTheme]);

useEffect(() => {
  localStorage.setItem("rodina-dim", String(backgroundDim));
}, [backgroundDim]);

useEffect(() => {
  localStorage.setItem("rodina-blur", String(backgroundBlur));
}, [backgroundBlur]);

useEffect(() => {
  localStorage.setItem("rodina-background-mode", backgroundMode);
}, [backgroundMode]);

useEffect(() => {
  localStorage.setItem("rodina-solid-background", solidBackground);
}, [solidBackground]);

// Подготовка новых обоев для перехода
useEffect(() => {
  const activeId =
    activeWallpaperLayer === "a" ? wallpaperA : wallpaperB;

  // Если выбраны уже активные обои — отменяем ожидающий переход
  if (selectedWallpaper === activeId) {
    setTargetWallpaperLayer(null);
    setIsWallpaperTransitioning(false);

    if (activeWallpaperLayer === "a") {
      setWallpaperB(null);
    } else {
      setWallpaperA(null);
    }

    return;
  }

  // Используем неактивный видеослот
  const nextLayer = activeWallpaperLayer === "a" ? "b" : "a";

  if (nextLayer === "a") {
    setWallpaperA(selectedWallpaper);
  } else {
    setWallpaperB(selectedWallpaper);
  }

  setTargetWallpaperLayer(nextLayer);
  setIsWallpaperTransitioning(false);

}, [
  selectedWallpaper,
  activeWallpaperLayer,
  wallpaperA,
  wallpaperB,
]);

    useEffect(() => {
  const storageKey =
    game === "Arizona RP"
      ? "selectedArizonaServer"
      : "selectedRodinaServer";

  const savedServer = localStorage.getItem(storageKey);

  const defaultServer =
    game === "Arizona RP" ? "Phoenix" : "Federal";

  setSelectedServer(
    savedServer &&
    servers.some((server) => server.id === savedServer)
      ? savedServer
      : defaultServer
  );
}, [game]);

useEffect(() => {
  localStorage.setItem(
    "rodina-ui-transparency",
    String(uiTransparency)
  );
}, [uiTransparency]);

// Сохранение настроек интерфейса
useEffect(() => {
  localStorage.setItem("rodina-nav-position", navigationPosition);
}, [navigationPosition]);

useEffect(() => {
  localStorage.setItem("rodina-button-style", buttonStyle);
}, [buttonStyle]);

useEffect(() => {
  localStorage.setItem("rodina-button-shape", buttonShape);
}, [buttonShape]);

useEffect(() => {
  localStorage.setItem("rodina-font-family", fontFamily);
}, [fontFamily]);

// Сканирование фиксированных областей игровой сборки для общего каталога.
const refreshCatalogFiles = useCallback(async () => {
  const requestId = ++catalogRequestId.current;
  const gamePath = gamePaths[game];

  if (!gamePath?.trim()) {
    setCatalogFiles([]);
    setCatalogLoading(false);
    setCatalogStatus("Сначала выбери папку игры");
    return;
  }

  setCatalogLoading(true);
  setCatalogFiles([]);
  setCatalogStatus("Сканирование файлов сборки...");

  try {
    const files = await invoke<CatalogFile[]>("get_catalog_files", {
      gamePath,
    });
    if (requestId !== catalogRequestId.current) return;
    setCatalogFiles(files);
    setCatalogStatus(`Найдено файлов: ${files.length}`);
  } catch (error) {
    if (requestId !== catalogRequestId.current) return;
    setCatalogFiles([]);
    setCatalogStatus(`Ошибка сканирования: ${String(error)}`);
  } finally {
    if (requestId === catalogRequestId.current) {
      setCatalogLoading(false);
    }
  }
}, [game, gamePaths]);

useEffect(() => {
  void refreshCatalogFiles();
}, [refreshCatalogFiles]);

// Загрузка списка скриптов MoonLoader для существующих счётчиков и загрузчика Lua.
useEffect(() => {
  const gamePath = gamePaths[game];
  let cancelled = false;

  if (!gamePath) {
    setMoonloaderScripts([]);
    setScriptsStatus("Ожидает настройки пути");
    return;
  }

  setScriptsStatus("Сканирование MoonLoader...");

  invoke<Array<{ name: string; path: string; enabled: boolean }>>(
    "get_moonloader_scripts",
    { gamePath }
  )
    .then((scripts) => {
      if (cancelled) return;

      setMoonloaderScripts(scripts);
      setScriptsStatus(
        scripts.length > 0
          ? "Найдено в папке MoonLoader"
          : "Lua-скрипты не найдены"
      );
    })
    .catch((error) => {
      if (cancelled) return;

      setMoonloaderScripts([]);
      setScriptsStatus(`Ошибка сканирования: ${String(error)}`);
    });

// Завершение crossfade


  return () => {
    cancelled = true;
  };
}, [game, gamePaths]);

const recordActivity = useCallback(async (
  category: string,
  action: string,
  title: string,
  details: string,
  status: "success" | "error" | "warning" | "info" = "success"
) => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) return;
  try {
    await invoke("record_activity_log", {
      gamePath,
      game,
      category,
      action,
      title,
      details,
      status,
    });
    setActivityRefreshToken((value) => value + 1);
  } catch (error) {
    // Ошибка журнала не должна ломать основное действие лаунчера.
    console.warn("Не удалось записать событие журнала:", error);
  }
}, [game, gamePaths]);

// Проверка доступности обновлений RodinaLauncher
const checkLauncherUpdate = useCallback(async () => {
  if (updateChecking || updateInstalling) return;

  setUpdateChecking(true);
  setUpdateError("");
  setUpdateStatus("Проверяем наличие обновлений...");

  try {
    const update = await check();

    setAvailableUpdate(update);

    if (update) {
      setUpdateStatus(`Доступна новая версия ${update.version}`);
    } else {
      setUpdateStatus("Установлена последняя версия RodinaLauncher");
    }
  } catch (error) {
    setAvailableUpdate(null);
    setUpdateError(String(error));
    setUpdateStatus("Не удалось проверить обновления");
  } finally {
    setUpdateChecking(false);
  }
}, [updateChecking, updateInstalling]);

// Загрузка и установка обновления
const installLauncherUpdate = useCallback(async () => {
  if (!availableUpdate || updateInstalling) return;

  setUpdateInstalling(true);
  setUpdateProgress(0);
  setUpdateError("");
  setUpdateStatus("Подготовка обновления...");

  let downloaded = 0;
  let contentLength = 0;

  try {
    await availableUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? 0;
          setUpdateStatus("Загрузка обновления...");
          break;

        case "Progress":
          downloaded += event.data.chunkLength;

          if (contentLength > 0) {
            setUpdateProgress(
              Math.min(100, Math.round(
                (downloaded / contentLength) * 100
              ))
            );
          }
          break;

        case "Finished":
          setUpdateProgress(100);
          setUpdateStatus("Загрузка завершена. Установка...");
          break;
      }
    });

    await relaunch();
  } catch (error) {
    setUpdateError(String(error));
    setUpdateStatus("Не удалось установить обновление");
    setUpdateInstalling(false);
  }
}, [availableUpdate, updateInstalling]);

const refreshActivityLog = useCallback(async () => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) {
    setActivityEntries([]);
    setActivityStatus("Сначала выбери папку игры в настройках.");
    return;
  }
  setActivityLoading(true);
  try {
    const entries = await invoke<LauncherActivity[]>("list_activity_log", {
      gamePath,
      limit: 500,
    });
    setActivityEntries(entries);
    setActivityStatus(entries.length ? `Показаны последние ${entries.length} событий` : "Записей пока нет");
  } catch (error) {
    setActivityStatus(`Не удалось загрузить журнал: ${String(error)}`);
  } finally {
    setActivityLoading(false);
  }
}, [game, gamePaths]);

const clearActivityLog = useCallback(async () => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) return;
  const accepted = await confirm(
    "Очистить весь журнал действий для выбранной сборки? Это действие нельзя отменить.",
    { title: "Очистка журнала лаунчера", kind: "warning" }
  );
  if (!accepted) return;
  setActivityLoading(true);
  try {
    await invoke("clear_activity_log", { gamePath });
    setActivityEntries([]);
    setActivityStatus("Журнал очищен.");
  } catch (error) {
    setActivityStatus(`Не удалось очистить журнал: ${String(error)}`);
  } finally {
    setActivityLoading(false);
  }
}, [game, gamePaths]);

useEffect(() => {
  if (activePage === "activity") void refreshActivityLog();
}, [activePage, refreshActivityLog, activityRefreshToken]);

const refreshMoonloaderBackups = useCallback(async () => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) {
    setMoonloaderBackups([]);
    setBackupStatus("Сначала выбери папку игры.");
    return;
  }
  setBackupsLoading(true);
  try {
    const items = await invoke<MoonloaderBackup[]>("list_moonloader_backups", { gamePath });
    setMoonloaderBackups(items);
    setBackupStatus(items.length ? `Найдено резервных копий: ${items.length}` : "Резервных копий пока нет.");
  } catch (error) {
    setBackupStatus(`Ошибка загрузки: ${String(error)}`);
  } finally {
    setBackupsLoading(false);
  }
}, [game, gamePaths]);

const createMoonloaderBackup = useCallback(async () => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) return;
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Выберите папку для сохранения резервной копии MoonLoader",
    });
    if (typeof selected !== "string" || !selected.trim()) return;
    setBackupActionLoading(true);
    setBackupStatus("Создание резервной копии в выбранной папке. Лаунчер можно продолжать использовать...");
    const result = await invoke<MoonloaderBackup>("create_moonloader_backup_command", {
      gamePath,
      destinationPath: selected,
    });
    setBackupStatus(`Копия создана: ${result.id} · ${result.file_count} файлов · ${selected}`);
    await refreshMoonloaderBackups();
  } catch (error) {
    setBackupStatus(`Не удалось создать копию: ${String(error)}`);
    await recordActivity("backup", "create_failed", "Не удалось создать резервную копию", String(error), "error");
  } finally {
    setBackupActionLoading(false);
  }
}, [game, gamePaths, refreshMoonloaderBackups, recordActivity]);

const restoreMoonloaderBackup = useCallback(async (backupId: string) => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) return;
  const accepted = await confirm(
    `Восстановить MoonLoader из копии ${backupId}? Текущая папка будет заменена. Перед восстановлением лаунчер автоматически сохранит её текущее состояние.`,
    { title: "Восстановление MoonLoader", kind: "warning" }
  );
  if (!accepted) return;
  setBackupActionLoading(true);
  setBackupStatus("Проверка целостности и восстановление...");
  try {
    const result = await invoke<string>("restore_moonloader_backup", { gamePath, backupId });
    setBackupStatus(result);
    await refreshMoonloaderBackups();
    const updatedScripts = await invoke<Array<{ name: string; path: string; enabled: boolean }>>(
      "get_moonloader_scripts", { gamePath }
    );
    setMoonloaderScripts(updatedScripts);
    await refreshCatalogFiles();
  } catch (error) {
    setBackupStatus(`Ошибка восстановления: ${String(error)}`);
    await recordActivity("backup", "restore_failed", "Ошибка восстановления MoonLoader", `${backupId}: ${String(error)}`, "error");
  } finally {
    setBackupActionLoading(false);
  }
}, [game, gamePaths, refreshMoonloaderBackups, refreshCatalogFiles, recordActivity]);

const deleteMoonloaderBackup = useCallback(async (backupId: string) => {
  const gamePath = gamePaths[game];
  if (!gamePath?.trim()) return;
  const accepted = await confirm(`Удалить резервную копию ${backupId}? Это действие нельзя отменить.`,
    { title: "Удаление резервной копии", kind: "warning" });
  if (!accepted) return;
  setBackupActionLoading(true);
  try {
    const result = await invoke<string>("delete_moonloader_backup", { gamePath, backupId });
    setBackupStatus(result);
    await refreshMoonloaderBackups();
  } catch (error) {
    setBackupStatus(`Ошибка удаления: ${String(error)}`);
    await recordActivity("backup", "delete_failed", "Ошибка удаления резервной копии", `${backupId}: ${String(error)}`, "error");
  } finally {
    setBackupActionLoading(false);
  }
}, [game, gamePaths, refreshMoonloaderBackups, recordActivity]);

useEffect(() => {
  if (activePage === "backups") void refreshMoonloaderBackups();
}, [activePage, refreshMoonloaderBackups]);


// Установка Lua-файлов
const installLuaFiles = useCallback(async (paths: string[]) => {
  const gamePath = gamePaths[game];

  if (!gamePath) {
    setInstallStatus("Сначала выбери папку игры.");
    return;
  }

  const luaPaths = paths.filter((path) => {
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith(".lua") ||
         lowerPath.endsWith(".luac");
  });

  const rejectedCount = paths.length - luaPaths.length;

  if (luaPaths.length === 0) {
    setInstallStatus("Можно устанавливать только файлы .lua.");
    return;
  }

  setInstallingScripts(true);
  const messages: string[] = [];

  try {
    for (const sourcePath of luaPaths) {
      const fileName = sourcePath.split(/[\\/]/).pop() || sourcePath;

      try {
        // Проверяем относительный путь, совпадения имён и SHA-256 до установки.
        const report = await invoke<InstallConflictReport>(
          "check_lua_install_conflicts",
          { gamePath, sourcePath }
        );

        if (report.blocked) {
          const reason = report.conflicts
            .filter((conflict) => conflict.severity === "error")
            .map((conflict) => `${conflict.message} ${conflict.relatedPaths.join(", ")}`)
            .join("\n");
          messages.push(`✕ ${fileName}: ${reason || "Целевой путь уже занят."}\nSHA-256 исходного файла: ${report.sourceSha256}`);
          await recordActivity("scripts", "install_blocked", "Установка скрипта заблокирована проверкой конфликтов", `${fileName}: ${reason || "Целевой путь уже занят."}`, "warning");
          continue;
        }

        if (report.conflicts.length > 0) {
          const details = report.conflicts.map((conflict) => {
            const paths = conflict.relatedPaths.length
              ? `\n  Пути: ${conflict.relatedPaths.join(", ")}`
              : "";
            return `• ${conflict.message}${paths}`;
          }).join("\n\n");

          const accepted = await confirm(
            `Для файла ${fileName} найдены совпадения:\n\n${details}\n\nSHA-256 исходного файла:\n${report.sourceSha256}\n\nПродолжить установку без перезаписи существующих файлов?`,
            { title: "Проверка конфликтов", kind: "warning" }
          );

          if (!accepted) {
            messages.push(`↷ ${fileName}: установка пропущена пользователем.`);
            continue;
          }
        }

        const result = await invoke<string>("install_lua_script", {
          gamePath,
          sourcePath,
        });

        messages.push(`✓ ${result}`);
      } catch (error) {
        messages.push(`✕ ${fileName}: ${String(error)}`);
        await recordActivity("scripts", "install_failed", "Ошибка установки Lua/LUAC-скрипта", `${fileName}: ${String(error)}`, "error");
      }
    }

    if (rejectedCount > 0) {
      messages.push(
        `Пропущено файлов с неподходящим расширением: ${rejectedCount}`
      );
    }

    setInstallStatus(messages.join("\n"));

    // Обновляем каталог скриптов после установки
    try {
      const updatedScripts = await invoke<{
  name: string;
  path: string;
  enabled: boolean;
}[]>("get_moonloader_scripts", {
  gamePath,
});

      setMoonloaderScripts(updatedScripts);
      await refreshCatalogFiles();
    } catch (error) {
      messages.push(
        `Не удалось обновить каталог: ${String(error)}`
      );
      setInstallStatus(messages.join("\n"));
    }
  } finally {
    setInstallingScripts(false);
  }
}, [game, gamePaths, refreshCatalogFiles, recordActivity]);

// Удаление файла из универсального каталога.
const handleDeleteScript = async (file: CatalogFile) => {
  const accepted = await confirm(
    `Ты действительно хочешь удалить ${file.name}?\n\nПуть: ${file.relativePath}`,
    {
      title: "Удаление файла",
      kind: "warning",
    }
  );

  if (!accepted) return;

  try {
    await invoke<string>("delete_catalog_file", {
      gamePath: gamePaths[game],
      filePath: file.path,
    });

    await refreshCatalogFiles();

    if (file.location === "MoonLoader") {
      const scripts = await invoke<Array<{ name: string; path: string; enabled: boolean }>>(
        "get_moonloader_scripts",
        { gamePath: gamePaths[game] }
      );
      setMoonloaderScripts(scripts);
    }

    setCatalogStatus(`Файл ${file.name} удалён`);
  } catch (error) {
    setCatalogStatus(`Ошибка удаления: ${String(error)}`);
    await recordActivity("catalog", "delete_failed", "Ошибка удаления модификации", `${file.name}: ${String(error)}`, "error");
  }
};

// Включение и выключение файла из универсального каталога.
const handleToggleScript = async (file: CatalogFile, enabled: boolean) => {
  if (!file.canToggle) return;

  if (file.extension === "ini" && !enabled) {
    const accepted = await confirm(
      `Изменение имени INI-файла может привести к сбросу настроек соответствующей модификации.\n\nПродолжить?`,
      { title: "Отключение конфигурации", kind: "warning" }
    );
    if (!accepted) return;
  }

  if (file.name.toLowerCase().startsWith("sampfuncs.asi") && !enabled) {
    const accepted = await confirm(
      "Отключение SAMPFUNCS может повлиять на работу других модификаций. Продолжить?",
      { title: "Отключение SAMPFUNCS", kind: "warning" }
    );
    if (!accepted) return;
  }

  try {
    await invoke<string>("toggle_catalog_file", {
      gamePath: gamePaths[game],
      filePath: file.path,
      enabled,
    });

    // Переключение меняет только расширение файла. Не запускаем полное
    // сканирование всех модификаций и повторный SHA-256 для каждой записи.
    const nextPath = enabled
      ? file.path.replace(/\.disabled$/i, "")
      : `${file.path}.disabled`;
    const nextRelativePath = enabled
      ? file.relativePath.replace(/\.disabled$/i, "")
      : `${file.relativePath}.disabled`;
    setCatalogFiles((current) => current.map((item) => item.id === file.id
      ? { ...item, path: nextPath, relativePath: nextRelativePath, enabled }
      : item));

    if (file.location === "MoonLoader") {
      setMoonloaderScripts((current) => current.map((script) => script.path === file.path
        ? { ...script, path: nextPath, enabled }
        : script));
    }

    setCatalogStatus(`Состояние файла ${file.name} обновлено`);
  } catch (error) {
    setCatalogStatus(`Ошибка изменения файла: ${String(error)}`);
    await recordActivity("catalog", "toggle_failed", "Ошибка изменения состояния модификации", `${file.name}: ${String(error)}`, "error");
  }
};

// Выбор папки игры
const chooseGameFolder = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: `Выбери папку ${game}`,
  });

  if (typeof selected !== "string") return;

  const updated = {
    ...gamePaths,
    [game]: selected,
  };

  setGamePaths(updated);
  localStorage.setItem("gamePaths", JSON.stringify(updated));
};

// Загрузка логов MoonLoader
const loadMoonloaderLog = useCallback(async () => {
  const gamePath = gamePaths[game];

  if (!gamePath) {
    setMoonloaderLog("");
    setLogStatus("Сначала выбери папку игры.");
    return;
  }

  setLogLoading(true);
  setLogStatus("Загрузка логов...");

  try {
    const result = await invoke<string>("get_moonloader_log", {
      gamePath,
    });
    

    setMoonloaderLog(result);
    setLogStatus(
      result.trim()
        ? "Лог успешно загружен"
        : "Файл лога пуст"
    );
  } catch (error) {
    setMoonloaderLog("");
    setLogStatus(String(error));
  } finally {
    setLogLoading(false);
  }
}, [game, gamePaths]);


// Автоматическая загрузка при открытии вкладки логов
useEffect(() => {
  if (activePage === "logs") {
    void loadMoonloaderLog();
  }
}, [activePage, loadMoonloaderLog]);

// Обработка перетаскивания файлов в окно
useEffect(() => {
  let unlisten: (() => void) | undefined;
  let disposed = false;

  getCurrentWebview()
    .onDragDropEvent((event) => {
      if (activePage !== "downloads") return;

      if (
        event.payload.type === "enter" ||
        event.payload.type === "over"
      ) {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      } else if (event.payload.type === "drop") {
        setIsDragOver(false);
        void installLuaFiles(event.payload.paths);
      }
    })
    .then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    })
    .catch((error) => {
      if (!disposed) {
        setInstallStatus(
          `Ошибка Drag & Drop: ${String(error)}`
        );
      }
    });

  return () => {
    disposed = true;
    unlisten?.();
    setIsDragOver(false);
  };
}, [activePage, installLuaFiles]);

// Выбор Lua-файлов через системное окно
const chooseLuaFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Lua scripts",
          extensions: ["lua", "luac"],
        },
      ],
    });

    if (!selected) return;

    const paths = Array.isArray(selected)
      ? selected
      : [selected];

    await installLuaFiles(paths);
  } catch (error) {
    setInstallStatus(
      `Не удалось выбрать файлы: ${String(error)}`
    );
  }
};


// Запуск Rodina RP
const launchGame = async () => {
  const gamePath = gamePaths[game];

  if (!gamePath) {
    setLaunchError(true);
    setLaunchMessage(`Сначала выбери папку ${game}.`);
    return;
  }

  setLaunching(true);
  setLaunchMessage("");
  setLaunchError(false);

  try {
  const command =
    game === "Arizona RP" ? "launch_arizona" : "launch_rodina";

  const nickname = playerNickname.trim();

  if (!nickname) {
    setLaunchError(true);
    setLaunchMessage("Сначала введи игровой ник.");
    return;
  }

  const result = await invoke<string>(command, {
  gamePath,
  server: selectedServer,
  nickname: playerNickname.trim(),
});

  setLaunchMessage(result);
} catch (error) {
  setLaunchError(true);
  setLaunchMessage(String(error));
  await recordActivity("launch", "launch_failed", "Не удалось запустить игру", `${game} · ${selectedServer}: ${String(error)}`, "error");
} finally {
  setLaunching(false);
 }
};

// Определение уровня сообщения в логе
const getLogLevel = (line: string) => {
  const text = line.toLowerCase();

  if (/\b(error|exception|failed|fatal)\b/.test(text)) {
    return "error";
  }

  if (/\b(warning|warn)\b/.test(text)) {
    return "warning";
  }

  return "info";
};

const highlightLogText = (text: string) => {
  const query = logSearch.trim();

  if (!query) return text;

  const escapedQuery = query.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const parts = text.split(
    new RegExp(`(${escapedQuery})`, "gi")
  );

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark className="log-highlight" key={index}>
        {part}
      </mark>
    ) : (
      part
    )
  );
};
// Применение фильтра логов
const logLines = moonloaderLog
  .split(/\r?\n/)
  .filter((line) => {
    const matchesFilter =
      logFilter === "all" ||
      getLogLevel(line) === logFilter;

    const matchesSearch =
      !logSearch.trim() ||
      line.toLowerCase().includes(logSearch.trim().toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Запуск нового видео после загрузки
const handleWallpaperCanPlay = (
  layer: "a" | "b",
  video: HTMLVideoElement
) => {
  if (targetWallpaperLayer !== layer) return;

  void video.play()
    .then(() => {
      setIsWallpaperTransitioning(true);
    })
    .catch(() => {
      // При ошибке воспроизведения сохраняем текущие обои
    });
};

// Завершение плавного перехода
const finishWallpaperTransition = (layer: "a" | "b") => {
  if (
    !isWallpaperTransitioning ||
    targetWallpaperLayer !== layer
  ) {
    return;
  }

  setActiveWallpaperLayer(layer);
  setTargetWallpaperLayer(null);
  setIsWallpaperTransitioning(false);

  // Освобождаем предыдущий видеослот
  if (layer === "a") {
    setWallpaperB(null);
  } else {
    setWallpaperA(null);
  }
};

const wallpaperOptions = [
  { type: "video" as const, id: 1, name: "Shadow Blade Monochrome", category: "ANIME" },
  { type: "video" as const, id: 2, name: "BMW F30 Drifting", category: "CARS" },
  { type: "video" as const, id: 3, name: "Dark Gothic Castle", category: "FANTASY" },
  { type: "video" as const, id: 4, name: "Evil Deity", category: "ANIME" },
  { type: "video" as const, id: 5, name: "Ferrari F40 Liberty Walk", category: "CARS" },
  { type: "video" as const, id: 6, name: "Katana Blade Sakura", category: "FANTASY" },
  { type: "video" as const, id: 7, name: "Knight Red Cloak", category: "FANTASY" },
  { type: "video" as const, id: 8, name: "Oni Mask Monochrome", category: "ANIME" },
  { type: "video" as const, id: 9, name: "Porsche 911 GT3 Sakura", category: "CARS" },
  { type: "video" as const, id: 10, name: "Porsche 991.2 GT3 Drift", category: "CARS" },
  { type: "video" as const, id: 11, name: "Toyota Chaser Tunnel", category: "CARS" },
  ...Object.entries(solidBackgrounds).map(([id, option]) => ({
    type: "solid" as const,
    id: id as SolidBackground,
    name: option.name,
    category: "MINIMAL",
    color: option.color,
  })),
];

  const activeCatalogSearch = catalogSearches[catalogCategory].trim().toLocaleLowerCase();
  const activeCatalogSort = catalogSorts[catalogCategory];
  const visibleCatalogFiles = catalogFiles
    .filter((file) => catalogCategory === "all" || file.categories.includes(catalogCategory))
    .filter((file) => {
      if (!activeCatalogSearch) return true;
      return `${file.name} ${file.relativePath} ${file.extension}`
        .toLocaleLowerCase()
        .includes(activeCatalogSearch);
    })
    .sort((a, b) => {
      switch (activeCatalogSort) {
        case "name-desc":
          return b.name.localeCompare(a.name, "ru", { sensitivity: "base" });
        case "size-asc":
          return a.size - b.size;
        case "size-desc":
          return b.size - a.size;
        case "date-desc":
          return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
        case "date-asc":
          return (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
      }
    });

  const catalogTabCount = (category: CatalogCategory) =>
    category === "all"
      ? catalogFiles.length
      : catalogFiles.filter((file) => file.categories.includes(category)).length;

  const visibleActivityEntries = activityEntries.filter((entry) => {
    const matchesCategory = activityCategoryFilter === "all" || entry.category === activityCategoryFilter;
    const matchesStatus = activityResultFilter === "all" || entry.status === activityResultFilter;
    const query = activitySearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || `${entry.title} ${entry.details} ${entry.game} ${entry.action}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesStatus && matchesSearch;
  });
  const activitySuccessCount = activityEntries.filter((entry) => entry.status === "success").length;
  const activityErrorCount = activityEntries.filter((entry) => entry.status === "error").length;
  const activityWarningCount = activityEntries.filter((entry) => entry.status === "warning").length;

  return (
  <div
  className={`launcher theme-${resolvedTheme} ${
  backgroundMode === "solid" ? "solid-background" : ""
} nav-position-${navigationPosition} buttons-${buttonStyle} shape-${buttonShape} font-${fontFamily}`}
  style={{
    background: backgroundMode === "solid"
  ? solidBackgrounds[solidBackground].color
  : undefined,
    "--ui-opacity": Math.min(1, Math.max(0.02, 1 - uiTransparency / 100)),
    "--theme-accent": activePalette.accent,
    "--theme-accent-rgb": activePalette.rgb,
    "--theme-accent-light": activePalette.light,
    "--theme-border": activePalette.border,
  } as CSSProperties}
>
    {/* АНИМИРОВАННЫЙ ФОН */}
{/* ДВА ВИДЕОСЛОТА ДЛЯ CROSSFADE */}
<div className="wallpaper-stack">

  {/* ВИДЕОСЛОТ A */}
  {wallpaperA !== null && (
    <video
      key={`wallpaper-a-${wallpaperA}`}
      className={`launcher-wallpaper wallpaper-layer ${
        isWallpaperTransitioning && targetWallpaperLayer === "a"
          ? "wallpaper-incoming"
          : isWallpaperTransitioning && activeWallpaperLayer === "a"
            ? "wallpaper-outgoing"
            : activeWallpaperLayer === "a"
              ? "wallpaper-active"
              : "wallpaper-hidden"
      }`}
      src={`/wallpapers/wallpaper-${String(wallpaperA).padStart(2, "0")}.mp4`}
      autoPlay={activeWallpaperLayer === "a"}
      loop
      muted
      playsInline
      preload="auto"
      onCanPlay={(event) =>
        handleWallpaperCanPlay("a", event.currentTarget)
      }
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "opacity"
        ) {
          finishWallpaperTransition("a");
        }
      }}
      style={{
        filter: backgroundBlur > 0
          ? `blur(${backgroundBlur}px)`
          : "none",
        transform: backgroundBlur > 0
          ? "scale(1.04)"
          : "none",
      }}
    />
  )}

  {/* ВИДЕОСЛОТ B */}
  {wallpaperB !== null && (
    <video
      key={`wallpaper-b-${wallpaperB}`}
      className={`launcher-wallpaper wallpaper-layer ${
        isWallpaperTransitioning && targetWallpaperLayer === "b"
          ? "wallpaper-incoming"
          : isWallpaperTransitioning && activeWallpaperLayer === "b"
            ? "wallpaper-outgoing"
            : activeWallpaperLayer === "b"
              ? "wallpaper-active"
              : "wallpaper-hidden"
      }`}
      src={`/wallpapers/wallpaper-${String(wallpaperB).padStart(2, "0")}.mp4`}
      autoPlay={activeWallpaperLayer === "b"}
      loop
      muted
      playsInline
      preload="auto"
      onCanPlay={(event) =>
        handleWallpaperCanPlay("b", event.currentTarget)
      }
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "opacity"
        ) {
          finishWallpaperTransition("b");
        }
      }}
      style={{
        filter: backgroundBlur > 0
          ? `blur(${backgroundBlur}px)`
          : "none",
        transform: backgroundBlur > 0
          ? "scale(1.04)"
          : "none",
      }}
    />
  )}

</div>

{/* ЗАТЕМНЕНИЕ ПОВЕРХ ВИДЕО */}
{backgroundMode === "wallpaper" && (
  <div
    className="launcher-wallpaper-overlay"
    style={{
      backgroundColor: `rgba(0, 0, 0, ${backgroundDim / 100})`,
    }}
  />
)}


{/* CUSTOM WINDOW TITLEBAR */}
<header className="window-titlebar" data-tauri-drag-region>
  {/* Пустая область для перетаскивания окна */}
  <div
    data-tauri-drag-region
    style={{ flex: 1, height: "100%" }}
  />

  <div className="window-controls">
    <button
      className="window-control minimize"
      onClick={handleMinimize}
      title="Свернуть"
    >
      <Minus size={17} />
    </button>

    <button
      className="window-control maximize"
      onClick={handleMaximize}
      title="Развернуть / восстановить"
    >
      <Maximize2 size={14} />
    </button>

    <button
      className="window-control close"
      onClick={handleClose}
      title="Закрыть"
    >
      <X size={17} />
    </button>
  </div>
</header>

<aside className="sidebar">
  <div className="brand">
    <div className="brand-logo">
      <svg viewBox="0 0 48 48" fill="none">
        <path
          d="M10 8H27C35 8 39 12 39 20C39 26 36 29 31 31L40 41H29L20 30H20V41H10V8Z"
          fill="currentColor"
        />
        <path
          d="M20 17V24H26C29 24 30 23 30 20.5C30 18 29 17 26 17H20Z"
          fill="#0b0b0f"
        />
      </svg>
    </div>

    <div>
      <div className="brand-title">RODINA</div>
      <div className="brand-subtitle">GAMES LAUNCHER</div>
    </div>
  </div>

        <div className="sidebar-caption">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => setActivePage(item.id)}
            >
              <item.icon size={18} strokeWidth={1.8} className="nav-icon" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-status">
            <span className="status-dot" />
            <span>Лаунчер готов к работе</span>
          </div>
          <div className="version-info">
  <span>VERSION 0.1.1 BETA</span>
  <small>by Svarovsky</small>
</div>
        </div>
      </aside>

      <main
  className={`main-content ${
    activePage === "dashboard" ? "main-content-dashboard" : ""
  }`}
>
        <header className="topbar">
          <div className="breadcrumb">
            RODINA LAUNCHER <span>/</span> {navigation.find((item) => item.id === activePage)?.label ?? "Настройки"}
          </div>
          <div className="topbar-right">
            <span className="topbar-indicator">
  <Activity size={14} />
  SYSTEM ONLINE
</span>
            <div className="avatar">R</div>
          </div>
        </header>

        <section
  className={`content ${activePage === "downloads" ? "content-no-scroll" : ""}`}
  key={activePage}
>
  {activePage === "dashboard" ? (
    <>
          <div className="welcome">
            <div>
              <div className="eyebrow">YOUR GAMING EXPERIENCE</div>
              <h1>Игровой центр<span>.</span></h1>
              <p>Всё необходимое для комфортной игры — в одном месте.</p>
            </div>
            <div className="build-label">PREMIUM EDITION</div>
          </div>

          <div className="game-selector">
            <div>
              <div className="card-label">ВЫБРАННЫЙ ПРОЕКТ</div>
              <div className="game-name">{game}</div>
              <div className="game-description">
                {game === "Rodina RP"
                  ? "Игровой профиль Rodina Games"
                  : "Игровой профиль Arizona Games"}
              </div>
            </div>
            
            <div className="folder-selection">
  <div className="folder-selection-heading">
    <span className="folder-selection-label">
      ПАПКА ИГРЫ
    </span>

    <span
      className={`folder-selection-status ${
        gamePaths[game] ? "is-set" : "is-empty"
      }`}
    >
      <CircleDot size={11} />
      {gamePaths[game] ? "ПУТЬ УКАЗАН" : "НЕ ВЫБРАНА"}
    </span>
  </div>

  {gamePaths[game] ? (
    <div
      className="folder-path-card"
      title={gamePaths[game]}
    >
      <div className="folder-path-icon">
        <Folder size={18} />
      </div>

      <div className="folder-path-text">
        <span>РАСПОЛОЖЕНИЕ СБОРКИ</span>
        <strong>{gamePaths[game]}</strong>
      </div>

      <button
        className="folder-change-button"
        onClick={chooseGameFolder}
        title="Изменить папку игры"
      >
        <Folder size={16} />
      </button>
    </div>
  ) : (
    <button
      className="folder-empty-button"
      onClick={chooseGameFolder}
    >
      <Folder size={17} />
      Выбрать папку игры
    </button>
  )}
</div>

            <div className="game-switch">
              <button
                className={game === "Rodina RP" ? "selected" : ""}
                onClick={() => setGame("Rodina RP")}
              >
                RODINA
              </button>
              <button
                className={game === "Arizona RP" ? "selected" : ""}
                onClick={() => setGame("Arizona RP")}
              >
                ARIZONA
              </button>
            </div>
          </div>

          <div className="section-heading">
            <div>
              <h2>Обзор системы</h2>
              <p>Состояние игрового окружения</p>
            </div>
            <span className="live-label">LIVE OVERVIEW</span>
          </div>

          
<div className="stats-grid">
  <div className="stat-card">
    <div className="stat-top">
      <Monitor size={21} className="stat-icon" />
      <span className="stat-tag">GAME</span>
    </div>

    <div className="stat-title">Сборка</div>

    <div className="stat-value">
      {gamePaths[game] ? "Путь указан" : "Не найдена"}
    </div>

    <div className="stat-footer">
      {gamePaths[game]
        ? "Папка игры настроена"
        : "Ожидает настройки пути"}
    </div>
  </div>



<div className="stat-card">
  <div className="stat-top">
    <Puzzle size={21} className="stat-icon" />
    <span className="stat-tag">SCRIPTS</span>
  </div>

  <div className="stat-title">Установленные скрипты</div>

  <div className="stat-value">
    {moonloaderScripts.length} <small>шт.</small>
  </div>

  <div className="stat-footer">
    {scriptsStatus}
  </div>
</div>


            <div className="stat-card">
              <div className="stat-top">
                <UserRound size={21} className="stat-icon" />
                <span className="stat-tag">PROFILE</span>
              </div>
              <div className="stat-title">Активный профиль</div>
              <div className="stat-value">{game}</div>
              <div className="stat-footer">Выбранный игровой проект</div>
            </div>
          </div>

          <div className="bottom-grid">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Быстрый запуск</h3>
                  <p>Подготовка игрового клиента</p>
                </div>
                <ArrowUpRight size={20} className="panel-icon" />
              </div>
              <div className="launch-placeholder">
  <div className="launch-symbol">
    <Gamepad2 size={27} />
  </div>

  <div className="launch-title">
    {game}
  </div>

  <div className="nickname-selector">
  <label className="server-label">
    ИГРОВОЙ НИК
  </label>

  <input
    type="text"
    className="nickname-input"
    placeholder="Введи свой ник"
    value={playerNickname}
    onChange={(event) => setPlayerNickname(event.target.value)}
    maxLength={24}
  />
</div>

  {(game === "Rodina RP" || game === "Arizona RP") && (
  <div className="server-selector">
    <label className="server-label">
      ИГРОВОЙ СЕРВЕР
    </label>

    <div
  className="server-dropdown"
  ref={serverDropdownRef}
>
  <button
    type="button"
    className={`server-dropdown-trigger ${
      serverDropdownOpen ? "open" : ""
    }`}
    onClick={() => setServerDropdownOpen((current) => !current)}
    aria-haspopup="listbox"
    aria-expanded={serverDropdownOpen}
  >
    <span className="server-dropdown-current">
      {servers.find((server) => server.id === selectedServer)?.name
        ?? "Выбери сервер"}
    </span>

    <ChevronRight
      size={17}
      className={`server-dropdown-chevron ${
        serverDropdownOpen ? "open" : ""
      }`}
    />
  </button>

  {serverDropdownOpen && (
    <div
      className="server-dropdown-menu"
      role="listbox"
      aria-label="Выбор игрового сервера"
    >
      {servers.map((server) => (
        <button
  key={server.id}
  type="button"
  role="option"
  aria-selected={selectedServer === server.id}
  className={`server-dropdown-option ${
    selectedServer === server.id ? "selected" : ""
  }`}
  onClick={() => {
    handleServerChange(server.id);
    setServerDropdownOpen(false);
  }}
>
  <span className="server-option-info">
    <span className="server-option-name">{server.name}</span>

    {"address" in server &&
  typeof server.address === "string" && (
    <small className="server-option-address">
      {server.address}
    </small>
  )}
  </span>
</button>
      ))}
    </div>
  )}
</div>
  </div>
)}

  <div className="launch-description">
    {gamePaths[game]
      ? "Игровой клиент готов к запуску."
      : "Сначала укажи папку установленной игры."}
  </div>

  <button
    className="launch-button"
    onClick={launchGame}
    disabled={launching || !gamePaths[game]}
  >
    <span><Play size={15} /></span>
    {launching ? "ЗАПУСК..." : "ЗАПУСТИТЬ ИГРУ"}
  </button>

  {launchMessage && (
    <div
      style={{
        marginTop: 12,
        fontSize: 12,
        color: launchError ? "#ff6475" : "#8fd6a8",
        textAlign: "center",
      }}
    >
      {launchMessage}
    </div>
  )}

    {!gamePaths[game] && (
    <div className="disabled-note">
      Запуск станет доступен после настройки
    </div>
  )}
</div>
</div>

<div className="panel activity-panel">
  <div className="panel-heading">
    <div>
      <h3>Активность</h3>
      <p>События лаунчера</p>
    </div>
    <CalendarClock size={20} className="panel-icon" />
  </div>

  <div className="activity-item">
    <span className="activity-dot" />
    <div>
      <strong>Лаунчер запущен</strong>
      <small>Система готова к настройке</small>
    </div>
  </div>

  <div className="activity-item">
    <span className={`activity-dot ${game ? "" : "muted"}`} />
    <div>
      <strong>Игровой профиль выбран</strong>
      <small>{game || "Профиль не выбран"}</small>
    </div>
  </div>

  <div className="activity-item">
    <span
      className={`activity-dot ${
        gamePaths[game]?.trim() ? "" : "muted"
      }`}
    />
    <div>
      <strong>Путь к сборке</strong>
      <small>
        {gamePaths[game]?.trim()
          ? "Путь к сборке указан"
          : "Путь к сборке ещё не указан"}
      </small>
    </div>
  </div>
</div>
          </div>
                    </>

        ) : activePage === "scripts" ? (
          <div className="scripts-page">
            <div className="welcome">
              <div>
                <div className="eyebrow">MODIFICATION MANAGER</div>
                <h1>Каталог скриптов<span>.</span></h1>
                <p>Локальное управление файлами модификаций установленной сборки.</p>
              </div>
              <div className="build-label">{game.toUpperCase()}</div>
            </div>

            <div className="scripts-panel">
              <div className="scripts-panel-header">
                <div>
                  <h2>Файлы сборки</h2>
                  <p>{catalogLoading ? "Сканирование..." : catalogStatus}</p>
                </div>
                <div className="scripts-count">
                  {visibleCatalogFiles.length} <small>шт.</small>
                </div>
              </div>

              <div className="catalog-tabs" role="tablist" aria-label="Типы файлов">
                {catalogTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={catalogCategory === tab.id}
                    className={`catalog-tab ${catalogCategory === tab.id ? "active" : ""}`}
                    onClick={() => setCatalogCategory(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <small>{catalogTabCount(tab.id)}</small>
                  </button>
                ))}
              </div>

              <div className="catalog-toolbar">
                <label className="catalog-search">
                  <Search size={15} />
                  <input
                    type="search"
                    value={catalogSearches[catalogCategory]}
                    onChange={(event) =>
                      setCatalogSearches((current) => ({
                        ...current,
                        [catalogCategory]: event.target.value,
                      }))
                    }
                    placeholder={`Поиск: ${catalogTabs.find((tab) => tab.id === catalogCategory)?.label ?? "файлы"}...`}
                  />
                </label>

                <select
                  className="catalog-sort"
                  value={catalogSorts[catalogCategory]}
                  onChange={(event) =>
                    setCatalogSorts((current) => ({
                      ...current,
                      [catalogCategory]: event.target.value as CatalogSort,
                    }))
                  }
                  aria-label="Сортировка файлов"
                >
                  <option value="name-asc">Имя: А–Я</option>
                  <option value="name-desc">Имя: Я–А</option>
                  <option value="size-asc">Размер: сначала меньшие</option>
                  <option value="size-desc">Размер: сначала большие</option>
                  <option value="date-desc">Дата: сначала новые</option>
                  <option value="date-asc">Дата: сначала старые</option>
                </select>

                <button
                  type="button"
                  className="catalog-refresh"
                  onClick={() => void refreshCatalogFiles()}
                  disabled={catalogLoading || !gamePaths[game]}
                  title="Обновить каталог"
                >
                  <span className="catalog-refresh-icon">↻</span>
                  Обновить
                </button>
              </div>

              {visibleCatalogFiles.length > 0 ? (
                <div className="scripts-list">
                  {visibleCatalogFiles.map((file, index) => (
                    <div className="script-item catalog-file-item" key={file.id}>
                      <div className="script-item-icon">
                        <Code2 size={20} />
                      </div>

                      <div className="script-item-info">
                        <strong>{file.name}</strong>
                        <div className="script-item-meta">
                          <span className={`script-format ${file.extension}`}>
                            {file.extension ? file.extension.toUpperCase() : "FILE"}
                          </span>
                          {file.canToggle ? (
                            <span className={`script-state ${file.enabled ? "active" : "inactive"}`}>
                              {file.enabled ? "Включён" : "Отключён"}
                            </span>
                          ) : (
                            <span className="script-state neutral">Только просмотр</span>
                          )}
                          <span className="catalog-file-size">{formatCatalogSize(file.size)}</span>
                        </div>
                        <span title={file.relativePath}>{file.relativePath}</span>
                        {file.conflicts.length > 0 && (
                          <div className="catalog-conflict-area">
                            <button
                              type="button"
                              className={`catalog-conflict-chip ${
                                file.conflicts.some((conflict) => conflict.severity === "error")
                                  ? "danger"
                                  : file.conflicts.some((conflict) => conflict.severity === "warning")
                                    ? "warning"
                                    : "info"
                              }`}
                              onClick={() => setExpandedConflictId((current) => current === file.id ? null : file.id)}
                              aria-expanded={expandedConflictId === file.id}
                              title="Показать результаты проверки конфликтов"
                            >
                              <AlertTriangle size={12} />
                              {file.conflicts.length} совпад.
                            </button>
                            {expandedConflictId === file.id && (
                              <div className="catalog-conflict-details">
                                <div className="catalog-hash-line">
                                  <Fingerprint size={12} />
                                  <span>SHA-256</span>
                                  <code title={file.sha256 ?? "SHA-256 недоступен"}>{file.sha256 ?? "SHA-256 недоступен"}</code>
                                </div>
                                {file.conflicts.map((conflict, conflictIndex) => (
                                  <div className={`catalog-conflict-message ${conflict.severity}`} key={`${file.id}-${conflict.kind}-${conflictIndex}`}>
                                    <strong>{conflict.message}</strong>
                                    {conflict.relatedPaths.length > 0 && (
                                      <small>{conflict.relatedPaths.join(" · ")}</small>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <span className="script-item-number">{String(index + 1).padStart(2, "0")}</span>

                      <div className="script-actions">
                        {file.canToggle && (
                          <button
                            type="button"
                            className={`script-toggle-button ${file.enabled ? "enabled" : "disabled"}`}
                            title={file.enabled ? "Отключить файл" : "Включить файл"}
                            onClick={() => void handleToggleScript(file, !file.enabled)}
                          >
                            <span className="script-toggle-indicator" />
                            {file.enabled ? "Выключить" : "Включить"}
                          </button>
                        )}

                        {file.canDelete && (
                          <button
                            type="button"
                            className="script-delete-button"
                            title="Удалить файл"
                            onClick={() => void handleDeleteScript(file)}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="scripts-empty">
                  <Code2 size={32} />
                  <strong>
                    {catalogLoading
                      ? "Сканирование файлов"
                      : activeCatalogSearch
                        ? "Ничего не найдено"
                        : "Файлы не найдены"}
                  </strong>
                  <span>
                    {!gamePaths[game]
                      ? "Сначала укажи папку установленной игры."
                      : catalogLoading
                        ? "Получаем список файлов сборки."
                        : activeCatalogSearch
                          ? "Попробуй изменить поисковый запрос."
                          : "В выбранной категории пока нет файлов."}
                  </span>
                </div>
              )}
            </div>
          </div>
                ) : activePage === "logs" ? (
          <div className="logs-page">
            <div className="welcome">
              <div>
                <div className="eyebrow">MOONLOADER DIAGNOSTICS</div>
                <h1>Логи MoonLoader<span>.</span></h1>
                <p>Журнал событий и сообщений сборки.</p>
              </div>
              <div className="build-label">{game.toUpperCase()}</div>
            </div>

            <div className="logs-panel">
              <div className="logs-header">
                <div>
                  <h2>Журнал событий</h2>
                  <p>{logStatus}</p>
                </div>

                <div className="logs-actions">
                  <button
                    className="logs-button"
                    onClick={() => void loadMoonloaderLog()}
                    disabled={logLoading || !gamePaths[game]}
                  >
                    <Activity size={15} />
                    {logLoading ? "Загрузка..." : "Обновить"}
                  </button>

                  <button
                    className="logs-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(moonloaderLog);
                        setCopyStatus("Лог скопирован");
                      } catch {
                        setCopyStatus("Не удалось скопировать лог");
                      }
                    }}
                    disabled={!moonloaderLog}
                  >
                    <FileText size={15} />
                    Копировать
                  </button>
                </div>
              </div>

              <div className="logs-search">
  <Search size={16} />
  <input
    type="text"
    placeholder="Поиск по логам..."
    value={logSearch}
    onChange={(e) => setLogSearch(e.target.value)}
  />

  {logSearch && (
    <button onClick={() => setLogSearch("")}>
      Очистить
    </button>
  )}
</div>

              <div className="logs-filters">
                <button
                  className={logFilter === "all" ? "active" : ""}
                  onClick={() => setLogFilter("all")}
                >
                  Все сообщения
                </button>

                <button
                  className={logFilter === "error" ? "active" : ""}
                  onClick={() => setLogFilter("error")}
                >
                  Ошибки
                </button>

                <button
                  className={logFilter === "warning" ? "active" : ""}
                  onClick={() => setLogFilter("warning")}
                >
                  Предупреждения
                </button>
              </div>

              {copyStatus && (
                <div className="logs-copy-status">{copyStatus}</div>
              )}

              {logLoading ? (
                <div className="logs-empty">
                  Чтение файла moonloader.log...
                </div>
              ) : !gamePaths[game] ? (
                <div className="logs-empty">
                  Сначала выбери папку установленной игры.
                </div>
              ) : !moonloaderLog ? (
                <div className="logs-empty">
                  <FileText size={30} />
                  <strong>Лог пока не загружен</strong>
                  <span>{logStatus}</span>
                </div>
              ) : logLines.length === 0 ? (
                <div className="logs-empty">
                  Для выбранного фильтра сообщений нет.
                </div>
              ) : (
                <div className="logs-viewer">
                  {logLines.map((line, index) => (
                    <div
                      className={`log-line log-${getLogLevel(line)}`}
                      key={index}
                    >
                      <span className="log-number">
                        {index + 1}
                      </span>
                      <span className="log-text">
                      {highlightLogText(line || " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
                        ) : activePage === "settings" ? (
          <div className="settings-page">
            <div className="welcome">
              <div>
                <div className="eyebrow">PERSONALIZATION CENTER</div>
                <h1>Настройки<span>.</span></h1>
                <p>Настрой внешний вид своего лаунчера.</p>
              </div>
              <div className="build-label">APPEARANCE</div>
            </div>

            {/* ЦВЕТОВЫЕ ТЕМЫ */}
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div>
                  <span className="installer-overline">COLOR PRESETS</span>
                  <h2>Цветовая тема</h2>
                  <p>Автоматическая или ручная настройка оформления.</p>
                </div>
                <Palette size={22} />
              </div>

              <div className="theme-grid">
                {([
                  {
                    id: "auto",
                    name: "Автоматическая",
                    description: "Цвета под выбранные обои",
                  },
                  {
                    id: "crimson",
                    name: "Crimson",
                    description: "Красный и бордовый",
                  },
                  {
                    id: "sakura",
                    name: "Sakura Night",
                    description: "Розовый и фиолетовый",
                  },
                  {
                    id: "cyber",
                    name: "Cyber Blue",
                    description: "Синий и голубой",
                  },
                  {
                    id: "neon",
                    name: "Neon City",
                    description: "Неоновый фиолетовый",
                  },
                  {
                    id: "monochrome",
                    name: "Monochrome",
                    description: "Чёрный и серебристый",
                  },
                ] as const).map((theme) => (
                  <button
                    key={theme.id}
                    className={`theme-option ${
                      selectedTheme === theme.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedTheme(theme.id)}
                  >
                    <div className={`theme-option-preview preview-${theme.id}`}>
                      <span />
                      <span />
                      <span />
                    </div>

                    <div className="theme-option-info">
                      <strong>{theme.name}</strong>
                      <span>{theme.description}</span>
                    </div>

                    {selectedTheme === theme.id && (
                      <CheckCircle2 className="theme-check" size={18} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ГАЛЕРЕЯ ОБОЕВ */}
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div>
                  <span className="installer-overline">WALLPAPER LIBRARY</span>
                  <h2>Анимированные обои</h2>
                  <p>Выбери видео, которое станет фоном лаунчера.</p>
                </div>
                <Image size={22} />
              </div>

              <div className="wallpaper-grid">
  {wallpaperOptions.map((wallpaper) => {
    const isSelected =
      wallpaper.type === "video"
        ? backgroundMode === "wallpaper" &&
          selectedWallpaper === wallpaper.id
        : backgroundMode === "solid" &&
          solidBackground === wallpaper.id;

    return (
      <button
        key={`${wallpaper.type}-${wallpaper.id}`}
        className={`wallpaper-option ${isSelected ? "selected" : ""}`}
        onClick={() => {
          if (wallpaper.type === "video") {
            setBackgroundMode("wallpaper");
            setSelectedWallpaper(wallpaper.id);
          } else {
            setBackgroundMode("solid");
            setSolidBackground(wallpaper.id);
          }
        }}
      >
        <div className="wallpaper-preview">
          {wallpaper.type === "video" ? (
            <video
              className="wallpaper-preview-video"
              src={`/wallpapers/wallpaper-${String(wallpaper.id).padStart(2, "0")}.mp4`}
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <div
              className="wallpaper-solid-preview"
              style={{ backgroundColor: wallpaper.color }}
            >
              <span>PURE COLOR</span>
            </div>
          )}

          <span className="wallpaper-number">
            {wallpaper.type === "video"
              ? String(wallpaper.id).padStart(2, "0")
              : "●"}
          </span>

          {isSelected && (
            <span className="wallpaper-selected">
              <Check size={15} />
            </span>
          )}
        </div>

        <span className="wallpaper-category">
          {wallpaper.category}
        </span>

        <span className="wallpaper-name">
          {wallpaper.name}
        </span>
      </button>
    );
  })}
</div>
</div>

                        {/* ЭФФЕКТЫ */}
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div>
                  <span className="installer-overline">VISUAL EFFECTS</span>
                  <h2>Настройки фона</h2>
                  <p>Настрой интенсивность эффектов.</p>
                </div>
                <SlidersHorizontal size={22} />
              </div>

              <div className="visual-settings">
                <div className="visual-setting">
                  <div>
                    <strong>Затемнение фона</strong>
                    <span>{backgroundDim}%</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={backgroundDim}
                    onChange={(event) =>
                      setBackgroundDim(Number(event.target.value))
                    }
                  />
                </div>

                <div className="visual-setting">
                  <div>
                    <strong>Прозрачность интерфейса</strong>
                    <span>{uiTransparency}%</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="98"
                    value={uiTransparency}
                    onChange={(event) =>
                      setUiTransparency(Number(event.target.value))
                    }
                  />
                </div>

                <div className="visual-setting">
                  <div>
                    <strong>Размытие фона</strong>
                    <span>{backgroundBlur}px</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={backgroundBlur}
                    onChange={(event) =>
                      setBackgroundBlur(Number(event.target.value))
                    }
                  />
                </div>
              </div>
            </div>

            {/* НАСТРОЙКА ИНТЕРФЕЙСА */}
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div>
                  <span className="installer-overline">
                    INTERFACE CUSTOMIZATION
                  </span>
                  <h2>Настройка интерфейса</h2>
                  <p>
                    Измени расположение, стиль и внешний вид элементов лаунчера.
                  </p>
                </div>
                <SlidersHorizontal size={22} />
              </div>

              <div className="appearance-settings">

                {/* ПОЛОЖЕНИЕ ВКЛАДОК */}
                <div className="appearance-group">
                  <div className="appearance-group-heading">
                    <strong>Положение вкладок</strong>
                    <span>Расположение панели навигации</span>
                  </div>

                  <div className="appearance-choice-grid">
                    {([
                      { id: "left", label: "Слева" },
                      { id: "right", label: "Справа" },
                      { id: "top", label: "Сверху" },
                      { id: "bottom", label: "Снизу" },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        className={`appearance-choice ${
                          navigationPosition === option.id ? "selected" : ""
                        }`}
                        onClick={() => setNavigationPosition(option.id)}
                      >
                        <span
                          className={`position-preview position-preview-${option.id}`}
                        >
                          <span className="position-preview-sidebar" />
                          <span className="position-preview-main" />
                        </span>

                        <span className="appearance-choice-label">
                          {option.label}
                        </span>

                        {navigationPosition === option.id && (
                          <CheckCircle2
                            size={16}
                            className="appearance-choice-check"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* СТИЛЬ КНОПОК */}
                <div className="appearance-group">
                  <div className="appearance-group-heading">
                    <strong>Визуальный стиль кнопок</strong>
                    <span>
                      Выбери оформление интерактивных элементов
                    </span>
                  </div>

                  <div className="appearance-choice-grid">
                    {([
                      { id: "standard", label: "Стандартный", sample: "STANDARD" },
                      { id: "glass", label: "Glass", sample: "GLASS" },
                      { id: "outline", label: "Контурный", sample: "OUTLINE" },
                      { id: "filled", label: "Заливка", sample: "FILLED" },
                      { id: "minimal", label: "Минимализм", sample: "MINIMAL" },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        className={`appearance-choice ${
                          buttonStyle === option.id ? "selected" : ""
                        }`}
                        onClick={() => setButtonStyle(option.id)}
                      >
                        <span
                          className={`button-preview button-preview-${option.id}`}
                        >
                          {option.sample}
                        </span>

                        <span className="appearance-choice-label">
                          {option.label}
                        </span>

                        {buttonStyle === option.id && (
                          <CheckCircle2
                            size={16}
                            className="appearance-choice-check"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ФОРМА КНОПОК */}
                <div className="appearance-group">
                  <div className="appearance-group-heading">
                    <strong>Форма кнопок</strong>
                    <span>От классических до футуристических</span>
                  </div>

                  <div className="appearance-choice-grid">
                    {([
                      { id: "square", label: "Квадратные" },
                      { id: "rounded", label: "Скруглённые" },
                      { id: "oval", label: "Овальные" },
                      { id: "pill", label: "Pill" },
                      { id: "cyber", label: "Cyberpunk" },
                      { id: "hexagon", label: "Шестиугольные" },
                      { id: "tech", label: "Tech" },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        className={`appearance-choice ${
                          buttonShape === option.id ? "selected" : ""
                        }`}
                        onClick={() => setButtonShape(option.id)}
                      >
                        <span
                          className={`shape-preview shape-preview-${option.id}`}
                        >
                          Aa
                        </span>

                        <span className="appearance-choice-label">
                          {option.label}
                        </span>

                        {buttonShape === option.id && (
                          <CheckCircle2
                            size={16}
                            className="appearance-choice-check"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ШРИФТ */}
                <div className="appearance-group">
                  <div className="appearance-group-heading">
                    <strong>Шрифт интерфейса</strong>
                    <span>Предпросмотр начертания</span>
                  </div>

                  <div className="appearance-choice-grid">
                    {([
                      { id: "inter", label: "Inter" },
                      { id: "manrope", label: "Manrope" },
                      { id: "montserrat", label: "Montserrat" },
                      { id: "exo2", label: "Exo 2" },
                      { id: "roboto", label: "Roboto" },
                      { id: "russoone", label: "Russo One" },
                      { id: "gangoffour", label: "GangOfFour2015" },
                      { id: "modula", label: "Modula" },
                      { id: "rubik", label: "Rubik" },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        className={`appearance-choice ${
                          fontFamily === option.id ? "selected" : ""
                        }`}
                        onClick={() => setFontFamily(option.id)}
                      >
                        <span
                          className={`font-preview font-preview-${option.id}`}
                        >
                          Аа Яя 123
                        </span>

                        <span className="appearance-choice-label">
                          {option.label}
                        </span>

                        {fontFamily === option.id && (
                          <CheckCircle2
                            size={16}
                            className="appearance-choice-check"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>

          </div>
        ) : activePage === "downloads" ? (
          <div className="installer-page">

            <div className="welcome">
              <div>
                <div className="eyebrow">LOCAL INSTALLATION CENTER</div>
                <h1>Установщик<span>.</span></h1>
                <p>
                  Управление установкой дополнений для игровых проектов.
                </p>
              </div>

              <div className="installer-ready">
                <span className="installer-ready-dot" />
                 
              </div>
            </div>

            <div className="installer-layout">

              <div className="installer-main">

                <div className="installer-section-heading">
                  <div>
                    <span className="installer-overline">
                      IMPORT FILES
                    </span>
                    <h2>Добавить скрипты</h2>
                    <p>
                      Перетащи файлы или выбери их вручную.
                    </p>
                  </div>

                  <div className="installer-file-icon">
                    <Code2 size={23} />
                  </div>
                </div>

                <div
                  className={`installer-dropzone ${
                    isDragOver ? "drag-over" : ""
                  }`}
                >
                  <div className="installer-upload-icon">
                    <Download size={29} />
                  </div>

                  <h3>
                    {isDragOver
                      ? "Отпусти файлы здесь"
                      : "Перетащи файлы сюда"}
                  </h3>

                  <p>
                    Перемести Lua-скрипты из Проводника Windows
                    прямо в это окно.
                  </p>

                  <div className="installer-formats">
                    <span>.LUA</span>
                    <span>.LUAC</span>
                  </div>

                  <div className="installer-divider">
                    <span>ИЛИ</span>
                  </div>

                  <button
                    className="installer-select-button"
                    onClick={() => void chooseLuaFiles()}
                    disabled={!gamePaths[game] || installingScripts}
                  >
                    <Folder size={16} />
                    {installingScripts
                      ? "Установка..."
                      : "Выбрать файлы"}
                  </button>

                  {!gamePaths[game] && (
                    <span className="installer-warning">
                      Сначала выбери папку установленной игры.
                    </span>
                  )}
                </div>

                <div className="installer-tip">
                  <div className="installer-tip-icon">
                    <FileText size={17} />
                  </div>

                  <div>
                    <strong>Поддерживаемые форматы</strong>
                    <p>
                      Принимаются обычные Lua-файлы и скомпилированные
                      LUAC-файлы.
                    </p>
                  </div>
                </div>

              </div>

              <div className="installer-sidebar">

                <div className="installer-card">
                  <div className="installer-card-heading">
                    <span className="installer-overline">
                      INSTALLATION TARGET
                    </span>
                    <Folder size={19} />
                  </div>

                  <h3>Папка установки</h3>

                  <div className="installer-game-name">
                    {game}
                  </div>

                  <div className="installer-target-path">
                    {gamePaths[game]
                      ? `${gamePaths[game]}\\moonloader`
                      : "Папка игры не выбрана"}
                  </div>

                  <div className="installer-target-status">
                    <span
                      className={
                        gamePaths[game]
                          ? "installer-status-dot online"
                          : "installer-status-dot offline"
                      }
                    />

                    {gamePaths[game]
                      ? "Папка доступна"
                      : "Ожидается выбор папки"}
                  </div>
                </div>

                <div className="installer-card installer-rules">
                  <span className="installer-overline">
                    INSTALLATION RULES
                  </span>

                  <h3>Как это работает</h3>

                  <div className="installer-rule">
                    <span>01</span>
                    <div>
                      <strong>Выбор файлов</strong>
                      <p>Выбираешь Lua или LUAC.</p>
                    </div>
                  </div>

                  <div className="installer-rule">
                    <span>02</span>
                    <div>
                      <strong>Проверка</strong>
                      <p>Проверяем формат и наличие дубликатов.</p>
                    </div>
                  </div>

                  <div className="installer-rule">
                    <span>03</span>
                    <div>
                      <strong>Резервирование и установка</strong>
                      <p>Перед копированием создаётся защитная копия MoonLoader.</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {installStatus && (
              <div className="installer-result">
                <div className="installer-result-icon">
                  <FileText size={18} />
                </div>

                <div className="installer-result-content">
                  <strong>Результат установки</strong>
                  <pre>{installStatus}</pre>
                </div>
              </div>
            )}

          </div>
        ) : activePage === "activity" ? (
          <div className="activity-page">
            <div className="welcome">
              <div>
                <div className="eyebrow">RODINA LAUNCHER / ACTIVITY</div>
                <h1>Лог лаунчера<span>.</span></h1>
                <p>История действий, операций и ошибок для выбранной игровой сборки.</p>
              </div>
              <div className="build-label">{game.toUpperCase()}</div>
            </div>

            <div className="activity-summary">
              <div className="activity-summary-card">
                <span className="activity-summary-icon"><History size={18} /></span>
                <div><small>Событий в истории</small><strong>{activityEntries.length}</strong></div>
              </div>
              <div className="activity-summary-card">
                <span className="activity-summary-icon success"><CircleCheck size={18} /></span>
                <div><small>Успешно</small><strong>{activitySuccessCount}</strong></div>
              </div>
              <div className="activity-summary-card">
                <span className="activity-summary-icon danger"><CircleX size={18} /></span>
                <div><small>Ошибки</small><strong>{activityErrorCount}</strong></div>
              </div>
              <div className="activity-summary-card">
                <span className="activity-summary-icon warning"><AlertTriangle size={18} /></span>
                <div><small>Предупреждения</small><strong>{activityWarningCount}</strong></div>
              </div>
            </div>

            <div className="activity-panel">
              <div className="activity-panel-header">
                <div>
                  <h2>История действий</h2>
                  <p>{activityLoading ? "Загружаем журнал..." : activityStatus || "Последние действия RodinaLauncher"}</p>
                </div>
                <div className="activity-header-actions">
                  <button className="activity-icon-button" onClick={() => void refreshActivityLog()} disabled={activityLoading || !gamePaths[game]} title="Обновить журнал">
                    <RefreshCw size={15} />
                  </button>
                  <button className="activity-clear-button" onClick={() => void clearActivityLog()} disabled={activityLoading || activityEntries.length === 0 || !gamePaths[game]}>
                    <Trash2 size={14} /> Очистить журнал
                  </button>
                </div>
              </div>

              <div className="activity-toolbar">
                <div className="activity-search-wrap">
                  <Search size={15} />
                  <input value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Поиск по событиям..." />
                </div>
                <label className="activity-status-select">
                  <Filter size={14} />
                  <select value={activityResultFilter} onChange={(event) => setActivityResultFilter(event.target.value)}>
                    <option value="all">Все статусы</option>
                    <option value="success">Успешно</option>
                    <option value="error">Ошибки</option>
                    <option value="warning">Предупреждения</option>
                    <option value="info">Информация</option>
                  </select>
                </label>
              </div>

              <div className="activity-category-tabs">
                {[
                  ["all", "Все"],
                  ["backup", "Резервные копии"],
                  ["scripts", "Скрипты"],
                  ["catalog", "Модификации"],
                  ["launch", "Запуск игры"],
                ].map(([id, label]) => (
                  <button key={id} className={activityCategoryFilter === id ? "active" : ""} onClick={() => setActivityCategoryFilter(id)}>{label}</button>
                ))}
              </div>

              {!gamePaths[game] ? (
                <div className="activity-empty"><History size={30} /><strong>Игровая папка не выбрана</strong><span>Укажи путь к сборке в настройках лаунчера.</span></div>
              ) : activityLoading && activityEntries.length === 0 ? (
                <div className="activity-empty"><RefreshCw size={25} className="activity-spin" /><strong>Загружаем историю</strong><span>Читаем локальный журнал действий.</span></div>
              ) : visibleActivityEntries.length === 0 ? (
                <div className="activity-empty"><History size={30} /><strong>{activityEntries.length ? "Ничего не найдено" : "История пока пуста"}</strong><span>{activityEntries.length ? "Попробуй изменить фильтры или поисковый запрос." : "Здесь будут отображаться действия с модификациями, резервными копиями и запуском игры."}</span></div>
              ) : (
                <div className="activity-list">
                  {visibleActivityEntries.map((entry) => (
                    <article className="activity-entry" key={entry.id}>
                      <div className={`activity-entry-mark ${entry.status}`}>
                        {entry.status === "success" ? <CircleCheck size={17} /> : entry.status === "error" ? <CircleX size={17} /> : entry.status === "warning" ? <AlertTriangle size={17} /> : <Info size={17} />}
                      </div>
                      <div className="activity-entry-body">
                        <div className="activity-entry-topline">
                          <strong>{entry.title}</strong>
                          <time>{new Date(entry.timestamp).toLocaleString()}</time>
                        </div>
                        {entry.details && <p>{entry.details}</p>}
                        <div className="activity-entry-meta">
                          <span className={`activity-category-pill ${entry.category}`}>{({ backup: "Резервные копии", scripts: "Скрипты", catalog: "Модификации", launch: "Запуск игры", system: "Система" } as Record<string, string>)[entry.category] || entry.category}</span>
                          <span>{game}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activePage === "backups" ? (
          <div className="backups-page">
            <div className="welcome">
              <div>
                <div className="eyebrow">MOONLOADER PROTECTION</div>
                <h1>Резервные копии<span>.</span></h1>
                <p>Полные копии папки MoonLoader, включая вложенные каталоги и файлы.</p>
              </div>
              <div className="build-label">{game.toUpperCase()}</div>
            </div>

            <div className="backups-overview">
              <div className="backups-overview-icon"><ShieldCheck size={23} /></div>
              <div className="backups-overview-copy">
                <strong>Автоматическая защита при установке</strong>
                <span>Перед каждой установкой Lua/LUAC лаунчер создаёт резервную копию. При восстановлении текущая версия также сохраняется автоматически.</span>
              </div>
              <button className="backups-create-button" onClick={() => void createMoonloaderBackup()}
                disabled={!gamePaths[game] || backupActionLoading || backupsLoading}>
                <Archive size={16} /> Создать копию
              </button>
            </div>

            <div className="backups-panel">
              <div className="backups-panel-header">
                <div>
                  <h2>История резервирования</h2>
                  <p>{backupsLoading ? "Проверяем список резервных копий..." : backupStatus || "SHA-256 проверяется непосредственно перед восстановлением."}</p>
                </div>
                <button className="catalog-refresh" onClick={() => void refreshMoonloaderBackups()}
                  disabled={backupsLoading || backupActionLoading || !gamePaths[game]}>
                  <span className="catalog-refresh-icon">↻</span> Обновить
                </button>
              </div>

              {!gamePaths[game] ? (
                <div className="backups-empty"><Archive size={32} /><strong>Папка игры не выбрана</strong><span>Укажи путь к сборке в настройках лаунчера.</span></div>
              ) : moonloaderBackups.length === 0 && !backupsLoading ? (
                <div className="backups-empty"><Archive size={32} /><strong>Резервных копий пока нет</strong><span>Нажми «Создать копию» и выбери папку Windows для сохранения. Перед установкой Lua-файла копия создаётся автоматически в последнем выбранном месте.</span></div>
              ) : (
                <div className="backups-list">
                  {moonloaderBackups.map((backup) => (
                    <div className="backup-item" key={backup.id}>
                      <div className="backup-item-icon"><Archive size={19} /></div>
                      <div className="backup-item-info">
                        <strong>{new Date(backup.created_at).toLocaleString()}</strong>
                        <span>{backup.id}</span>
                        <small>{backup.file_count} файлов · {formatCatalogSize(backup.total_bytes)}</small>
                      </div>
                      <div className={`backup-integrity ${backup.integrity_ok ? "valid" : "invalid"}`}>
                        <span />{backup.integrity_ok ? "Файлы на месте" : "Ошибка структуры"}
                      </div>
                      <div className="backup-item-actions">
                        <button className="backup-restore-button" onClick={() => void restoreMoonloaderBackup(backup.id)}
                          disabled={!backup.integrity_ok || backupActionLoading} title="Восстановить копию">
                          <RotateCcw size={15} /> Восстановить
                        </button>
                        <button className="backup-delete-button" onClick={() => void deleteMoonloaderBackup(backup.id)}
                          disabled={backupActionLoading} title="Удалить копию"><Trash size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
               ) : activePage === "updates" ? (
          <div className="updates-page">

            <div className="welcome">
              <div>
                <div className="eyebrow">RODINA LAUNCHER / UPDATE CENTER</div>
                <h1>Обновления<span>.</span></h1>
                <p>
                  Проверка версии, получение новых функций и улучшений лаунчера.
                </p>
              </div>

              <div className="build-label">
                UPDATE CENTER
              </div>
            </div>

            <div className="updates-overview">

              <div className="updates-overview-icon">
                <RefreshCw size={26} />
              </div>

              <div className="updates-overview-info">
                <span className="installer-overline">
                  RODINA LAUNCHER UPDATE SERVICE
                </span>

                <h2>
                  {availableUpdate
                    ? `Доступна версия ${availableUpdate.version}`
                    : updateChecking
                      ? "Проверяем обновления..."
                      : "Центр обновлений"}
                </h2>

                <p>
                  {updateStatus}
                </p>
              </div>

              <div className="updates-overview-actions">
                <button
                  className="updates-check-button"
                  onClick={() => void checkLauncherUpdate()}
                  disabled={updateChecking || updateInstalling}
                >
                  <RefreshCw
                    size={16}
                    className={updateChecking ? "updates-spin" : ""}
                  />
                  {updateChecking ? "Проверка..." : "Проверить"}
                </button>
              </div>

            </div>

            <div className="updates-layout">

              <div className="updates-main-panel">

                <div className="updates-panel-heading">
                  <div>
                    <span className="installer-overline">
                      VERSION INFORMATION
                    </span>
                    <h2>Информация об обновлении</h2>
                  </div>

                  <Download size={21} />
                </div>

                {availableUpdate ? (
                  <div className="updates-available">

                    <div className="updates-version-card">
                      <div className="updates-version-icon">
                        <ArrowUpRight size={23} />
                      </div>

                      <div>
                        <span>НОВАЯ ВЕРСИЯ</span>
                        <strong>{availableUpdate.version}</strong>
                      </div>

                      <div className="updates-version-badge">
                        ДОСТУПНО
                      </div>
                    </div>

                    <div className="updates-release-notes">
                      <div className="updates-release-heading">
                        <FileText size={17} />
                        <strong>Что нового</strong>
                      </div>

                      <div className="updates-release-body">
                        {availableUpdate.body?.trim()
                          ? availableUpdate.body
                          : "Описание изменений для этой версии пока не опубликовано."}
                      </div>
                    </div>

                    {updateInstalling && (
                      <div className="updates-progress-section">
                        <div className="updates-progress-heading">
                          <strong>{updateStatus}</strong>
                          <span>
                            {updateProgress > 0
                              ? `${updateProgress}%`
                              : "Подготовка"}
                          </span>
                        </div>

                        <div className="updates-progress-track">
                          <div
                            className="updates-progress-fill"
                            style={{ width: `${updateProgress}%` }}
                          />
                        </div>

                        <p>
                          Не закрывай лаунчер во время установки.
                        </p>
                      </div>
                    )}

                    <button
                      className="updates-install-button"
                      onClick={() => void installLauncherUpdate()}
                      disabled={updateInstalling || updateChecking}
                    >
                      <Download size={17} />
                      {updateInstalling
                        ? "Установка обновления..."
                        : "Скачать и установить"}
                    </button>

                  </div>
                ) : (
                  <div className="updates-empty">

                    {updateChecking ? (
                      <RefreshCw size={32} className="updates-spin" />
                    ) : updateError ? (
                      <AlertTriangle size={32} />
                    ) : (
                      <CheckCircle2 size={32} />
                    )}

                    <strong>
                      {updateChecking
                        ? "Ищем новые версии"
                        : updateError
                          ? "Проверка не выполнена"
                          : "Ожидание проверки"}
                    </strong>

                    <span>
                      {updateChecking
                        ? "Связываемся с сервером обновлений RodinaLauncher."
                        : updateError
                          ? "Не удалось получить информацию о последней версии."
                          : "Нажми «Проверить», чтобы узнать, доступна ли новая версия."}
                    </span>

                  </div>
                )}

                {updateError && (
                  <div className="updates-error">
                    <AlertTriangle size={17} />
                    <div>
                      <strong>Ошибка обновления</strong>
                      <p>{updateError}</p>
                    </div>
                  </div>
                )}

              </div>

              <div className="updates-sidebar">

                <div className="updates-info-card">
                  <span className="installer-overline">
                    UPDATE SECURITY
                  </span>

                  <div className="updates-security-icon">
                    <ShieldCheck size={24} />
                  </div>

                  <h3>Безопасное обновление</h3>

                  <p>
                    Установка проверяется цифровой подписью.
                    Это помогает убедиться, что обновление выпущено
                    доверенным разработчиком.
                  </p>
                </div>

                <div className="updates-info-card">
                  <span className="installer-overline">
                    UPDATE SCOPE
                  </span>

                  <h3>Что обновляется?</h3>

                  <div className="updates-scope-item">
                    <CheckCircle2 size={16} />
                    <span>RodinaLauncher</span>
                  </div>

                  <div className="updates-scope-item">
                    <CheckCircle2 size={16} />
                    <span>Интерфейс и функции лаунчера</span>
                  </div>

                  <div className="updates-scope-item">
                    <CheckCircle2 size={16} />
                    <span>Внутренние компоненты приложения</span>
                  </div>

                  <div className="updates-scope-item muted">
                    <Info size={16} />
                    <span>Игровые файлы не затрагиваются</span>
                  </div>
                </div>

              </div>

            </div>

          </div>
        ) : (
          <div className="welcome">
            <div>
              <div className="eyebrow">RODINA LAUNCHER</div>
              <h1>
                {navigation.find((item) => item.id === activePage)?.label}
                <span>.</span>
              </h1>
              <p>Этот раздел пока находится в разработке.</p>
            </div>
            <div className="build-label">COMING SOON</div>
          </div>
        )}
        </section>
      </main>
    </div>
  );
}

export default App;
