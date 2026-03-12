import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, win32 } from "node:path";
import type {
  AppError,
  ExecutionEnvironment,
  ModLibraryResult,
  ModRecord,
  ModSource,
  PathSelection,
} from "@rimun/shared";
import { getExecutionEnvironment, windowsPathToWslPath } from "./platform";

type ScanModLibraryOptions = {
  environment?: ExecutionEnvironment;
  toReadablePath?: (windowsPath: string) => string | null;
};

type ParsedModsConfig = {
  activePackageIds: Set<string>;
};

function createAppError(
  code: AppError["code"],
  message: string,
  detail: string | null,
  recoverable: boolean,
): AppError {
  return {
    code,
    message,
    detail,
    recoverable,
  };
}

function decodeUtf16Le(fileContent: Uint8Array) {
  return Buffer.from(fileContent).toString("utf16le");
}

function decodeUtf16Be(fileContent: Uint8Array) {
  const swapped = Buffer.from(fileContent);

  for (let index = 0; index + 1 < swapped.length; index += 2) {
    const current = swapped[index];
    swapped[index] = swapped[index + 1] ?? current;
    swapped[index + 1] = current;
  }

  return swapped.toString("utf16le");
}

function decodeXmlFileContent(fileContent: Uint8Array) {
  if (
    fileContent.length >= 2 &&
    fileContent[0] === 0xff &&
    fileContent[1] === 0xfe
  ) {
    return decodeUtf16Le(fileContent.subarray(2));
  }

  if (
    fileContent.length >= 2 &&
    fileContent[0] === 0xfe &&
    fileContent[1] === 0xff
  ) {
    return decodeUtf16Be(fileContent.subarray(2));
  }

  if (
    fileContent.length >= 3 &&
    fileContent[0] === 0xef &&
    fileContent[1] === 0xbb &&
    fileContent[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(fileContent);
  }

  const sampleSize = Math.min(fileContent.length - (fileContent.length % 2), 128);
  let zeroOnEven = 0;
  let zeroOnOdd = 0;

  for (let index = 0; index < sampleSize; index += 2) {
    if (fileContent[index] === 0) {
      zeroOnEven += 1;
    }

    if (fileContent[index + 1] === 0) {
      zeroOnOdd += 1;
    }
  }

  if (sampleSize > 0) {
    const pairCount = sampleSize / 2;

    if (zeroOnOdd / pairCount > 0.3) {
      return decodeUtf16Le(fileContent);
    }

    if (zeroOnEven / pairCount > 0.3) {
      return decodeUtf16Be(fileContent);
    }
  }

  return new TextDecoder("utf-8").decode(fileContent);
}

function readXmlFile(filePath: string) {
  return decodeXmlFileContent(readFileSync(filePath));
}

function decodeXmlEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalizeText(value: string) {
  return decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(value: string) {
  return decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTagText(xml: string, tagName: string) {
  const match = new RegExp(
    `<${tagName}>([\\s\\S]*?)</${tagName}>`,
    "i",
  ).exec(xml);

  return match ? normalizeText(match[1]) || null : null;
}

function extractTagMultilineText(xml: string, tagName: string) {
  const match = new RegExp(
    `<${tagName}>([\\s\\S]*?)</${tagName}>`,
    "i",
  ).exec(xml);

  return match ? normalizeMultilineText(match[1]) || null : null;
}

function extractTagList(xml: string, tagName: string) {
  const match = new RegExp(
    `<${tagName}>([\\s\\S]*?)</${tagName}>`,
    "i",
  ).exec(xml);

  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => normalizeText(entry[1]))
    .filter(Boolean);
}

// 只解析当前 UI 需要的 About.xml 基础字段，避免在 bridge 层引入重量级 XML 依赖。
export function parseAboutXml(xml: string) {
  const authors = extractTagList(xml, "authors");
  const authorText = extractTagText(xml, "author");
  const supportedVersions = extractTagList(xml, "supportedVersions");

  return {
    name: extractTagText(xml, "name"),
    packageId: extractTagText(xml, "packageId"),
    author:
      authors.length > 0
        ? authors.join(", ")
        : authorText
          ? normalizeText(authorText)
          : null,
    version:
      extractTagText(xml, "modVersion") ??
      extractTagText(xml, "targetVersion") ??
      supportedVersions[0] ??
      null,
    description: extractTagMultilineText(xml, "description"),
  };
}

export function parseModsConfigXml(xml: string): ParsedModsConfig {
  return {
    activePackageIds: new Set(
      extractTagList(xml, "activeMods").map((packageId) => packageId.toLowerCase()),
    ),
  };
}

function isOfficialMod(source: ModSource, packageId: string | null) {
  return source === "installation" && packageId?.startsWith("ludeon.rimworld")
    ? true
    : source === "installation" && packageId === null;
}

function createReadablePathResolver() {
  if (process.platform === "win32") {
    return (windowsPath: string) => windowsPath;
  }

  return windowsPathToWslPath;
}

function scanRoot(
  source: ModSource,
  rootWindowsPath: string | null,
  toReadablePath: (windowsPath: string) => string | null,
  activePackageIds: Set<string>,
  errors: AppError[],
): ModRecord[] {
  if (!rootWindowsPath) {
    return [];
  }

  const readableRoot = toReadablePath(rootWindowsPath);

  if (!readableRoot) {
    errors.push(
      createAppError(
        "environment_error",
        `Unable to map ${source} path into the current runtime.`,
        rootWindowsPath,
        true,
      ),
    );
    return [];
  }

  if (!existsSync(readableRoot)) {
    errors.push(
      createAppError(
        "filesystem_error",
        `${source} directory does not exist.`,
        rootWindowsPath,
        true,
      ),
    );
    return [];
  }

  return readdirSync(readableRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const modWindowsPath = win32.join(rootWindowsPath, entry.name);
      const modReadablePath = join(readableRoot, entry.name);
      const aboutReadablePath = join(modReadablePath, "About", "About.xml");
      const aboutWindowsPath = win32.join(modWindowsPath, "About", "About.xml");
      const hasAboutXml = existsSync(aboutReadablePath);
      const parsedAbout = hasAboutXml
        ? parseAboutXml(readXmlFile(aboutReadablePath))
        : null;
      const notes = hasAboutXml ? [] : ["About/About.xml was not found."];

      return {
        id: `${source}:${parsedAbout?.packageId ?? entry.name}`,
        name: parsedAbout?.name ?? entry.name,
        packageId: parsedAbout?.packageId ?? null,
        author: parsedAbout?.author ?? null,
        version: parsedAbout?.version ?? null,
        description: parsedAbout?.description ?? null,
        source,
        windowsPath: modWindowsPath,
        wslPath: modReadablePath.startsWith("/") ? modReadablePath : null,
        manifestPath: hasAboutXml ? aboutWindowsPath : null,
        enabled: parsedAbout?.packageId
          ? activePackageIds.has(parsedAbout.packageId.toLowerCase())
          : false,
        isOfficial: isOfficialMod(source, parsedAbout?.packageId ?? null),
        hasAboutXml,
        notes,
      } satisfies ModRecord;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function scanModLibrary(
  selection: PathSelection | null,
  options: ScanModLibraryOptions = {},
): ModLibraryResult {
  const environment = options.environment ?? getExecutionEnvironment();
  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();
  const errors: AppError[] = [];
  const installationModsPath = selection?.installationPath
    ? win32.join(selection.installationPath, "Mods")
    : null;
  const workshopPath = selection?.workshopPath ?? null;
  const modsConfigPath = selection?.configPath
    ? win32.join(selection.configPath, "ModsConfig.xml")
    : null;

  if (!selection?.installationPath) {
    errors.push(
      createAppError(
        "persistence_error",
        "No RimWorld installation path is configured.",
        "Open Core Config and save a Windows installation path before loading the mod library.",
        true,
      ),
    );

    return {
      environment,
      selection,
      scannedAt: new Date().toISOString(),
      scannedRoots: {
        installationModsPath,
        workshopPath,
        modsConfigPath,
      },
      mods: [],
      errors,
      requiresConfiguration: true,
    };
  }

  let activePackageIds = new Set<string>();

  if (modsConfigPath) {
    const readableModsConfigPath = toReadablePath(modsConfigPath);

    if (readableModsConfigPath && existsSync(readableModsConfigPath)) {
      activePackageIds = parseModsConfigXml(readXmlFile(readableModsConfigPath)).activePackageIds;
    } else {
      errors.push(
        createAppError(
          "filesystem_error",
          "ModsConfig.xml was not found, so enabled state could not be resolved.",
          modsConfigPath,
          true,
        ),
      );
    }
  } else {
    errors.push(
      createAppError(
        "persistence_error",
        "No RimWorld config path is configured, so enabled state could not be resolved.",
        "Save or auto-detect the config directory to map active mods from ModsConfig.xml.",
        true,
      ),
    );
  }

  const mods = [
    ...scanRoot(
      "installation",
      installationModsPath,
      toReadablePath,
      activePackageIds,
      errors,
    ),
    ...scanRoot(
      "workshop",
      workshopPath,
      toReadablePath,
      activePackageIds,
      errors,
    ),
  ].sort((left, right) => left.name.localeCompare(right.name));

  return {
    environment,
    selection,
    scannedAt: new Date().toISOString(),
    scannedRoots: {
      installationModsPath,
      workshopPath,
      modsConfigPath,
    },
    mods,
    errors,
    requiresConfiguration: false,
  };
}
