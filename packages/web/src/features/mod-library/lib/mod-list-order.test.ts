import {
  applyDropToDraftModOrder,
  buildDefaultInactivePackageIds,
  reconcileInactivePackageIds,
} from "@/features/mod-library/lib/mod-list-order";
import { describe, expect, it } from "vitest";

function mod(packageIdNormalized: string | null) {
  return {
    dependencyMetadata: {
      packageIdNormalized,
    },
  };
}

describe("mod list order helpers", () => {
  it("builds the default inactive order from sortable package ids only", () => {
    expect(
      buildDefaultInactivePackageIds({
        activePackageIds: ["core"],
        duplicatePackageIds: new Set(["dup"]),
        mods: [
          mod("core"),
          mod("hugslib"),
          mod("dup"),
          mod(null),
          mod("pawns"),
        ],
      }),
    ).toEqual(["hugslib", "pawns"]);
  });

  it("reconciles inactive order while preserving current session ordering", () => {
    expect(
      reconcileInactivePackageIds(["pawns", "hugslib"], {
        activePackageIds: ["core"],
        duplicatePackageIds: new Set<string>(),
        mods: [mod("core"), mod("hugslib"), mod("pawns"), mod("alpha")],
      }),
    ).toEqual(["pawns", "hugslib", "alpha"]);
  });

  it("reorders inside the active column using the visible anchor item", () => {
    expect(
      applyDropToDraftModOrder(
        {
          activePackageIds: ["core", "hugslib", "pawns"],
          inactivePackageIds: ["alpha", "beta"],
        },
        {
          packageId: "core",
          placement: "after",
          sourceColumn: "active",
          targetColumn: "active",
          targetPackageId: "pawns",
        },
      ),
    ).toEqual({
      activePackageIds: ["hugslib", "pawns", "core"],
      inactivePackageIds: ["alpha", "beta"],
    });
  });

  it("moves a mod from inactive to active at the requested anchor", () => {
    expect(
      applyDropToDraftModOrder(
        {
          activePackageIds: ["core", "hugslib"],
          inactivePackageIds: ["alpha", "pawns", "beta"],
        },
        {
          packageId: "pawns",
          placement: "before",
          sourceColumn: "inactive",
          targetColumn: "active",
          targetPackageId: "hugslib",
        },
      ),
    ).toEqual({
      activePackageIds: ["core", "pawns", "hugslib"],
      inactivePackageIds: ["alpha", "beta"],
    });
  });

  it("moves a mod from active back to inactive and appends on column drop", () => {
    expect(
      applyDropToDraftModOrder(
        {
          activePackageIds: ["core", "hugslib", "pawns"],
          inactivePackageIds: ["alpha", "beta"],
        },
        {
          packageId: "hugslib",
          placement: "end",
          sourceColumn: "active",
          targetColumn: "inactive",
          targetPackageId: null,
        },
      ),
    ).toEqual({
      activePackageIds: ["core", "pawns"],
      inactivePackageIds: ["alpha", "beta", "hugslib"],
    });
  });
});
