import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import { HostApiProvider } from "@/shared/host/HostApiProvider";
import { I18nProvider } from "@/shared/i18n";
import { createTestHostApi } from "@/shared/testing/createTestHostApi.node";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModListRowCard } from "./ModListRow";

function createItem(
  overrides: Partial<HomePageModListItem> = {},
): HomePageModListItem {
  return {
    id: "workshop:unlimitedhugs.hugslib",
    name: "HugsLib",
    packageId: "unlimitedhugs.hugslib",
    author: "UnlimitedHugs",
    version: null,
    description: null,
    source: "workshop",
    windowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962",
    wslPath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/818773962",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962\\About\\About.xml",
    enabled: false,
    isOfficial: false,
    hasAboutXml: true,
    dependencyMetadata: {
      packageIdNormalized: "unlimitedhugs.hugslib",
      dependencies: [],
      loadAfter: [],
      loadBefore: [],
      forceLoadAfter: [],
      forceLoadBefore: [],
      incompatibleWith: [],
      supportedVersions: ["1.5"],
    },
    notes: [],
    currentGameVersion: "1.5",
    dragDisabledReason: null,
    hasCurrentOrderIssue: false,
    hasUnsupportedGameVersion: false,
    isDraggable: true,
    packageIdNormalized: "unlimitedhugs.hugslib",
    searchText: "hugslib unlimitedhugs",
    columnId: "inactive",
    orderLabel: null,
    ...overrides,
  };
}

describe("ModListRowCard", () => {
  it("shows supported RimWorld versions without fabricating a mod version", async () => {
    render(
      <HostApiProvider hostApi={createTestHostApi()}>
        <I18nProvider>
          <ModListRowCard
            dragHandle={<span aria-hidden="true" />}
            isDragging={false}
            isSelected={false}
            item={createItem()}
            onSelect={() => {}}
            showDropAfter={false}
            showDropBefore={false}
          />
        </I18nProvider>
      </HostApiProvider>,
    );

    expect(await screen.findByText("RW 1.5")).toBeInTheDocument();
    expect(screen.queryByText(/^v1\.5$/i)).toBeNull();
  });

  it("shows an unsupported badge when the enabled mod does not support the current game version", async () => {
    render(
      <HostApiProvider hostApi={createTestHostApi()}>
        <I18nProvider>
          <ModListRowCard
            dragHandle={<span aria-hidden="true" />}
            isDragging={false}
            isSelected={false}
            item={createItem({
              columnId: "active",
              enabled: true,
              hasUnsupportedGameVersion: true,
              dependencyMetadata: {
                packageIdNormalized: "unlimitedhugs.hugslib",
                dependencies: [],
                loadAfter: [],
                loadBefore: [],
                forceLoadAfter: [],
                forceLoadBefore: [],
                incompatibleWith: [],
                supportedVersions: ["1.4"],
              },
            })}
            onSelect={() => {}}
            showDropAfter={false}
            showDropBefore={false}
          />
        </I18nProvider>
      </HostApiProvider>,
    );

    expect(await screen.findByText("Unsupported")).toBeInTheDocument();
    expect(screen.getByText("version mismatch")).toBeInTheDocument();
  });
});
