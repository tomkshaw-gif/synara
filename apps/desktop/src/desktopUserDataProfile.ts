// FILE: desktopUserDataProfile.ts
// Purpose: Resolves Synara's Electron userData paths and completes bridge profile repair.

import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

const BRIDGE_PROFILE_MANIFEST_FILE_NAME = "synara-profile-seed.json";
const CANONICAL_BROWSER_PARTITION_NAME = "synara-browser";
const BROWSER_PARTITION_SEED_ENTRY_GROUPS = [
  ["Cookies", "Cookies-journal", "Cookies-wal", "Cookies-shm"],
  ["Local Storage"],
  ["IndexedDB"],
  ["Session Storage"],
  ["WebStorage"],
  ["Service Worker"],
  ["Preferences"],
  ["Network Persistent State"],
  ["TransportSecurity"],
  ["Trust Tokens", "Trust Tokens-journal", "Trust Tokens-wal", "Trust Tokens-shm"],
  ["SharedStorage", "SharedStorage-journal", "SharedStorage-wal", "SharedStorage-shm"],
  ["shared_proto_db"],
] as const;
const BROWSER_PARTITION_SEED_ENTRY_NAMES = BROWSER_PARTITION_SEED_ENTRY_GROUPS.flat();

export interface BrowserProfileBridgeRepairResult {
  readonly status: "repaired" | "not-needed" | "bridge-unavailable" | "repair-failed";
  readonly sourcePath: string | null;
  readonly targetPath: string;
  readonly copiedEntries: readonly string[];
  readonly error?: unknown;
}

const SYNARA_DEVIN_SESSION_OVERLAY_PREFIX = "synara-devin-";

function pathIsInside(parent: string, child: string, windows: boolean): boolean {
  const normalize = (value: string) => {
    const resolved = Path.resolve(value);
    return windows ? resolved.toLowerCase() : resolved;
  };
  const parentPath = normalize(parent);
  const childPath = normalize(child);
  if (childPath === parentPath) return true;
  const prefix = parentPath.endsWith(Path.sep) ? parentPath : `${parentPath}${Path.sep}`;
  return childPath.startsWith(prefix);
}

/**
 * True when `directory` is a Synara-created Devin session overlay
 * (`<tmp>/synara-devin-*`). Those directories are child-process isolation
 * homes, not the user's persistent APPDATA / XDG config.
 */
export function isSynaraDevinSessionOverlayDirectory(
  directory: string | undefined,
  options: {
    readonly tmpDir?: string | undefined;
    readonly platform?: NodeJS.Platform | undefined;
  } = {},
): boolean {
  const trimmed = directory?.trim();
  if (!trimmed) return false;
  const platform = options.platform ?? process.platform;
  const baseName = Path.basename(Path.resolve(trimmed));
  const matchesPrefix =
    platform === "win32"
      ? baseName.toLowerCase().startsWith(SYNARA_DEVIN_SESSION_OVERLAY_PREFIX)
      : baseName.startsWith(SYNARA_DEVIN_SESSION_OVERLAY_PREFIX);
  if (!matchesPrefix) return false;
  return pathIsInside(options.tmpDir ?? OS.tmpdir(), trimmed, platform === "win32");
}

export function resolveDesktopAppDataBase(input?: {
  readonly platform?: NodeJS.Platform | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly homeDir?: string | undefined;
  readonly tmpDir?: string | undefined;
}): string {
  const platform = input?.platform ?? process.platform;
  const env = input?.env ?? process.env;
  const homeDir = input?.homeDir ?? OS.homedir();
  const overlayOptions = { platform, tmpDir: input?.tmpDir };

  if (platform === "win32") {
    const appData = env.APPDATA?.trim();
    if (appData && !isSynaraDevinSessionOverlayDirectory(appData, overlayOptions)) {
      return appData;
    }
    return Path.join(homeDir, "AppData", "Roaming");
  }
  if (platform === "darwin") {
    return Path.join(homeDir, "Library", "Application Support");
  }
  const configHome = env.XDG_CONFIG_HOME?.trim();
  if (configHome && !isSynaraDevinSessionOverlayDirectory(configHome, overlayOptions)) {
    return configHome;
  }
  return Path.join(homeDir, ".config");
}

/**
 * If this process inherited a Devin-session overlay as APPDATA / XDG_CONFIG_HOME
 * (a temp `synara-devin-*` directory), rewrite it to the persistent user config
 * home so Electron userData and provider children match a normal shortcut launch.
 */
export function restorePersistentDesktopConfigHome(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    readonly platform?: NodeJS.Platform | undefined;
    readonly homeDir?: string | undefined;
    readonly tmpDir?: string | undefined;
  } = {},
): boolean {
  const platform = options.platform ?? process.platform;
  const persistentHome = resolveDesktopAppDataBase({
    platform,
    env,
    homeDir: options.homeDir,
    tmpDir: options.tmpDir,
  });
  if (platform === "win32") {
    const appData = env.APPDATA?.trim();
    if (!appData || persistentHome === appData) return false;
    if (!isSynaraDevinSessionOverlayDirectory(appData, { platform, tmpDir: options.tmpDir })) {
      return false;
    }
    env.APPDATA = persistentHome;
    return true;
  }
  const configHome = env.XDG_CONFIG_HOME?.trim();
  const posixConfigHome = Path.join(options.homeDir ?? OS.homedir(), ".config");
  if (
    !configHome ||
    !isSynaraDevinSessionOverlayDirectory(configHome, { platform, tmpDir: options.tmpDir })
  ) {
    return false;
  }
  env.XDG_CONFIG_HOME = platform === "linux" ? persistentHome : posixConfigHome;
  return true;
}

export function resolveDesktopUserDataPath(input: {
  readonly appDataBase: string;
  readonly userDataDirectoryName: string;
  readonly testOverridePath?: string | undefined;
}): string {
  const testOverridePath = input.testOverridePath?.trim();
  if (testOverridePath) return Path.resolve(testOverridePath);
  return Path.join(input.appDataBase, input.userDataDirectoryName);
}

function readBridgeProfileSourcePath(targetPath: string): string | null {
  const manifestPath = Path.join(targetPath, BRIDGE_PROFILE_MANIFEST_FILE_NAME);
  if (!FS.existsSync(manifestPath)) return null;

  let parsed: { readonly sourcePath?: unknown };
  try {
    parsed = JSON.parse(FS.readFileSync(manifestPath, "utf8")) as {
      readonly sourcePath?: unknown;
    };
  } catch {
    return null;
  }
  if (typeof parsed.sourcePath !== "string" || !Path.isAbsolute(parsed.sourcePath)) {
    return null;
  }

  const sourcePath = Path.resolve(parsed.sourcePath);
  const resolvedTargetPath = Path.resolve(targetPath);
  if (
    sourcePath === resolvedTargetPath ||
    Path.dirname(sourcePath) !== Path.dirname(resolvedTargetPath)
  ) {
    return null;
  }
  return sourcePath;
}

function findBridgeBrowserPartitionPaths(sourceProfilePath: string): string[] {
  const partitionsPath = Path.join(sourceProfilePath, "Partitions");
  if (!FS.existsSync(partitionsPath)) return [];

  return FS.readdirSync(partitionsPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.endsWith("-browser") &&
        entry.name !== CANONICAL_BROWSER_PARTITION_NAME,
    )
    .map((entry) => Path.join(partitionsPath, entry.name))
    .filter((partitionPath) =>
      BROWSER_PARTITION_SEED_ENTRY_NAMES.some((entryName) =>
        FS.existsSync(Path.join(partitionPath, entryName)),
      ),
    )
    .sort((left, right) => FS.statSync(right).mtimeMs - FS.statSync(left).mtimeMs);
}

/**
 * Finishes any browser-partition copy described by the compatibility bridge.
 *
 * The bridge manifest identifies the exact sibling profile that supplied the Synara profile.
 * Discovering its `*-browser` partition from that trusted path avoids shipping predecessor names
 * while still repairing cookies or storage entries that were absent during the first bridge run.
 */
export function repairBrowserProfileFromBridgeManifest(
  targetPath: string,
): BrowserProfileBridgeRepairResult {
  let sourcePath: string | null = null;
  const copiedEntries: string[] = [];
  try {
    sourcePath = readBridgeProfileSourcePath(targetPath);
    if (!sourcePath || !FS.existsSync(sourcePath)) {
      return {
        status: "bridge-unavailable",
        sourcePath,
        targetPath,
        copiedEntries: [],
      };
    }

    const sourcePartitionPath = findBridgeBrowserPartitionPaths(sourcePath)[0];
    if (!sourcePartitionPath) {
      return {
        status: "not-needed",
        sourcePath,
        targetPath,
        copiedEntries: [],
      };
    }

    const targetPartitionPath = Path.join(
      targetPath,
      "Partitions",
      CANONICAL_BROWSER_PARTITION_NAME,
    );
    for (const entryGroup of BROWSER_PARTITION_SEED_ENTRY_GROUPS) {
      const baseEntryName = entryGroup[0];
      if (!FS.existsSync(Path.join(sourcePartitionPath, baseEntryName))) continue;
      if (FS.existsSync(Path.join(targetPartitionPath, baseEntryName))) continue;

      const sourceEntryNames = entryGroup.filter((entryName) =>
        FS.existsSync(Path.join(sourcePartitionPath, entryName)),
      );
      FS.mkdirSync(targetPartitionPath, { recursive: true });
      const stagedGroupPath = FS.mkdtempSync(Path.join(targetPartitionPath, ".synara-bridge-"));
      const stagedSourcePath = Path.join(stagedGroupPath, "source");
      const stagedTargetBackupPath = Path.join(stagedGroupPath, "target-backup");
      try {
        // Stage the whole source generation before removing orphaned target
        // sidecars, so a failed source copy leaves the target untouched.
        FS.mkdirSync(stagedSourcePath, { recursive: true });
        for (const entryName of sourceEntryNames) {
          FS.cpSync(
            Path.join(sourcePartitionPath, entryName),
            Path.join(stagedSourcePath, entryName),
            {
              recursive: true,
              errorOnExist: true,
              force: false,
            },
          );
        }

        // Another startup may have completed the repair while this group was
        // staged. Preserve its database and leave its sidecars untouched.
        if (FS.existsSync(Path.join(targetPartitionPath, baseEntryName))) continue;

        const installOrder = [
          ...sourceEntryNames.filter((entryName) => entryName !== baseEntryName),
          baseEntryName,
        ];
        const displacedTargetEntries: string[] = [];
        const installedSourceEntries: string[] = [];
        try {
          FS.mkdirSync(stagedTargetBackupPath, { recursive: true });
          for (const sidecarEntryName of entryGroup.slice(1)) {
            const targetEntryPath = Path.join(targetPartitionPath, sidecarEntryName);
            if (!FS.existsSync(targetEntryPath)) continue;
            FS.renameSync(targetEntryPath, Path.join(stagedTargetBackupPath, sidecarEntryName));
            displacedTargetEntries.push(sidecarEntryName);
          }
          for (const entryName of installOrder) {
            FS.renameSync(
              Path.join(stagedSourcePath, entryName),
              Path.join(targetPartitionPath, entryName),
            );
            installedSourceEntries.push(entryName);
          }
        } catch (installError) {
          const rollbackErrors: unknown[] = [];
          for (const entryName of installedSourceEntries.reverse()) {
            try {
              FS.rmSync(Path.join(targetPartitionPath, entryName), {
                recursive: true,
                force: true,
              });
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
          }
          for (const entryName of displacedTargetEntries) {
            try {
              FS.renameSync(
                Path.join(stagedTargetBackupPath, entryName),
                Path.join(targetPartitionPath, entryName),
              );
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
          }
          if (rollbackErrors.length > 0) {
            throw new AggregateError(
              [installError, ...rollbackErrors],
              "Browser profile bridge repair and rollback failed",
            );
          }
          throw installError;
        }
        copiedEntries.push(...sourceEntryNames);
      } finally {
        FS.rmSync(stagedGroupPath, { recursive: true, force: true });
      }
    }

    return {
      status: copiedEntries.length > 0 ? "repaired" : "not-needed",
      sourcePath,
      targetPath,
      copiedEntries,
    };
  } catch (error) {
    return {
      status: "repair-failed",
      sourcePath,
      targetPath,
      copiedEntries,
      error,
    };
  }
}
