import type {
  ModDependencyMetadata,
  ModSource,
  ModSourceSnapshotEntry,
} from "@rimun/shared";

const CORE_PACKAGE_ID = "ludeon.rimworld";
const OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX = `${CORE_PACKAGE_ID}.`;

export type ParsedModsConfig = {
  activePackageIds: Set<string>;
  activePackageIdsOrdered: string[];
};

export type ParsedAbout = ReturnType<typeof parseAboutXml>;

function decodeXmlEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function stripXmlControlCharacters(value: string, replacement: "" | " ") {
  let normalized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isNullCharacter = codePoint === 0;
    const isBlockedControlCharacter =
      (codePoint >= 0x01 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f);

    if (isNullCharacter || isBlockedControlCharacter) {
      normalized += replacement;
      continue;
    }

    normalized += character;
  }

  return normalized;
}

function normalizeText(value: string) {
  return stripXmlControlCharacters(
    decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")),
    " ",
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(value: string) {
  return stripXmlControlCharacters(
    decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")),
    "",
  )
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

function normalizePackageId(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function getRootInnerXml(xml: string, rootTagName: string) {
  const match = new RegExp(
    `<${rootTagName}\\b[^>]*>([\\s\\S]*?)</${rootTagName}>`,
    "i",
  ).exec(xml);

  return match?.[1] ?? xml;
}

function extractDirectChildTagBlocks(
  xml: string,
  tagName: string,
  rootTagName = "ModMetaData",
) {
  const rootInnerXml = getRootInnerXml(xml, rootTagName);
  const tagPattern =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([A-Za-z0-9:_-]+)\b[^>]*\/?>/g;
  const blocks: string[] = [];
  const stack: string[] = [];
  let captureStart: number | null = null;

  for (const match of rootInnerXml.matchAll(tagPattern)) {
    const fullTag = match[0] ?? "";
    const matchedTagName = match[1];

    if (!matchedTagName) {
      continue;
    }

    const normalizedTagName = matchedTagName.toLowerCase();
    const targetTagName = tagName.toLowerCase();
    const isClosingTag = fullTag.startsWith("</");
    const isSelfClosingTag = !isClosingTag && fullTag.endsWith("/>");

    if (!isClosingTag) {
      if (stack.length === 0 && normalizedTagName === targetTagName) {
        if (isSelfClosingTag) {
          blocks.push("");
          continue;
        }

        captureStart = (match.index ?? 0) + fullTag.length;
      }

      if (!isSelfClosingTag) {
        stack.push(normalizedTagName);
      }

      continue;
    }

    const closedTagName = stack.pop();

    if (
      closedTagName === targetTagName &&
      stack.length === 0 &&
      captureStart !== null
    ) {
      blocks.push(rootInnerXml.slice(captureStart, match.index ?? 0));
      captureStart = null;
    }
  }

  return blocks;
}

function extractTagText(xml: string, tagName: string) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i").exec(
    xml,
  );

  return match ? normalizeText(match[1] ?? "") || null : null;
}

function extractTagList(xml: string, tagName: string) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i").exec(
    xml,
  );

  if (!match) {
    return [];
  }

  return [...(match[1] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => normalizeText(entry[1] ?? ""))
    .filter(Boolean);
}

function extractDependencyPackageIds(xml: string) {
  const dependencyXml = extractDirectChildTagBlocks(xml, "modDependencies").at(
    0,
  );

  if (!dependencyXml) {
    return [];
  }

  return [...dependencyXml.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => {
      const dependencyItemXml = entry[1] ?? "";
      const nestedPackageId = extractTagText(dependencyItemXml, "packageId");

      return normalizePackageId(
        nestedPackageId ?? normalizeText(dependencyItemXml),
      );
    })
    .filter((value): value is string => Boolean(value));
}

function extractAboutTagText(xml: string, tagName: string) {
  const block = extractDirectChildTagBlocks(xml, tagName).at(0);
  return block ? normalizeText(block) || null : null;
}

function extractAboutTagMultilineText(xml: string, tagName: string) {
  const block = extractDirectChildTagBlocks(xml, tagName).at(0);
  return block ? normalizeMultilineText(block) || null : null;
}

function extractAboutTagList(xml: string, tagName: string) {
  const block = extractDirectChildTagBlocks(xml, tagName).at(0);

  if (!block) {
    return [];
  }

  return [...block.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => normalizeText(entry[1] ?? ""))
    .filter(Boolean);
}

function createParsedActivePackageIds(
  activePackageIds: string[],
): ParsedModsConfig {
  const normalizedActivePackageIds: string[] = [];
  const seen = new Set<string>();

  for (const packageId of activePackageIds) {
    const normalizedPackageId = packageId.trim().toLowerCase();

    if (!normalizedPackageId || seen.has(normalizedPackageId)) {
      continue;
    }

    seen.add(normalizedPackageId);
    normalizedActivePackageIds.push(normalizedPackageId);
  }

  return {
    activePackageIds: new Set(normalizedActivePackageIds),
    activePackageIdsOrdered: normalizedActivePackageIds,
  };
}

function normalizeOfficialExpansionPackageId(value: string | null) {
  const normalizedValue = normalizePackageId(value);

  if (!normalizedValue || normalizedValue === CORE_PACKAGE_ID) {
    return null;
  }

  if (normalizedValue.startsWith(OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX)) {
    return normalizedValue;
  }

  return `${OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX}${normalizedValue}`;
}

function toKnownExpansionId(packageId: string | null) {
  const normalizedPackageId = normalizePackageId(packageId);

  if (
    !normalizedPackageId ||
    normalizedPackageId === CORE_PACKAGE_ID ||
    !normalizedPackageId.startsWith(OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX)
  ) {
    return null;
  }

  return normalizedPackageId.slice(OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX.length);
}

function mergeConfiguredActivePackageIds(
  activePackageIds: string[],
  officialExpansionPackageIds: string[],
) {
  const normalizedActivePackageIds =
    createParsedActivePackageIds(activePackageIds).activePackageIdsOrdered;
  const normalizedOfficialExpansionPackageIds = createParsedActivePackageIds(
    officialExpansionPackageIds,
  ).activePackageIdsOrdered;
  const mergedPackageIds: string[] = [];
  const seen = new Set<string>();

  const pushPackageId = (packageId: string) => {
    if (!packageId || seen.has(packageId)) {
      return;
    }

    seen.add(packageId);
    mergedPackageIds.push(packageId);
  };

  if (normalizedActivePackageIds.includes(CORE_PACKAGE_ID)) {
    pushPackageId(CORE_PACKAGE_ID);
  }

  for (const packageId of normalizedOfficialExpansionPackageIds) {
    pushPackageId(packageId);
  }

  for (const packageId of normalizedActivePackageIds) {
    pushPackageId(packageId);
  }

  return mergedPackageIds;
}

function splitActivePackageIdsForConfig(activePackageIds: string[]) {
  const normalizedActivePackageIds =
    createParsedActivePackageIds(activePackageIds).activePackageIdsOrdered;
  const knownExpansionIds = normalizedActivePackageIds
    .map((packageId) => toKnownExpansionId(packageId))
    .filter((value): value is string => Boolean(value));

  return {
    activeModsPackageIds: normalizedActivePackageIds.filter(
      (packageId) => toKnownExpansionId(packageId) === null,
    ),
    knownExpansionIds,
  };
}

export function parseAboutXml(xml: string) {
  const authors = extractAboutTagList(xml, "authors");
  const authorText = extractAboutTagText(xml, "author");
  const supportedVersions = extractAboutTagList(xml, "supportedVersions");
  const packageId = extractAboutTagText(xml, "packageId");

  return {
    name: extractAboutTagText(xml, "name"),
    packageId,
    author:
      authors.length > 0
        ? authors.join(", ")
        : authorText
          ? normalizeText(authorText)
          : null,
    version:
      extractAboutTagText(xml, "modVersion") ??
      extractAboutTagText(xml, "targetVersion") ??
      supportedVersions[0] ??
      null,
    description: extractAboutTagMultilineText(xml, "description"),
    dependencyMetadata: {
      packageIdNormalized: normalizePackageId(packageId),
      dependencies: extractDependencyPackageIds(xml),
      loadAfter: extractAboutTagList(xml, "loadAfter").map((value) =>
        value.toLowerCase(),
      ),
      loadBefore: extractAboutTagList(xml, "loadBefore").map((value) =>
        value.toLowerCase(),
      ),
      forceLoadAfter: extractAboutTagList(xml, "forceLoadAfter").map((value) =>
        value.toLowerCase(),
      ),
      forceLoadBefore: extractAboutTagList(xml, "forceLoadBefore").map((value) =>
        value.toLowerCase(),
      ),
      incompatibleWith: extractAboutTagList(xml, "incompatibleWith").map((value) =>
        value.toLowerCase(),
      ),
      supportedVersions,
    } satisfies ModDependencyMetadata,
  };
}

export function parseModsConfigXml(xml: string): ParsedModsConfig {
  const activePackageIds = extractTagList(xml, "activeMods");
  const officialExpansionPackageIds = extractTagList(xml, "knownExpansions")
    .map((value) => normalizeOfficialExpansionPackageId(value))
    .filter((value): value is string => Boolean(value));

  return createParsedActivePackageIds(
    mergeConfiguredActivePackageIds(
      activePackageIds,
      officialExpansionPackageIds,
    ),
  );
}

function escapeXmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildActiveModsXml(activePackageIds: string[]) {
  if (activePackageIds.length === 0) {
    return "  <activeMods />\n";
  }

  return [
    "  <activeMods>",
    ...activePackageIds.map(
      (packageId) => `    <li>${escapeXmlText(packageId)}</li>`,
    ),
    "  </activeMods>",
  ].join("\n");
}

function buildKnownExpansionsXml(knownExpansionIds: string[]) {
  if (knownExpansionIds.length === 0) {
    return "  <knownExpansions />\n";
  }

  return [
    "  <knownExpansions>",
    ...knownExpansionIds.map(
      (knownExpansionId) => `    <li>${escapeXmlText(knownExpansionId)}</li>`,
    ),
    "  </knownExpansions>",
  ].join("\n");
}

function replaceXmlListBlock(
  xml: string,
  tagName: string,
  blockContent: string,
) {
  const tagPattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "i");
  const selfClosingPattern = new RegExp(`<${tagName}\\s*\\/>`, "i");
  const closingRootPattern = /<\/ModsConfigData>/i;

  if (tagPattern.test(xml)) {
    return xml.replace(tagPattern, blockContent);
  }

  if (selfClosingPattern.test(xml)) {
    return xml.replace(selfClosingPattern, blockContent.trim());
  }

  if (closingRootPattern.test(xml)) {
    return xml.replace(
      closingRootPattern,
      `${blockContent}\n</ModsConfigData>`,
    );
  }

  return null;
}

export function replaceActiveModsBlock(
  xml: string,
  activePackageIds: string[],
) {
  const { activeModsPackageIds, knownExpansionIds } =
    splitActivePackageIdsForConfig(activePackageIds);
  const activeModsBlock = buildActiveModsXml(activeModsPackageIds);
  const knownExpansionsBlock = buildKnownExpansionsXml(knownExpansionIds);

  const xmlWithActiveMods =
    replaceXmlListBlock(xml, "activeMods", activeModsBlock) ??
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<ModsConfigData>",
      activeModsBlock,
      "</ModsConfigData>",
      "",
    ].join("\n");

  return (
    replaceXmlListBlock(
      xmlWithActiveMods,
      "knownExpansions",
      knownExpansionsBlock,
    ) ??
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<ModsConfigData>",
      activeModsBlock,
      knownExpansionsBlock,
      "</ModsConfigData>",
      "",
    ].join("\n")
  );
}

export function isOfficialMod(source: ModSource, packageId: string | null) {
  return source === "installation" && packageId?.startsWith("ludeon.rimworld")
    ? true
    : source === "installation" && packageId === null;
}

export function getEntryReadableWslPath(entry: ModSourceSnapshotEntry) {
  return entry.modReadablePath.startsWith("/") ? entry.modReadablePath : null;
}
