import { useModLibraryQuery } from "@/features/mod-library/hooks/useModLibraryQuery";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import {
  AlertTriangle,
  FolderSearch,
  HardDrive,
  Package,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

function formatPathValue(path: string | null) {
  return path ?? "Not available";
}

function renderDescriptionBlocks(description: string | null) {
  if (!description) {
    return (
      <p className="text-sm text-muted-foreground">
        No description was found in About.xml.
      </p>
    );
  }

  return description
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));

      if (lines.length > 0 && bulletLines.length === lines.length) {
        return (
          <ul
            key={`${index}:${block.slice(0, 16)}`}
            className="list-disc space-y-1 pl-5 text-sm leading-relaxed"
          >
            {lines.map((line) => (
              <li key={line}>{line.replace(/^[-*]\s+/, "")}</li>
            ))}
          </ul>
        );
      }

      return (
        <p
          key={`${index}:${block.slice(0, 16)}`}
          className="text-sm leading-relaxed text-foreground/90"
        >
          {lines.join(" ")}
        </p>
      );
    });
}

export function HomePage() {
  const modLibraryQuery = useModLibraryQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const mods = modLibraryQuery.data?.mods ?? [];
  const term = searchQuery.trim().toLowerCase();
  const filteredMods = mods.filter((mod) => {
    if (!term) {
      return true;
    }

    return [mod.name, mod.packageId ?? "", mod.author ?? ""].some((field) =>
      field.toLowerCase().includes(term),
    );
  });
  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const selectedMod =
    filteredMods.find((mod) => mod.id === selectedModId) ?? filteredMods[0] ?? null;

  if (modLibraryQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center bg-background/40">
        <p className="font-black uppercase tracking-widest text-primary rw-text animate-pulse">
          Scanning Mod Library...
        </p>
      </div>
    );
  }

  if (modLibraryQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-xl border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Failed To Load Mod Library
            </CardTitle>
            <CardDescription>
              The desktop backend did not return a mod scan result.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const modLibrary = modLibraryQuery.data;

  if (modLibrary.requiresConfiguration) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-2xl border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <HardDrive className="h-6 w-6 text-primary" />
              Mod Library Needs Configuration
            </CardTitle>
            <CardDescription>
              A RimWorld installation path must be saved before the backend can
              scan local or workshop mods.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modLibrary.errors.length ? (
              <div className="space-y-3">
                {modLibrary.errors.map((error) => (
                  <div
                    key={`${error.code}:${error.message}`}
                    className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
                  >
                    <p className="text-sm font-bold text-destructive">
                      {error.message}
                    </p>
                    {error.detail ? (
                      <p className="mt-1 text-sm text-destructive/80">
                        {error.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <Link to="/settings">
              <Button className="gap-2">
                <FolderSearch className="h-4 w-4" />
                Open Core Config
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-background/20">
      <section className="flex w-[56%] min-w-0 flex-col border-r border-border/60">
        <div className="border-b border-border/40 bg-card/10 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Backend Mod Scan
              </p>
              <h2 className="text-3xl font-black uppercase tracking-tight rw-text">
                Mod Library
              </h2>
              <p className="text-sm font-medium text-muted-foreground">
                {modLibrary.mods.length} mods loaded from configured installation
                and workshop roots.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter Mods..."
                className="w-72 pl-10 font-bold"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center px-6 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          <div className="flex-1">Mod</div>
          <div className="w-28 text-center">Source</div>
          <div className="w-24 text-right">Version</div>
        </div>

        <div className="flex-1 overflow-y-auto border-y border-border/30">
          {filteredMods.length ? (
            filteredMods.map((mod) => {
              const isSelected = selectedMod?.id === mod.id;

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setSelectedModId(mod.id)}
                  className={cn(
                    "flex w-full items-center border-b border-border/20 px-6 py-4 text-left transition-colors",
                    isSelected
                      ? "bg-accent/40"
                      : "hover:bg-muted/30",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold">
                        {mod.name}
                      </span>
                      <Badge variant={mod.enabled ? "default" : "outline"}>
                        {mod.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {mod.isOfficial ? (
                        <Badge variant="secondary">Official</Badge>
                      ) : null}
                      {!mod.hasAboutXml ? (
                        <Badge variant="destructive">Missing About.xml</Badge>
                      ) : null}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {mod.packageId ?? mod.windowsPath}
                    </p>
                  </div>
                  <div className="w-28 text-center">
                    <Badge variant="outline" className="uppercase">
                      {mod.source}
                    </Badge>
                  </div>
                  <div className="w-24 text-right text-xs font-bold text-muted-foreground">
                    {mod.version ?? "Unknown"}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center">
              <div className="space-y-3">
                <Package className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="text-lg font-black uppercase tracking-[0.2em] rw-text">
                  No Matching Mods
                </p>
                <p className="text-sm text-muted-foreground">
                  Adjust the filter or rescan after changing paths.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between border-t border-border/40 bg-card/10 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          <span>Scanned At: {new Date(modLibrary.scannedAt).toLocaleString()}</span>
          <span>{filteredMods.length} Visible</span>
        </div>
      </section>

      <aside className="flex w-[44%] min-w-0 flex-col bg-card/10">
        {selectedMod ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-border/40 bg-background/30 p-8">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <h3 className="text-3xl font-black uppercase tracking-wide rw-text leading-tight">
                    {selectedMod.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={selectedMod.enabled ? "default" : "outline"}>
                      {selectedMod.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="outline" className="uppercase">
                      {selectedMod.source}
                    </Badge>
                    {selectedMod.isOfficial ? (
                      <Badge variant="secondary">Official</Badge>
                    ) : null}
                    {!selectedMod.hasAboutXml ? (
                      <Badge variant="destructive">Metadata Missing</Badge>
                    ) : null}
                  </div>
                </div>
                {selectedMod.isOfficial ? (
                  <ShieldCheck className="h-8 w-8 text-primary" />
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-background/30">
                  <CardContent className="p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Package ID
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {selectedMod.packageId ?? "Not available"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-background/30">
                  <CardContent className="p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Author / Version
                    </p>
                    <p className="mt-2 text-sm font-bold">
                      {selectedMod.author ?? "Unknown author"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version: {selectedMod.version ?? "Unknown"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-8">
              <section className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Description
                </p>
                <div className="space-y-3 rounded-lg border border-border/60 bg-background/60 p-4">
                  {renderDescriptionBlocks(selectedMod.description)}
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Mod Path
                </p>
                <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                  <p className="break-all font-mono text-xs">
                    {selectedMod.windowsPath}
                  </p>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  About.xml
                </p>
                <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-sm">
                  <p>
                    Manifest path: {formatPathValue(selectedMod.manifestPath)}
                  </p>
                  <p className="mt-2">
                    WSL path: {formatPathValue(selectedMod.wslPath)}
                  </p>
                </div>
              </section>

              {selectedMod.notes.length ? (
                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Notes
                  </p>
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                      {selectedMod.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              ) : null}

              {modLibrary.errors.length ? (
                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Scan Warnings
                  </p>
                  <div className="space-y-3">
                    {modLibrary.errors.map((error) => (
                      <div
                        key={`${error.code}:${error.message}`}
                        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
                      >
                        <p className="text-sm font-bold text-destructive">
                          {error.message}
                        </p>
                        {error.detail ? (
                          <p className="mt-1 text-sm text-destructive/80">
                            {error.detail}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-12 text-center">
            <div className="space-y-3">
              <Package className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-lg font-black uppercase tracking-[0.2em] rw-text">
                No Mod Selected
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
