import type { SaxesTagPlain } from "saxes";
import { SaxesParser } from "saxes";

export type XmlLeafEntry = {
  path: string;
  text: string;
};

export type XmlRecoveryStats = {
  recoveredFiles: number;
  strictParseFailures: number;
  unrecoverableFiles: number;
};

type XmlStackNode = {
  childCounts: Map<string, number>;
  index: number;
  name: string;
  textParts: string[];
};

const xmlRecoveryStats: XmlRecoveryStats = {
  recoveredFiles: 0,
  strictParseFailures: 0,
  unrecoverableFiles: 0,
};

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

function normalizeXmlText(value: string) {
  return stripXmlControlCharacters(value, " ").replace(/\s+/g, " ").trim();
}

function normalizePathForId(value: string) {
  return value.replaceAll("\\", "/").toLowerCase();
}

function sanitizeXmlPreamble(xml: string) {
  return xml.replace(/^\uFEFF/, "").replace(/^\s*<\?xml[\s\S]*?\?>\s*/i, "");
}

function escapeBareAmpersands(xml: string) {
  return xml.replace(
    /&(?!(?:#\d+|#x[\dA-Fa-f]+|amp|apos|gt|lt|quot);)/g,
    "&amp;",
  );
}

function sanitizeXmlForStrictParse(xml: string) {
  return escapeBareAmpersands(sanitizeXmlPreamble(xml));
}

function sanitizeXmlForRecoveryParse(xml: string) {
  return sanitizeXmlPreamble(xml);
}

function decodeXmlTextEntities(value: string) {
  return value.replace(
    /&(#x[\dA-Fa-f]+|#\d+|amp|apos|gt|lt|quot);/g,
    (match, entity: string) => {
      switch (entity) {
        case "amp":
          return "&";
        case "apos":
          return "'";
        case "gt":
          return ">";
        case "lt":
          return "<";
        case "quot":
          return '"';
        default: {
          if (entity.startsWith("#x")) {
            const codePoint = Number.parseInt(entity.slice(2), 16);

            return Number.isFinite(codePoint)
              ? String.fromCodePoint(codePoint)
              : match;
          }

          if (entity.startsWith("#")) {
            const codePoint = Number.parseInt(entity.slice(1), 10);

            return Number.isFinite(codePoint)
              ? String.fromCodePoint(codePoint)
              : match;
          }

          return match;
        }
      }
    },
  );
}

function formatPathSegments(segments: Array<{ index: number; name: string }>) {
  return segments
    .map((segment) =>
      segment.name === "li"
        ? String(segment.index)
        : segment.index > 0
          ? `${segment.name}[${segment.index}]`
          : segment.name,
    )
    .join("/");
}

function isTagNameStartCharacter(character: string | undefined) {
  return character !== undefined && /[A-Za-z_:]/.test(character);
}

function isTagNameCharacter(character: string | undefined) {
  return character !== undefined && /[A-Za-z0-9:_.-]/.test(character);
}

function createLeafEntryCollector() {
  const rootCounts = new Map<string, number>();
  const stack: XmlStackNode[] = [];
  const entries: XmlLeafEntry[] = [];

  const flushCurrentNode = () => {
    const current = stack.at(-1);

    if (!current) {
      return;
    }

    const normalizedText = normalizeXmlText(current.textParts.join(""));
    current.textParts.length = 0;

    if (!normalizedText) {
      return;
    }

    entries.push({
      path: formatPathSegments(stack),
      text: normalizedText,
    });
  };

  const closeTopNode = () => {
    if (stack.length === 0) {
      return;
    }

    flushCurrentNode();
    stack.pop();
  };

  return {
    closeTopNode,
    closeTag(tagName: string | null) {
      if (tagName === null) {
        closeTopNode();
        return;
      }

      let matchedIndex = -1;

      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index]?.name === tagName) {
          matchedIndex = index;
          break;
        }
      }

      if (matchedIndex < 0) {
        return;
      }

      while (stack.length - 1 > matchedIndex) {
        closeTopNode();
      }

      closeTopNode();
    },
    finish() {
      while (stack.length > 0) {
        closeTopNode();
      }

      return entries;
    },
    openTag(tagName: string) {
      flushCurrentNode();

      const parent = stack.at(-1);
      const siblingCounts = parent?.childCounts ?? rootCounts;
      const nextIndex = siblingCounts.get(tagName) ?? 0;
      siblingCounts.set(tagName, nextIndex + 1);

      stack.push({
        childCounts: new Map<string, number>(),
        index: nextIndex,
        name: tagName,
        textParts: [],
      });
    },
    pushCdata(text: string) {
      stack.at(-1)?.textParts.push(text);
    },
    pushText(text: string) {
      stack.at(-1)?.textParts.push(text);
    },
  };
}

function collectLeafEntriesStrict(xml: string) {
  const collector = createLeafEntryCollector();
  const parser = new SaxesParser({
    fragment: true,
    xmlns: false,
  });

  parser.on("opentag", (tag: SaxesTagPlain) => {
    collector.openTag(tag.name);
  });

  parser.on("text", (text: string) => {
    collector.pushText(text);
  });

  parser.on("cdata", (text: string) => {
    collector.pushCdata(text);
  });

  parser.on("closetag", () => {
    collector.closeTopNode();
  });

  parser.on("error", (error: Error) => {
    throw error;
  });

  parser.write(xml).close();
  return collector.finish();
}

function consumeQuotedTagTail(xml: string, startIndex: number) {
  let cursor = startIndex;
  let activeQuote: '"' | "'" | null = null;

  while (cursor < xml.length) {
    const character = xml[cursor];

    if (activeQuote !== null) {
      if (character === activeQuote) {
        activeQuote = null;
      }

      cursor += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      activeQuote = character;
      cursor += 1;
      continue;
    }

    if (character === ">") {
      return cursor;
    }

    cursor += 1;
  }

  return -1;
}

function collectLeafEntriesRecovered(xml: string) {
  const collector = createLeafEntryCollector();
  let cursor = 0;

  while (cursor < xml.length) {
    const markupIndex = xml.indexOf("<", cursor);

    if (markupIndex < 0) {
      collector.pushText(decodeXmlTextEntities(xml.slice(cursor)));
      break;
    }

    if (markupIndex > cursor) {
      collector.pushText(decodeXmlTextEntities(xml.slice(cursor, markupIndex)));
      cursor = markupIndex;
    }

    if (xml.startsWith("<!--", cursor)) {
      const commentEnd = xml.indexOf("-->", cursor + 4);
      cursor = commentEnd >= 0 ? commentEnd + 3 : xml.length;
      continue;
    }

    if (xml.startsWith("<![CDATA[", cursor)) {
      const cdataEnd = xml.indexOf("]]>", cursor + 9);

      if (cdataEnd < 0) {
        collector.pushCdata(xml.slice(cursor + 9));
        break;
      }

      collector.pushCdata(xml.slice(cursor + 9, cdataEnd));
      cursor = cdataEnd + 3;
      continue;
    }

    if (xml.startsWith("<?", cursor)) {
      const instructionEnd = xml.indexOf("?>", cursor + 2);
      cursor = instructionEnd >= 0 ? instructionEnd + 2 : xml.length;
      continue;
    }

    if (xml.startsWith("<!", cursor)) {
      const declarationEnd = consumeQuotedTagTail(xml, cursor + 2);
      cursor = declarationEnd >= 0 ? declarationEnd + 1 : xml.length;
      continue;
    }

    if (xml[cursor + 1] === "/") {
      let tagNameStart = cursor + 2;

      while (/\s/.test(xml[tagNameStart] ?? "")) {
        tagNameStart += 1;
      }

      if (!isTagNameStartCharacter(xml[tagNameStart])) {
        collector.pushText("<");
        cursor += 1;
        continue;
      }

      let tagNameEnd = tagNameStart + 1;

      while (isTagNameCharacter(xml[tagNameEnd])) {
        tagNameEnd += 1;
      }

      const closingTagEnd = xml.indexOf(">", tagNameEnd);

      if (closingTagEnd < 0) {
        collector.pushText("<");
        cursor += 1;
        continue;
      }

      collector.closeTag(xml.slice(tagNameStart, tagNameEnd));
      cursor = closingTagEnd + 1;
      continue;
    }

    const tagNameStart = cursor + 1;

    if (!isTagNameStartCharacter(xml[tagNameStart])) {
      collector.pushText("<");
      cursor += 1;
      continue;
    }

    let tagNameEnd = tagNameStart + 1;

    while (isTagNameCharacter(xml[tagNameEnd])) {
      tagNameEnd += 1;
    }

    const tagEnd = consumeQuotedTagTail(xml, tagNameEnd);

    if (tagEnd < 0) {
      collector.pushText("<");
      cursor += 1;
      continue;
    }

    const tagName = xml.slice(tagNameStart, tagNameEnd);
    const rawTagTail = xml.slice(tagNameEnd, tagEnd);
    const isSelfClosing = rawTagTail.trimEnd().endsWith("/");

    collector.openTag(tagName);

    if (isSelfClosing) {
      collector.closeTag(tagName);
    }

    cursor = tagEnd + 1;
  }

  return collector.finish();
}

function collectLeafEntriesWithRecovery(xml: string) {
  try {
    return collectLeafEntriesStrict(sanitizeXmlForStrictParse(xml));
  } catch {
    xmlRecoveryStats.strictParseFailures += 1;
  }

  try {
    const recoveredEntries = collectLeafEntriesRecovered(
      sanitizeXmlForRecoveryParse(xml),
    );

    xmlRecoveryStats.recoveredFiles += 1;
    return recoveredEntries;
  } catch (error) {
    xmlRecoveryStats.unrecoverableFiles += 1;
    throw error;
  }
}

export function collectXmlLeafEntries(xml: string) {
  return collectLeafEntriesWithRecovery(xml);
}

export function extractFirstMatchingTagText(
  xml: string,
  tagNames: string[],
): string | null {
  const wanted = new Set(tagNames.map((tagName) => tagName.toLowerCase()));

  for (const leaf of collectLeafEntriesWithRecovery(xml)) {
    const leafName = leaf.path
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\[\d+\]$/g, "")
      .toLowerCase();

    if (leafName && wanted.has(leafName)) {
      return leaf.text;
    }
  }

  return null;
}

export function collectKeyedIdsFromXml(xml: string, relativeFilePath: string) {
  const ids = new Set<string>();

  for (const leaf of collectLeafEntriesWithRecovery(xml)) {
    const normalizedLeafPath = normalizePathForId(
      leaf.path.replace(/^LanguageData\//, ""),
    );

    if (!normalizedLeafPath) {
      continue;
    }

    ids.add(`keyed:${relativeFilePath}:${normalizedLeafPath}`);
  }

  return ids;
}

export function collectDefInjectedIdsFromXml(xml: string, defType: string) {
  const ids = new Set<string>();

  for (const leaf of collectLeafEntriesWithRecovery(xml)) {
    const normalizedLeafPath = normalizePathForId(
      leaf.path.replace(/^LanguageData\//, ""),
    );

    if (!normalizedLeafPath) {
      continue;
    }

    ids.add(`definjected:${defType}:${normalizedLeafPath}`);
  }

  return ids;
}

function buildDefFieldPath(rawPath: string) {
  const segments = rawPath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/\[\d+\]$/g, ""));

  if (segments.length === 0) {
    return null;
  }

  const normalizedSegments = rawPath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const indexedLi = /^li\[(\d+)\]$/.exec(segment);

      if (indexedLi) {
        return indexedLi[1] ?? segment;
      }

      return segment.replace(/\[(\d+)\]$/g, ".$1");
    });

  return normalizedSegments.join(".");
}

function isProbablyLocalizableDefField(args: {
  fieldPath: string;
  text: string;
}) {
  const fieldPath = args.fieldPath.toLowerCase();
  const leafName = fieldPath.split(".").at(-1) ?? fieldPath;
  const normalizedText = args.text.trim();

  if (!normalizedText || leafName === "defname") {
    return false;
  }

  if (/^(true|false|-?\d+(?:\.\d+)?)$/i.test(normalizedText)) {
    return false;
  }

  if (
    /(?:class|path|tex|shader|icon|sound|worker|packageid|thingid|modid|id)$/i.test(
      leafName,
    )
  ) {
    return false;
  }

  if (
    /(description|gerund|inspect|jobstring|label|letter|message|name|noun|reason|report|string|summary|text|tip|title|tooltip)/i.test(
      leafName,
    )
  ) {
    return true;
  }

  return /[\p{L}\p{Script=Han}]/u.test(normalizedText);
}

type DefGroup = {
  defName: string | null;
  leaves: XmlLeafEntry[];
  tagName: string;
};

export function collectDefsBaselineIdsFromXml(xml: string) {
  const groups = new Map<string, DefGroup>();
  const ids = new Set<string>();

  for (const leaf of collectLeafEntriesWithRecovery(xml)) {
    const segments = leaf.path.split("/").filter(Boolean);

    if (segments.length < 3 || segments[0]?.toLowerCase() !== "defs") {
      continue;
    }

    const groupKey = segments.slice(0, 2).join("/");
    const groupTagName = segments[1]?.replace(/\[\d+\]$/g, "") ?? null;
    const localPath = segments.slice(2).join("/");

    if (!groupTagName || !localPath) {
      continue;
    }

    const group = groups.get(groupKey) ?? {
      defName: null,
      leaves: [],
      tagName: groupTagName,
    };

    if (localPath === "defName") {
      group.defName = leaf.text;
    } else {
      group.leaves.push({
        path: localPath,
        text: leaf.text,
      });
    }

    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    if (!group.defName) {
      continue;
    }

    for (const leaf of group.leaves) {
      const fieldPath = buildDefFieldPath(leaf.path);

      if (
        !fieldPath ||
        !isProbablyLocalizableDefField({
          fieldPath,
          text: leaf.text,
        })
      ) {
        continue;
      }

      ids.add(
        `definjected:${normalizePathForId(group.tagName)}:${normalizePathForId(`${group.defName}.${fieldPath}`)}`,
      );
    }
  }

  return ids;
}

export function getXmlRecoveryStatsForTests() {
  return {
    ...xmlRecoveryStats,
  };
}

export function resetXmlRecoveryStatsForTests() {
  xmlRecoveryStats.recoveredFiles = 0;
  xmlRecoveryStats.strictParseFailures = 0;
  xmlRecoveryStats.unrecoverableFiles = 0;
}
