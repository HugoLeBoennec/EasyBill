import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Modules that the Vite main bundle leaves as `require()` calls (see
 * `external` in vite.main.config.mts). The Vite plugin does not package
 * node_modules, so these are copied by hand together with their production
 * dependencies, which are read from each package.json.
 */
const RUNTIME_NODE_MODULES = [
  'better-sqlite3',
  // loaded with a plain require() in src/main/main.ts
  'electron-squirrel-startup',
];

const NODE_MODULES_DIR = path.join(__dirname, 'node_modules');

function collectRuntimeModules(names: string[], seen = new Set<string>()): Set<string> {
  for (const name of names) {
    if (seen.has(name)) continue;
    const manifest = path.join(NODE_MODULES_DIR, name, 'package.json');
    if (!fs.existsSync(manifest)) {
      throw new Error(`Runtime module "${name}" is not installed at the top of node_modules`);
    }
    seen.add(name);
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    collectRuntimeModules(Object.keys(pkg.dependencies ?? {}), seen);
  }
  return seen;
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {
    // Let Electron Forge rebuild better-sqlite3 for Electron
  },
  hooks: {
    // Runs before the native rebuild, so the copied better-sqlite3 is then
    // rebuilt for Electron's ABI inside the package (not in ./node_modules).
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      for (const name of collectRuntimeModules(RUNTIME_NODE_MODULES)) {
        const source = path.join(NODE_MODULES_DIR, name);
        const target = path.join(buildPath, 'node_modules', name);
        await fs.promises.cp(source, target, { recursive: true });
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    // Keeps .node binaries outside the asar archive so they can be loaded
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
