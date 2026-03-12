import { useBootstrapQuery } from "@/features/bootstrap/hooks/useBootstrapQuery";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Play, ArrowUp, ArrowDown, Search, FolderOpen, AlertTriangle, User, Hash } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";

const MOCK_MODS = [
  { id: "core", name: "Core", author: "Ludeon Studios", version: "1.5.4062", enabled: true, isCore: true, hasErrors: false },
  { id: "royalty", name: "Royalty", author: "Ludeon Studios", version: "1.5.4062", enabled: true, isCore: true, hasErrors: false },
  { id: "ideology", name: "Ideology", author: "Ludeon Studios", version: "1.5.4062", enabled: true, isCore: true, hasErrors: false },
  { id: "biotech", name: "Biotech", author: "Ludeon Studios", version: "1.5.4062", enabled: true, isCore: true, hasErrors: false },
  { id: "anomaly", name: "Anomaly", author: "Ludeon Studios", version: "1.5.4062", enabled: true, isCore: true, hasErrors: false },
  { id: "hugslib", name: "HugsLib", author: "UnlimitedHugs", version: "11.0.0", enabled: true, isCore: false, hasErrors: false },
  { id: "harmony", name: "Harmony", author: "pardeike", version: "2.3.1", enabled: true, isCore: false, hasErrors: false },
  { id: "rimhud", name: "RimHUD", author: "Jaxe", version: "1.15.1", enabled: false, isCore: false, hasErrors: false },
  { id: "dubs", name: "Dubs Mint Menus", author: "Dubwise", version: "1.5.0", enabled: true, isCore: false, hasErrors: false },
  { id: "broken", name: "Broken Mod Example", author: "Unknown", version: "0.0.1", enabled: true, isCore: false, hasErrors: true, errorMsg: "Missing dependency: HugsLib" },
];

export function HomePage() {
  const bootstrapQuery = useBootstrapQuery();
  const [selectedModId, setSelectedModId] = useState<string | null>("core");
  const [searchQuery, setSearchQuery] = useState("");

  const selectedMod = MOCK_MODS.find(m => m.id === selectedModId);

  if (bootstrapQuery.isPending) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-primary animate-pulse font-medium">Initializing Mod Database...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-background">
      {/* Mod List Section */}
      <section className="w-[55%] flex flex-col border-r border-border">
        {/* Top Header/Toolbar */}
        <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="default" size="sm">
              <Play className="w-4 h-4 mr-2" />
              Launch
            </Button>
            <Button variant="outline" size="sm">
              <FolderOpen className="w-4 h-4 mr-2" />
              Folder
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Filter Library..." 
              className="pl-10 w-64 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* List Table */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center px-6 py-2 bg-muted text-xs font-semibold text-muted-foreground border-b border-border">
            <div className="w-12 text-center">On</div>
            <div className="flex-1 px-4">Mod Name</div>
            <div className="w-24 text-center">Version</div>
            <div className="w-24 text-right">Order</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {MOCK_MODS.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map((mod) => (
              <div 
                key={mod.id}
                onClick={() => setSelectedModId(mod.id)}
                className={cn(
                  "flex items-center px-6 py-3 border-b border-border cursor-pointer transition-colors",
                  selectedModId === mod.id ? "bg-accent" : "hover:bg-muted/50"
                )}
              >
                <div className="w-12 flex justify-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={mod.enabled} />
                </div>
                <div className="flex-1 px-4 flex items-center gap-3 overflow-hidden">
                  <span className={cn(
                    "font-medium text-sm truncate",
                    mod.hasErrors ? "text-destructive" : "text-foreground"
                  )}>
                    {mod.name}
                  </span>
                  {mod.isCore && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Core</Badge>}
                </div>
                <div className="w-24 text-center text-xs text-muted-foreground">{mod.version}</div>
                <div className="w-24 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                   <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowUp className="w-4 h-4" /></Button>
                   <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowDown className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Footer Stats */}
        <div className="px-6 py-3 border-t border-border bg-card text-xs text-muted-foreground flex justify-between">
          <span>{MOCK_MODS.length} mods found</span>
          <span>{MOCK_MODS.filter(m => m.enabled).length} enabled</span>
        </div>
      </section>

      {/* Inspection Aside */}
      <aside className="w-[45%] flex flex-col bg-card overflow-hidden">
        {selectedMod ? (
          <div className="flex flex-col h-full overflow-y-auto">
            <div className="p-8 border-b border-border">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-3xl font-bold tracking-tight">{selectedMod.name}</h2>
                {selectedMod.hasErrors && <AlertTriangle className="w-8 h-8 text-destructive" />}
              </div>
              
              <div className="flex flex-wrap gap-4 mb-8">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  {selectedMod.author}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="w-4 h-4" />
                  v{selectedMod.version}
                </div>
              </div>
              
              <div className="flex gap-4">
                <Button variant={selectedMod.enabled ? "secondary" : "default"} className="flex-1">
                  {selectedMod.enabled ? "Disable Mod" : "Enable Mod"}
                </Button>
                <Button variant="outline">Browse Files</Button>
              </div>
            </div>

            <div className="p-8 space-y-8">
              {selectedMod.hasErrors && (
                <Card className="border-destructive bg-destructive/10">
                   <CardHeader className="p-4 pb-2">
                     <CardTitle className="text-sm text-destructive flex items-center gap-2">
                       <AlertTriangle className="w-4 h-4" />
                       Conflict Detected
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="p-4 pt-0">
                     <p className="text-sm">{selectedMod.errorMsg}</p>
                   </CardContent>
                </Card>
              )}

              <section>
                <h3 className="text-sm font-semibold mb-3">Description</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This simulated entry for {selectedMod.name} represents the metadata parsed from About.xml. In a fully initialized system, this viewport would render formatted content, including dependency chains and load order requirements.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">System Metadata</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-[10px] text-muted-foreground uppercase">Package Identifier</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs font-mono truncate">{selectedMod.author.toLowerCase()}.{selectedMod.id}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-[10px] text-muted-foreground uppercase">Load Context</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs font-mono">Workshop-294100</p>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-center text-muted-foreground">
            <div>
              <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">No Mod Selected</p>
              <p className="text-sm">Select a mod from the list to view its details</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
