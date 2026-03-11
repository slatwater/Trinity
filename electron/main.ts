import { app, BrowserWindow, screen } from "electron";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import http from "http";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let frontendProcess: ChildProcess | null = null;

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
  const env = { ...process.env };
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

function startFrontend(): ChildProcess {
  if (isDev) {
    return spawn("npx", ["next", "dev"], {
      cwd: path.join(__dirname, "..", ".."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  const serverJs = resourcePath("standalone", "server.js");
  return spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(FRONTEND_PORT),
      HOSTNAME: "localhost",
    },
    cwd: resourcePath("standalone"),
    stdio: ["ignore", "pipe", "pipe"],
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

function pipeOutput(proc: ChildProcess, label: string) {
  proc.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[${label}] ${d}`)
  );
  proc.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[${label}] ${d}`)
  );
}

function cleanup() {
  if (frontendProcess && !frontendProcess.killed) {
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
  frontendProcess.on("exit", (code) => {
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
