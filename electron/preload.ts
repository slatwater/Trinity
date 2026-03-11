// Minimal preload - contextBridge can be extended later if needed
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("trinity", {
  platform: process.platform,
});
