"use client";

import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Node,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import { ExtendedSystem, SuperglueClient, serializeIcon } from "@superglue/shared";
import { DiscoveredSystemNode } from "./DiscoveredSystemNode";
import { useToast } from "@/src/hooks/use-toast";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Button } from "@/src/components/ui/button";
import { Package, X, Loader2, CheckSquare, Square, Wrench, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

const nodeTypes = {
  discoveredSystem: DiscoveredSystemNode,
};

// Simple grid layout - no edges, so no need for dagre
const getGridLayout = (systems: ExtendedSystem[]): Node[] => {
  const gridCols = 4;
  const nodeWidth = 240;
  const nodeHeight = 200;
  const horizontalSpacing = 380;
  const verticalSpacing = 350;

  return systems.map((system, index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);

    return {
      id: `system-${system.id || index}`,
      type: "discoveredSystem",
      position: {
        x: col * horizontalSpacing + 50,
        y: row * verticalSpacing + 50,
      },
      data: {
        system,
        label: system.name || system.id || `System ${index + 1}`,
        isExpanded: false,
        isAdding: false,
        isAlreadyAdded: false,
        isJustAdded: false,
        isMatched: false,
        isMerging: false,
        isMerged: false,
        onClick: () => {},
        onClose: () => {},
        onAddSystem: () => {},
        onMergeSystem: () => {},
      },
      width: nodeWidth,
      height: nodeHeight,
    };
  });
};

interface DiscoverySystemsLandscapeImplProps {
  systems: ExtendedSystem[];
}

function DiscoverySystemsLandscapeImpl({ systems }: DiscoverySystemsLandscapeImplProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [selectedSystem, setSelectedSystem] = useState<ExtendedSystem | null>(null);
  const [existingSystemIds, setExistingSystemIds] = useState<Set<string>>(new Set());
  const [justAddedSystemIds, setJustAddedSystemIds] = useState<Set<string>>(new Set());
  const [addingSystemId, setAddingSystemId] = useState<string | null>(null);
  const [mergingSystemId, setMergingSystemId] = useState<string | null>(null);
  const [mergedSystemIds, setMergedSystemIds] = useState<Set<string>>(new Set());

  // Selection mode state for bulk import and work with
  const [selectionModeType, setSelectionModeType] = useState<"import" | "workWith" | null>(null);
  const [selectedSystemIds, setSelectedSystemIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentName: "" });

  // Derived state for backward compatibility
  const isSelectionMode = selectionModeType !== null;

  const { fitView, setCenter, getZoom, getNode } = useReactFlow();
  const { toast } = useToast();
  const config = useConfig();
  const router = useRouter();

  // Fetch existing systems on mount
  useEffect(() => {
    const fetchExistingSystems = async () => {
      try {
        const client = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken() || "",
          apiEndpoint: config.apiEndpoint,
        });
        // Fetch with high limit to get all systems
        const result = await client.listSystems(1000);
        const ids = new Set(result.items.map((i) => i.id).filter((id): id is string => !!id));
        setExistingSystemIds(ids);
      } catch (error) {
        console.error("Failed to fetch existing systems:", error);
      }
    };
    fetchExistingSystems();
  }, [config.superglueEndpoint]);

  const handleAddSystem = useCallback(
    async (system: ExtendedSystem) => {
      // Immediate visual feedback
      setAddingSystemId(system.id);

      try {
        const client = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken() || "",
          apiEndpoint: config.apiEndpoint,
        });

        // Build documentation from discovery data
        const documentation = [
          system.systemDetails,
          system.evidence && `Evidence: ${system.evidence}`,
          system.capabilities?.length &&
            `Capabilities:\n${system.capabilities.map((c) => `- ${c}`).join("\n")}`,
          system.potentialConnections?.length &&
            `Potential Connections:\n${system.potentialConnections.map((c) => `- ${c}`).join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        // Build metadata to preserve discovery information
        const metadata: Record<string, any> = {};
        if (system.capabilities?.length) metadata.capabilities = system.capabilities;
        if (system.evidence) metadata.evidence = system.evidence;
        if (system.systemDetails) metadata.systemDetails = system.systemDetails;
        if (system.sources?.length) metadata.sources = system.sources;
        if (system.potentialConnections?.length)
          metadata.potentialConnections = system.potentialConnections;

        await client.createSystem({
          name: system.name || system.id,
          url: system.url || "",
          icon: serializeIcon(system.icon) || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });

        // Mark as added (and track that it was just added in this session)
        setExistingSystemIds((prev) => new Set([...prev, system.id]));
        setJustAddedSystemIds((prev) => new Set([...prev, system.id]));

        toast({
          title: "System Created",
          description: (
            <div className="space-y-2">
              <p>
                <strong>{system.name || system.id}</strong> has been added to your systems.
              </p>
              <p className="text-sm text-muted-foreground">
                Documentation has been pre-filled with system knowledge from discovery. Go to the
                system to configure authentication.
              </p>
            </div>
          ),
          duration: 8000,
        });
      } catch (error) {
        toast({
          title: "Failed to create system",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      } finally {
        setAddingSystemId(null);
      }
    },
    [config.superglueEndpoint, toast],
  );

  const handleMergeSystem = useCallback(
    async (system: ExtendedSystem) => {
      if (!system.matchedSystemId) return;

      // Immediate visual feedback
      setMergingSystemId(system.id);

      try {
        const client = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken() || "",
          apiEndpoint: config.apiEndpoint,
        });

        // Fetch the existing system
        const existingSystem = await client.getSystem(system.matchedSystemId);
        if (!existingSystem) {
          throw new Error(`System ${system.matchedSystemId} not found`);
        }

        // Build discovery knowledge to append
        const discoveryKnowledge = [
          "\n\n--- Discovery Knowledge ---",
          system.systemDetails && `System Details:\n${system.systemDetails}`,
          system.evidence && `Evidence:\n${system.evidence}`,
          system.capabilities?.length &&
            `Capabilities:\n${system.capabilities.map((c) => `- ${c}`).join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        // Append to specificInstructions
        const updatedSpecificInstructions = existingSystem.specificInstructions
          ? `${existingSystem.specificInstructions}${discoveryKnowledge}`
          : discoveryKnowledge.replace(
              "\n\n--- Discovery Knowledge ---\n\n",
              "--- Discovery Knowledge ---\n\n",
            );

        await client.updateSystem(system.matchedSystemId!, {
          specificInstructions: updatedSpecificInstructions,
        });

        // Mark as merged
        setMergedSystemIds((prev) => new Set([...prev, system.id]));

        toast({
          title: "System Merged",
          description: (
            <div className="space-y-2">
              <p>
                Discovery data has been merged into{" "}
                <strong>{existingSystem.name || system.matchedSystemId}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                System knowledge has been added to the system's specific instructions.
              </p>
            </div>
          ),
          duration: 8000,
        });
      } catch (error) {
        toast({
          title: "Failed to merge system",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      } finally {
        setMergingSystemId(null);
      }
    },
    [config.superglueEndpoint, toast],
  );

  const handleNodeClick = useCallback(
    (system: ExtendedSystem) => {
      // Don't expand nodes in selection mode
      if (isSelectionMode) return;
      setSelectedSystem(system);
    },
    [isSelectionMode],
  );

  const handleNodeClose = useCallback(() => {
    setSelectedSystem(null);
  }, []);

  // Selection mode handlers
  const handleEnterSelectionMode = useCallback(() => {
    // Pre-select all systems that are importable (not already added, not matched)
    const importableIds = new Set(
      systems.filter((s) => !existingSystemIds.has(s.id) && !s.matchedSystemId).map((s) => s.id),
    );
    setSelectedSystemIds(importableIds);
    setSelectedSystem(null); // Close any expanded node
    setSelectionModeType("import");
  }, [systems, existingSystemIds]);

  const handleEnterWorkWithMode = useCallback(() => {
    // Start with empty selection for workWith mode
    setSelectedSystemIds(new Set());
    setSelectedSystem(null); // Close any expanded node
    setSelectionModeType("workWith");
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setSelectionModeType(null);
    setSelectedSystemIds(new Set());
    setImportProgress({ current: 0, total: 0, currentName: "" });
  }, []);

  const WORK_WITH_MAX_SELECTION = 4;

  const handleToggleSelect = useCallback(
    (systemId: string) => {
      setSelectedSystemIds((prev) => {
        const next = new Set(prev);
        if (next.has(systemId)) {
          next.delete(systemId);
        } else {
          // Enforce max 4 limit in workWith mode
          if (selectionModeType === "workWith" && next.size >= WORK_WITH_MAX_SELECTION) {
            return prev; // Don't add if at limit
          }
          next.add(systemId);
        }
        return next;
      });
    },
    [selectionModeType],
  );

  const handleSelectAll = useCallback(() => {
    const importableIds = new Set(
      systems.filter((s) => !existingSystemIds.has(s.id) && !s.matchedSystemId).map((s) => s.id),
    );
    setSelectedSystemIds(importableIds);
  }, [systems, existingSystemIds]);

  const handleDeselectAll = useCallback(() => {
    setSelectedSystemIds(new Set());
  }, []);

  // Bulk import handler - sequential to avoid rate limits
  const handleBulkImport = useCallback(async () => {
    const systemsToImport = systems.filter((s) => selectedSystemIds.has(s.id));
    if (systemsToImport.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: systemsToImport.length, currentName: "" });

    const client = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken() || "",
      apiEndpoint: config.apiEndpoint,
    });

    let successCount = 0;
    const failures: { name: string; error: string }[] = [];

    for (let i = 0; i < systemsToImport.length; i++) {
      const system = systemsToImport[i];
      setImportProgress({
        current: i + 1,
        total: systemsToImport.length,
        currentName: system.name || system.id,
      });

      try {
        // Build documentation from discovery data
        const documentation = [
          system.systemDetails,
          system.evidence && `Evidence: ${system.evidence}`,
          system.capabilities?.length &&
            `Capabilities:\n${system.capabilities.map((c) => `- ${c}`).join("\n")}`,
          system.potentialConnections?.length &&
            `Potential Connections:\n${system.potentialConnections.map((c) => `- ${c}`).join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        // Build metadata to preserve discovery information
        const metadata: Record<string, any> = {};
        if (system.capabilities?.length) metadata.capabilities = system.capabilities;
        if (system.evidence) metadata.evidence = system.evidence;
        if (system.systemDetails) metadata.systemDetails = system.systemDetails;
        if (system.sources?.length) metadata.sources = system.sources;
        if (system.potentialConnections?.length)
          metadata.potentialConnections = system.potentialConnections;

        await client.createSystem({
          name: system.name || system.id,
          url: system.url || "",
          icon: serializeIcon(system.icon) || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });

        successCount++;
        setExistingSystemIds((prev) => new Set([...prev, system.id]));
        setJustAddedSystemIds((prev) => new Set([...prev, system.id]));
      } catch (error) {
        failures.push({
          name: system.name || system.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    setIsImporting(false);
    handleExitSelectionMode();

    // Show summary toast
    if (failures.length === 0) {
      toast({
        title: `${successCount} System${successCount !== 1 ? "s" : ""} Created`,
        description: (
          <div className="space-y-2">
            <p>All selected systems have been added to your systems.</p>
            <p className="text-sm text-muted-foreground">
              Documentation has been pre-filled with system knowledge from discovery.
            </p>
          </div>
        ),
        duration: 6000,
      });
    } else {
      toast({
        title: `Imported ${successCount} of ${systemsToImport.length} systems`,
        description: (
          <div className="space-y-2">
            <p>{failures.length} failed to import:</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {failures.slice(0, 3).map((f, i) => (
                <li key={i}>{f.name}</li>
              ))}
              {failures.length > 3 && <li>...and {failures.length - 3} more</li>}
            </ul>
          </div>
        ),
        variant: failures.length === systemsToImport.length ? "destructive" : "default",
        duration: 8000,
      });
    }
  }, [systems, selectedSystemIds, config.superglueEndpoint, toast, handleExitSelectionMode]);

  // Handler for "Continue with Agent" button
  const handleContinueWithAgent = useCallback(() => {
    const addedIds = systems.filter((s) => justAddedSystemIds.has(s.id)).map((s) => s.id);

    // Navigate to dedicated discovery agent route with system IDs in URL
    const params = new URLSearchParams();
    params.set("ids", addedIds.join(","));
    router.push(`/agent/discovery?${params.toString()}`);
  }, [justAddedSystemIds, systems, router]);

  // Initialize nodes from systems
  useEffect(() => {
    if (systems.length === 0) {
      setNodes([]);
      return;
    }

    const layoutedNodes = getGridLayout(systems);

    // Update nodes with current interaction handlers
    const nodesWithHandlers = layoutedNodes.map((node) => {
      const systemId = node.data.system.id;
      const system = node.data.system;
      const isExpanded = selectedSystem?.id === systemId;
      const isAdding = addingSystemId === systemId;
      const isAlreadyAdded = existingSystemIds.has(systemId);
      const isJustAdded = justAddedSystemIds.has(systemId);
      const isMatched = !!system.matchedSystemId;
      const isMerging = mergingSystemId === systemId;
      const isMerged = mergedSystemIds.has(systemId);
      const isSelected = selectedSystemIds.has(systemId);
      const isCurrentlyImporting =
        isImporting &&
        importProgress.current > 0 &&
        systems
          .slice(0, importProgress.current)
          .some((s) => s.id === systemId && selectedSystemIds.has(s.id));

      return {
        ...node,
        data: {
          ...node.data,
          isExpanded,
          isAdding,
          isAlreadyAdded,
          isJustAdded,
          isMatched,
          isMerging,
          isMerged,
          isSelectionMode,
          selectionModeType,
          isSelected,
          isCurrentlyImporting,
          onClick: () => handleNodeClick(node.data.system),
          onClose: handleNodeClose,
          onAddSystem: handleAddSystem,
          onMergeSystem: handleMergeSystem,
          onToggleSelect: handleToggleSelect,
        },
        zIndex: isExpanded ? 9999 : 1,
      };
    });

    setNodes(nodesWithHandlers);
  }, [
    systems,
    selectedSystem,
    addingSystemId,
    existingSystemIds,
    justAddedSystemIds,
    mergingSystemId,
    mergedSystemIds,
    isSelectionMode,
    selectionModeType,
    selectedSystemIds,
    isImporting,
    importProgress,
    handleNodeClick,
    handleNodeClose,
    handleAddSystem,
    handleMergeSystem,
    handleToggleSelect,
    setNodes,
  ]);

  // Fit view when nodes are first loaded
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 50);
    }
  }, [nodes.length, fitView]);

  if (systems.length === 0) {
    return (
      <div className="w-full h-full border rounded-lg flex items-center justify-center bg-muted/20">
        <p className="text-muted-foreground">No systems discovered</p>
      </div>
    );
  }

  // Count importable systems (not already added, not matched)
  const importableCount = systems.filter(
    (s) => !existingSystemIds.has(s.id) && !s.matchedSystemId,
  ).length;

  // Count already-added systems (available for "work with")
  const addedCount = systems.filter((s) => existingSystemIds.has(s.id)).length;

  // Handler for "Continue to Agent" from workWith mode
  const handleContinueWithWorkWith = useCallback(() => {
    const selectedIds = systems.filter((s) => selectedSystemIds.has(s.id)).map((s) => s.id);
    const params = new URLSearchParams();
    params.set("ids", selectedIds.join(","));
    router.push(`/agent/discovery?${params.toString()}`);
  }, [selectedSystemIds, systems, router]);

  // Get contextual hint text for workWith mode
  const getWorkWithHint = () => {
    const count = selectedSystemIds.size;
    if (count === 0) return "Select systems to work with";
    if (count === 1) return "Setup and test this integration";
    return "Build tools with these systems";
  };

  return (
    <div className="w-full h-full min-h-[500px] border rounded-lg bg-background relative">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        panOnScroll={false}
        panOnDrag={true}
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background />
        <Controls showInteractive={false} />

        {/* Floating Action Buttons - Top Right */}
        {!isSelectionMode && (importableCount > 0 || addedCount > 0) && (
          <Panel position="top-right" className="m-2">
            <div className="flex gap-2">
              {addedCount > 0 && (
                <Button
                  onClick={handleEnterWorkWithMode}
                  variant="outline"
                  className="shadow-lg gap-2 transition-all duration-200 hover:scale-105"
                >
                  <Wrench className="h-4 w-4" />
                  Work with Systems
                </Button>
              )}
              {importableCount > 0 && (
                <Button
                  onClick={handleEnterSelectionMode}
                  className="bg-[#FFA500] hover:bg-[#FF8C00] text-white shadow-lg gap-2 transition-all duration-200 hover:scale-105"
                >
                  <Package className="h-4 w-4" />
                  Import Systems
                </Button>
              )}
            </div>
          </Panel>
        )}

        {/* Continue with Agent - Shows after importing systems */}
        {!isSelectionMode && justAddedSystemIds.size > 0 && (
          <Panel position="bottom-center" className="m-4">
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl px-6 py-4 flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {justAddedSystemIds.size} system
                  {justAddedSystemIds.size !== 1 ? "s" : ""} added
                </p>
                <p className="text-xs text-muted-foreground">
                  Continue with the agent to explore capabilities and build your first tool
                </p>
              </div>
              <Button
                onClick={handleContinueWithAgent}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg gap-2 transition-all duration-200 hover:scale-105"
              >
                Continue with Agent
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Panel>
        )}

        {/* Selection Mode Toolbar - Top Center */}
        {isSelectionMode && (
          <Panel position="top-center" className="m-2">
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl px-4 py-3 flex items-center gap-4 animate-in slide-in-from-top-2 duration-200">
              {selectionModeType === "import" ? (
                // Import mode toolbar
                isImporting ? (
                  // Import progress view
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#FFA500]" />
                      <span className="text-sm font-medium">
                        Importing {importProgress.current} of {importProgress.total}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {importProgress.currentName}
                    </div>
                  </>
                ) : (
                  // Selection controls view
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {selectedSystemIds.size} of {importableCount} selected
                      </span>
                    </div>

                    {/* Select/Deselect all buttons */}
                    <div className="flex items-center gap-1 border-l border-border pl-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                        className="h-7 px-2 text-xs"
                        disabled={selectedSystemIds.size === importableCount}
                      >
                        <CheckSquare className="h-3 w-3 mr-1" />
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeselectAll}
                        className="h-7 px-2 text-xs"
                        disabled={selectedSystemIds.size === 0}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        None
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 border-l border-border pl-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleExitSelectionMode}
                        className="h-8"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleBulkImport}
                        disabled={selectedSystemIds.size === 0}
                        className="bg-[#FFA500] hover:bg-[#FF8C00] text-white h-8"
                      >
                        Import {selectedSystemIds.size} System
                        {selectedSystemIds.size !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  </>
                )
              ) : // WorkWith mode toolbar
              addedCount === 0 ? (
                // No systems available message
                <>
                  <span className="text-sm text-muted-foreground">
                    Import systems first to work with them
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExitSelectionMode}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                // WorkWith selection controls
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{selectedSystemIds.size} selected</span>
                    {selectedSystemIds.size >= WORK_WITH_MAX_SELECTION && (
                      <span className="text-xs text-muted-foreground">
                        (max {WORK_WITH_MAX_SELECTION})
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground border-l border-border pl-3">
                    {getWorkWithHint()}
                  </div>

                  <div className="flex items-center gap-2 border-l border-border pl-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExitSelectionMode}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleContinueWithWorkWith}
                      disabled={selectedSystemIds.size === 0}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 gap-2"
                    >
                      Continue to Agent
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

interface DiscoverySystemsLandscapeProps {
  systems: ExtendedSystem[];
}

export function DiscoverySystemsLandscape({ systems }: DiscoverySystemsLandscapeProps) {
  return (
    <ReactFlowProvider>
      <DiscoverySystemsLandscapeImpl systems={systems} />
    </ReactFlowProvider>
  );
}
