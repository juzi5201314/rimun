import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  collectDefsBaselineIdsFromXml,
  collectXmlLeafEntries,
  extractFirstMatchingTagText,
  getXmlRecoveryStatsForTests,
  resetXmlRecoveryStatsForTests,
} from "./parser";

beforeEach(() => {
  resetXmlRecoveryStatsForTests();
});

afterEach(() => {
  resetXmlRecoveryStatsForTests();
});

describe("mod localization xml parser", () => {
  it("recovers mismatched closing tags by auto-closing intermediate nodes", () => {
    const leaves = collectXmlLeafEntries(
      "<LanguageData><broken>值</LanguageData>",
    );

    expect(leaves).toContainEqual({
      path: "LanguageData/broken",
      text: "值",
    });
    expect(getXmlRecoveryStatsForTests()).toEqual({
      recoveredFiles: 1,
      strictParseFailures: 1,
      unrecoverableFiles: 0,
    });
  });

  it("treats stray close tags and raw angle brackets in text as recoverable", () => {
    const leaves = collectXmlLeafEntries(
      "<LanguageData><label>a < b &amp; c</label></oops><title><![CDATA[x < y]]></title></LanguageData>",
    );

    expect(leaves).toContainEqual({
      path: "LanguageData/label",
      text: "a < b & c",
    });
    expect(leaves).toContainEqual({
      path: "LanguageData/title",
      text: "x < y",
    });
    expect(getXmlRecoveryStatsForTests()).toEqual({
      recoveredFiles: 1,
      strictParseFailures: 1,
      unrecoverableFiles: 0,
    });
  });

  it("recovers malformed prefs tags when extracting the current language", () => {
    expect(
      extractFirstMatchingTagText(
        "<Prefs><langFolderName>ChineseSimplified</Prefs>",
        ["langFolderName", "languageFolderName"],
      ),
    ).toBe("ChineseSimplified");

    expect(getXmlRecoveryStatsForTests()).toEqual({
      recoveredFiles: 1,
      strictParseFailures: 1,
      unrecoverableFiles: 0,
    });
  });

  it("recovers malformed defs trees when deriving def-injected baseline ids", () => {
    const ids = collectDefsBaselineIdsFromXml(
      "<Defs><ThingDef><defName>RecoverThing</defName><label>Recover label</Defs>",
    );

    expect(ids).toContain("definjected:thingdef:recoverthing.label");
    expect(getXmlRecoveryStatsForTests()).toEqual({
      recoveredFiles: 1,
      strictParseFailures: 1,
      unrecoverableFiles: 0,
    });
  });
});
