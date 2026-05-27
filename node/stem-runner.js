const maxApi = require("max-api");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const DEFAULTS = {
  pythonExe: path.join(projectRoot, ".venv", "Scripts", "python.exe"),
  scriptPath: path.join(projectRoot, "python", "stem_split.py"),
  outDir: path.join(projectRoot, "stems"),
};

let activeProcess = null;
let lastResultDir = "";

const state = {
  pythonExe: DEFAULTS.pythonExe,
  scriptPath: DEFAULTS.scriptPath,
  inputPath: "",
  outDir: DEFAULTS.outDir,
  mode: "4",
  model: "htdemucs",
  device: "",
  twoStemTarget: "vocals",
  debug: false,
};

const PRESETS = {
  full4: { mode: "4", model: "htdemucs", twoStemTarget: "vocals" },
  vocals2: { mode: "2", model: "htdemucs", twoStemTarget: "vocals" },
  drums2: { mode: "2", model: "htdemucs", twoStemTarget: "drums" },
  bass2: { mode: "2", model: "htdemucs", twoStemTarget: "bass" },
  other2: { mode: "2", model: "htdemucs", twoStemTarget: "other" },
  full6: { mode: "4", model: "htdemucs_6s", twoStemTarget: "vocals" },
};

function joinArgs(args) {
  return args.map((value) => String(value)).join(" ").trim();
}

function normalizeMode(value) {
  return String(value || "4").trim() === "2" ? "2" : "4";
}

function normalizeDevice(value) {
  const device = String(value || "").trim().toLowerCase();
  if (!device || device === "auto") {
    return "";
  }
  if (device === "gpu") {
    return "cuda";
  }
  return device;
}

function normalizeTwoStemTarget(value) {
  const target = String(value || "vocals").trim().toLowerCase();
  if (["vocals", "drums", "bass", "other", "guitar", "piano"].includes(target)) {
    return target;
  }
  return "vocals";
}

function normalizePresetKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "full4";
  }

  const aliases = {
    "0": "full4",
    "1": "vocals2",
    "2": "drums2",
    "3": "bass2",
    "4": "other2",
    "5": "full6",
    full4: "full4",
    "4stems": "full4",
    standard: "full4",
    vocals2: "vocals2",
    "2stems_vocals": "vocals2",
    instrumental: "vocals2",
    drums2: "drums2",
    "2stems_drums": "drums2",
    bass2: "bass2",
    "2stems_bass": "bass2",
    other2: "other2",
    "2stems_other": "other2",
    full6: "full6",
    "6stems": "full6",
  };

  return aliases[raw] || "";
}

function applyPreset(value) {
  const presetKey = normalizePresetKey(value);
  if (!presetKey || !PRESETS[presetKey]) {
    maxApi.outlet(["fail", `Unknown preset: ${value}`]);
    return;
  }

  const preset = PRESETS[presetKey];
  state.mode = preset.mode;
  state.model = preset.model;
  state.twoStemTarget = preset.twoStemTarget;

  emitConfig("mode");
  emitConfig("model");
  emitConfig("twoStemTarget");
  maxApi.outlet(["preset", presetKey]);
}

function emitConfig(field) {
  maxApi.outlet(["config", field, state[field]]);
}

function setStateField(field, ...atoms) {
  const value = joinArgs(atoms);

  if (field === "mode") {
    state.mode = normalizeMode(value);
    emitConfig("mode");
    return;
  }

  if (field === "device") {
    state.device = normalizeDevice(value);
    emitConfig("device");
    return;
  }

  if (field === "twoStemTarget") {
    state.twoStemTarget = normalizeTwoStemTarget(value);
    emitConfig("twoStemTarget");
    return;
  }

  if (field === "debug") {
    const raw = String(value || "0").trim().toLowerCase();
    state.debug = raw === "1" || raw === "true" || raw === "on" || raw === "yes";
    emitConfig("debug");
    return;
  }

  state[field] = value;
  emitConfig(field);

  if (field === "inputPath") {
    maxApi.outlet(["ui", value ? "File loaded" : "Drop a file"]);
  }
}

function relayStream(prefix, chunk, onLine) {
  const text = chunk.toString();
  const lines = text.split(/[\r\n]+/).filter(Boolean);
  lines.forEach((line) => {
    if (onLine) {
      onLine(line);
      return;
    }
    maxApi.outlet([prefix, line]);
  });
}

function openFolder(targetPath) {
  const folderPath = String(targetPath || "").trim();
  if (!folderPath) {
    maxApi.outlet(["fail", "No folder path available"]);
    return;
  }

  if (!fs.existsSync(folderPath)) {
    maxApi.outlet(["fail", `Folder not found: ${folderPath}`]);
    return;
  }

  try {
    if (process.platform === "win32") {
      const child = spawn("cmd.exe", ["/d", "/c", "start", "", folderPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        shell: false,
      });
      child.unref();
    } else {
      const command = process.platform === "darwin" ? "open" : "xdg-open";
      const child = spawn(command, [folderPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    }

    maxApi.outlet(["log", `Opening folder: ${folderPath}`]);
  } catch (error) {
    maxApi.outlet(["fail", `Cannot open folder: ${folderPath}`]);
    maxApi.outlet(["err", String(error && error.message ? error.message : error)]);
  }
}

function validateConfig(config) {
  if (!config.pythonExe) {
    return "Missing python executable path";
  }
  if (!fs.existsSync(config.pythonExe)) {
    return `Python executable not found: ${config.pythonExe}`;
  }
  if (!config.scriptPath) {
    return "Missing script path";
  }
  if (!config.inputPath) {
    return "Missing input audio path";
  }
  if (!config.outDir) {
    return "Missing output folder path";
  }
  if (!fs.existsSync(config.scriptPath)) {
    return `Script not found: ${config.scriptPath}`;
  }
  if (!fs.existsSync(config.inputPath)) {
    return `Input not found: ${config.inputPath}`;
  }

  return "";
}

function runSplit(configOverrides = {}) {
  if (activeProcess) {
    maxApi.outlet(["fail", "A split process is already running"]);
    return;
  }

  const config = {
    pythonExe: configOverrides.pythonExe || state.pythonExe,
    scriptPath: configOverrides.scriptPath || state.scriptPath,
    inputPath: configOverrides.inputPath || state.inputPath,
    outDir: configOverrides.outDir || state.outDir,
    mode: normalizeMode(configOverrides.mode || state.mode),
    model: String(configOverrides.model || state.model || "htdemucs").trim() || "htdemucs",
    device: normalizeDevice(configOverrides.device || state.device),
    twoStemTarget: normalizeTwoStemTarget(configOverrides.twoStemTarget || state.twoStemTarget),
  };

  try {
    fs.mkdirSync(config.outDir, { recursive: true });
  } catch (error) {
    maxApi.outlet(["fail", `Cannot create output folder: ${config.outDir}`]);
    return;
  }

  const errorMessage = validateConfig(config);
  if (errorMessage) {
    maxApi.outlet(["fail", errorMessage]);
    return;
  }

  state.pythonExe = config.pythonExe;
  state.scriptPath = config.scriptPath;
  state.inputPath = config.inputPath;
  state.outDir = config.outDir;
  state.mode = config.mode;
  state.model = config.model;
  state.device = config.device;
  state.twoStemTarget = config.twoStemTarget;

  const args = [
    config.scriptPath,
    "--input",
    config.inputPath,
    "--out",
    config.outDir,
    "--mode",
    String(config.mode),
    "--model",
    String(config.model),
  ];

  if (config.mode === "2") {
    args.push("--two-stem-target", String(config.twoStemTarget));
  }

  if (config.device && String(config.device).trim().length > 0) {
    args.push("--device", String(config.device));
  }

  let lastProgress = 5;
  maxApi.outlet(["ui", "Processing..."]);
  maxApi.outlet(["progress", lastProgress]);
  maxApi.outlet(["status", "running"]);
  if (state.debug) {
    maxApi.outlet(["log", `Running: ${config.pythonExe} ${args.join(" ")}`]);
  }

  let resultDir = "";

  const setProgress = (value) => {
    const bounded = Math.max(0, Math.min(100, Math.round(value)));
    if (bounded <= lastProgress) {
      return;
    }
    lastProgress = bounded;
    maxApi.outlet(["progress", lastProgress]);
  };

  const extractPercent = (rawLine) => {
    const line = String(rawLine || "").replace(/\u001b\[[0-9;]*m/g, "");
    const match = line.match(/(\d{1,3})%/);
    if (!match) {
      return null;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return null;
    }
    return value;
  };

  activeProcess = spawn(config.pythonExe, args, {
    windowsHide: true,
    shell: false,
  });

  activeProcess.stdout.on("data", (data) =>
    relayStream("log", data, (line) => {
      if (line.startsWith("[RESULT] ")) {
        resultDir = line.replace("[RESULT] ", "").trim();
        maxApi.outlet(["result", resultDir]);
        return;
      }

      const tqdmPercent = extractPercent(line);
      if (tqdmPercent !== null) {
        const mapped = 40 + (tqdmPercent * 30) / 100;
        maxApi.outlet(["ui", "Separating stems..."]);
        setProgress(mapped);
      }

      if (state.debug) {
        maxApi.outlet(["log", line]);
        return;
      }

      if (line.startsWith("[OK]")) {
        setProgress(95);
        return;
      }

      if (line.startsWith("[ERR]")) {
        maxApi.outlet(["log", line]);
        return;
      }

      if (line.includes("Separating track") || line.includes("Separated tracks")) {
        maxApi.outlet(["ui", "Separating stems..."]);
        setProgress(40);
        return;
      }

      if (line.startsWith("[INFO]")) {
        return;
      }
    }),
  );
  activeProcess.stderr.on("data", (data) => relayStream("err", data));

  activeProcess.on("close", (code) => {
    const exitCode = Number(code || 0);
    if (exitCode === 0) {
      const finalResult = resultDir || config.outDir;
      lastResultDir = finalResult;
      maxApi.outlet(["ui", "Done"]);
      maxApi.outlet(["progress", 100]);
      maxApi.outlet(["done", finalResult]);
      maxApi.outlet(["status", "idle"]);
    } else {
      maxApi.outlet(["ui", "Error"]);
      maxApi.outlet(["progress", 0]);
      maxApi.outlet(["fail", String(exitCode)]);
      maxApi.outlet(["status", "idle"]);
    }
    activeProcess = null;
  });

  activeProcess.on("error", (error) => {
    maxApi.outlet(["fail", String(error && error.message ? error.message : error)]);
    maxApi.outlet(["status", "idle"]);
    activeProcess = null;
  });
}

maxApi.addHandler("split", (pythonExe, scriptPath, inputPath, outDir, mode = "4", model = "htdemucs", device = "", twoStemTarget = "vocals") => {
  runSplit({
    pythonExe: String(pythonExe || "").trim(),
    scriptPath: String(scriptPath || "").trim(),
    inputPath: String(inputPath || "").trim(),
    outDir: String(outDir || "").trim(),
    mode: String(mode || "4").trim(),
    model: String(model || "htdemucs").trim(),
    device: String(device || "").trim(),
    twoStemTarget: String(twoStemTarget || "vocals").trim(),
  });
});

maxApi.addHandler("run", () => {
  runSplit();
});

maxApi.addHandler("split_file", (...atoms) => {
  const pathValue = joinArgs(atoms);
  if (!pathValue) {
    maxApi.outlet(["fail", "Missing dropped file path"]);
    return;
  }

  state.inputPath = pathValue;
  emitConfig("inputPath");
  runSplit({ inputPath: pathValue });
});

maxApi.addHandler("open_result", () => {
  openFolder(lastResultDir || state.outDir);
});

function cancelActiveProcess() {
  if (!activeProcess) {
    maxApi.outlet(["log", "No active process"]);
    return;
  }

  activeProcess.kill();
  activeProcess = null;
  maxApi.outlet(["status", "idle"]);
  maxApi.outlet(["log", "Split process cancelled"]);
}

maxApi.addHandler("cancel", () => {
  cancelActiveProcess();
});

maxApi.addHandler("CANCEL", () => {
  cancelActiveProcess();
});

maxApi.addHandler("set_python", (...atoms) => setStateField("pythonExe", ...atoms));
maxApi.addHandler("set_script", (...atoms) => setStateField("scriptPath", ...atoms));
maxApi.addHandler("set_input", (...atoms) => setStateField("inputPath", ...atoms));
maxApi.addHandler("set_out", (...atoms) => setStateField("outDir", ...atoms));
maxApi.addHandler("set_mode", (...atoms) => setStateField("mode", ...atoms));
maxApi.addHandler("set_model", (...atoms) => setStateField("model", ...atoms));
maxApi.addHandler("set_device", (...atoms) => setStateField("device", ...atoms));
maxApi.addHandler("set_two_stem_target", (...atoms) => setStateField("twoStemTarget", ...atoms));
maxApi.addHandler("set_debug", (...atoms) => setStateField("debug", ...atoms));
maxApi.addHandler("set_preset", (...atoms) => applyPreset(joinArgs(atoms)));

maxApi.addHandler("configure", (pythonExe, scriptPath, outDir, mode = "4", model = "htdemucs", device = "", twoStemTarget = "vocals") => {
  setStateField("pythonExe", pythonExe);
  setStateField("scriptPath", scriptPath);
  setStateField("outDir", outDir);
  setStateField("mode", mode);
  setStateField("model", model);
  setStateField("device", device);
  setStateField("twoStemTarget", twoStemTarget);
});

maxApi.addHandler("get_config", () => {
  emitConfig("pythonExe");
  emitConfig("scriptPath");
  emitConfig("inputPath");
  emitConfig("outDir");
  emitConfig("mode");
  emitConfig("model");
  emitConfig("device");
  emitConfig("twoStemTarget");
  emitConfig("debug");
  maxApi.outlet(["config", "lastResultDir", lastResultDir]);
});

maxApi.outlet(["ui", "Ready"]);
maxApi.post("stem-runner loaded");
