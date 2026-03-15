import { AppProviders } from "@/app/AppProviders";
import { createTestHostApi } from "@/shared/testing/createTestHostApi";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { useHomePageController } from "./useHomePageController";

describe("useHomePageController", () => {
  it("preserves active search and source filters when switching profiles", async () => {
    const hostApi = createTestHostApi();
    const wrapper = ({ children }: PropsWithChildren) => (
      <AppProviders hostApi={hostApi}>{children}</AppProviders>
    );
    const { result } = renderHook(() => useHomePageController(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentProfileId).toBe("default");
      expect(result.current.visibleActiveMods.map((mod) => mod.name)).toEqual([
        "Core",
        "HugsLib",
      ]);
    });

    act(() => {
      result.current.setSearchQuery("e");
      result.current.setSourceFilter("workshop");
    });

    await waitFor(() => {
      expect(result.current.searchQuery).toBe("e");
      expect(result.current.sourceFilter).toBe("workshop");
      expect(result.current.visibleActiveMods.map((mod) => mod.name)).toEqual([
        "HugsLib",
      ]);
      expect(result.current.visibleInactiveMods.map((mod) => mod.name)).toEqual(
        ["Pawns"],
      );
    });

    await act(async () => {
      await result.current.handleProfileSwitch("builder");
    });

    await waitFor(() => {
      expect(result.current.currentProfileId).toBe("builder");
      expect(result.current.searchQuery).toBe("e");
      expect(result.current.sourceFilter).toBe("workshop");
      expect(result.current.visibleActiveMods.map((mod) => mod.name)).toEqual([
        "Pawns",
      ]);
      expect(result.current.visibleInactiveMods.map((mod) => mod.name)).toEqual(
        ["HugsLib"],
      );
    });
  });
});
