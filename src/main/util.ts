/* eslint import/prefer-default-export: off */
import path from 'path';
import { app } from 'electron';

// Vite sets these globals for us
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export const resolveHtmlPath = (htmlFileName: string) => {
  // In Electron Forge with Vite, MAIN_WINDOW_VITE_DEV_SERVER_URL is set in development
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  }
  // In production, serve from the built renderer directory
  return `file://${path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)}`;
};

export const getAssetPath = (...paths: string[]): string => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  return path.join(RESOURCES_PATH, ...paths);
};
