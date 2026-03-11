import { app, BrowserWindow, screen, utilityProcess } from "electron";
import { spawn, execSync, ChildProcess } from "child_process";
import path from "path";
import http from "http";
import type { UtilityProcess } from "electron";

const isDev = !app.isPackaged;

// Load user's shell environment (Finder launches with minimal env)
function loadShellEnv(): Record<string, string> {
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const output = execSync(`${shell} -ilc "env"`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    const env: Record<string, string> = {};
    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        env[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    return env;
  } catch {
    return { ...process.env } as Record<string, string>;
  }
}

const shellEnv = loadShellEnv();

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let frontendProcess: UtilityProcess | ChildProcess | null = null;

const BACKEND_PORT = 4000;
const FRONTEND_PORT = 3000;

function resourcePath(...parts: string[]): string {
  if (isDev) {
    return path.join(__dirname, "..", "..", ...parts);
  }
  return path.join(process.resourcesPath!, ...parts);
}

function waitForPort(port: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

function startBackend(): ChildProcess {
  const env = { ...shellEnv };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  if (isDev) {
    return spawn("mix", ["phx.server"], {
      cwd: path.join(__dirname, "..", "..", "backend"),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  const releaseBin = resourcePath("elixir-release", "bin", "trinity");
  return spawn(releaseBin, ["start"], {
    env: {
      ...env,
      PHX_SERVER: "true",
      PORT: String(BACKEND_PORT),
      SECRET_KEY_BASE:
        "trinity-desktop-local-only-" +
        Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join(""),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function startFrontend(): UtilityProcess | ChildProcess {
  if (isDev) {
    return spawn("npx", ["next", "dev"], {
      cwd: path.join(__dirname, "..", ".."),
      env: shellEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  // Use utilityProcess.fork() instead of spawn(process.execPath) to prevent
  // a second "exec" Dock icon on macOS (spawn creates a foreground process)
  const serverJs = resourcePath("standalone", "server.js");
  return utilityProcess.fork(serverJs, [], {
    env: {
      ...shellEnv,
      PORT: String(FRONTEND_PORT),
      HOSTNAME: "localhost",
    },
    cwd: resourcePath("standalone"),
    serviceName: "trinity-frontend",
    stdio: "pipe",
  });
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function pipeOutput(
  proc: ChildProcess | UtilityProcess,
  label: string
) {
  proc.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[${label}] ${d}`)
  );
  proc.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[${label}] ${d}`)
  );
}

function cleanup() {
  if (frontendProcess) {
    frontendProcess.kill();
    frontendProcess = null;
  }
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
  // For Elixir release, send stop command
  if (!isDev) {
    try {
      const releaseBin = resourcePath("elixir-release", "bin", "trinity");
      spawn(releaseBin, ["stop"], { stdio: "ignore", detached: true });
    } catch {
      // ignore
    }
  }
}

async function startup() {
  console.log(`Starting Trinity (${isDev ? "dev" : "prod"} mode)...`);

  backendProcess = startBackend();
  frontendProcess = startFrontend();

  pipeOutput(backendProcess, "backend");
  pipeOutput(frontendProcess, "frontend");

  backendProcess.on("exit", (code) => {
    console.log(`Backend exited with code ${code}`);
  });
  (frontendProcess as ChildProcess).on("exit", (code: number) => {
    console.log(`Frontend exited with code ${code}`);
  });

  try {
    await Promise.all([
      waitForPort(BACKEND_PORT),
      waitForPort(FRONTEND_PORT),
    ]);
    console.log("Both services ready, opening window...");
    createWindow();
  } catch (err) {
    console.error("Failed to start services:", err);
    cleanup();
    app.quit();
  }
}

app.whenReady().then(startup);

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", cleanup);
