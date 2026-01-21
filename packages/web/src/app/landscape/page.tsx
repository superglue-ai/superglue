"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { useSchedules } from "@/src/app/schedules-context";
import { useTools } from "@/src/app/tools-context";
import { SystemForm } from "@/src/components/systems/SystemForm";
import { SystemNode } from "@/src/components/landscape/SystemNode";
import { SearchOverlay } from "@/src/components/landscape/SearchOverlay";
import { ToolNode } from "@/src/components/landscape/ToolNode";
import { Button } from "@/src/components/ui/button";
import demoLandscapeData from "@/src/data/demo-landscape.json";
import { useToast } from "@/src/hooks/use-toast";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { getSimpleIcon } from "@/src/lib/general-utils";
import { System, systemOptions, Tool, UpsertMode } from "@superglue/shared";
import dagre from "dagre";
import { Globe, Hammer, Plus, RotateCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Connection,
  ConnectionLineType,
  Controls,
  Edge,
  Node,
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

// Dagre layout with smart positioning for many nodes
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  // For disconnected nodes (no edges), arrange in a grid
  const connectedNodeIds = new Set<string>();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });

  const connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
  const disconnectedNodes = nodes.filter((n) => !connectedNodeIds.has(n.id));

  // Layout connected nodes with dagre
  let layoutedConnectedNodes: Node[] = [];
  if (connectedNodes.length > 0) {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Better spacing for large graphs
    dagreGraph.setGraph({
      rankdir: "LR",
      ranksep: 200,
      nodesep: 80,
      edgesep: 20,
      ranker: "tight-tree",
    });

    connectedNodes.forEach((node) => {
      // Set node dimensions based on type
      const width = node.type === "tool" ? 120 : 180;
      const height = node.type === "tool" ? 60 : 100;
      dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    layoutedConnectedNodes = connectedNodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || 180) / 2,
          y: nodeWithPosition.y - (node.height || 100) / 2,
        },
      };
    });
  }

  // Arrange disconnected nodes in a grid to the right
  const layoutedDisconnectedNodes: Node[] = [];
  const gridCols = 5;
  const startX =
    connectedNodes.length > 0
      ? Math.max(...layoutedConnectedNodes.map((n) => n.position.x)) + 400
      : 0;

  disconnectedNodes.forEach((node, index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    layoutedDisconnectedNodes.push({
      ...node,
      position: {
        x: startX + col * 220,
        y: row * 150,
      },
    });
  });

  return {
    nodes: [...layoutedConnectedNodes, ...layoutedDisconnectedNodes],
    edges,
  };
};

const nodeTypes = {
  system: SystemNode,
  tool: ToolNode,
};

function Landscape() {
  const config = useConfig();
  const { toast } = useToast();
  const router = useRouter();
  const { systems, refreshSystems, isRefreshing: isRefreshingSystems } = useSystems();
  const { tools: allTools, refreshTools, isInitiallyLoading: toolsLoading } = useTools();
  const tools = useMemo(() => allTools.filter((tool) => !tool.archived), [allTools]);
  const { schedules, refreshSchedules, getSchedulesForTool } = useSchedules();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showSystemForm, setShowSystemForm] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [selectedSystemForDetails, setSelectedSystemForDetails] = useState<System | null>(null);
  const [selectedToolForDetails, setSelectedToolForDetails] = useState<Tool | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const { fitView, setCenter, getZoom, getNode } = useReactFlow();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshSystems(), refreshTools(), refreshSchedules()]);
    setIsRefreshing(false);
  }, [refreshSystems, refreshTools, refreshSchedules]);

  // Handle selecting a node from search - zoom and center on it
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (node) {
        const zoom = getZoom();
        const x = node.position.x + (node.width || 180) / 2;
        const y = node.position.y + (node.height || 100) / 2;
        setCenter(x, y, { zoom: Math.max(zoom, 1), duration: 500 });

        // Also expand the node to show details
        if (nodeId.startsWith("int-")) {
          const systemId = nodeId.replace("int-", "");
          const system = systems.find((i) => i.id === systemId);
          if (system) {
            setSelectedSystemForDetails(system);
          }
        } else if (nodeId.startsWith("tool-")) {
          const toolId = nodeId.replace("tool-", "");
          const tool = tools.find((t) => t.id === toolId);
          if (tool) {
            setSelectedToolForDetails(tool);
          }
        }
      }
    },
    [getNode, getZoom, setCenter, systems, tools],
  );

  // Validate connections - only allow system to system
  const isValidConnection = useCallback((connection: Connection) => {
    const source = connection.source;
    const target = connection.target;

    if (!source || !target) return false;

    // Block any connection involving tools
    return !source.startsWith("tool-") && !target.startsWith("tool-");
  }, []);

  // Handle when user draws a connection between nodes
  const onConnect = useCallback((connection: Connection) => {
    const source = connection.source;
    const target = connection.target;

    if (!source || !target) return;

    // Extract system IDs
    const sourceId = source.replace("int-", "");
    const targetId = target.replace("int-", "");

    // Navigate to tool creation page with pre-selected systems
    if (sourceId === targetId) {
      // Single system
      window.open(`/tools?system=${encodeURIComponent(sourceId)}&skip=systems`, "_blank");
    } else {
      // Multi-system tool
      const systemList = [sourceId, targetId].join(",");
      window.open(`/tools?systems=${encodeURIComponent(systemList)}&skip=systems`, "_blank");
    }
  }, []);

  // Handle saving system from form
  const handleSaveSystem = async (system: System): Promise<System | null> => {
    try {
      const existingSystem = systems.find((i) => i.id === system.id);
      const mode = existingSystem ? UpsertMode.UPDATE : UpsertMode.CREATE;
      const savedSystem = await createSuperglueClient(config.superglueEndpoint).upsertSystem(
        system.id,
        system,
        mode,
      );
      await refreshSystems();
      toast({
        title: "System Saved",
        description: `System ${system.id} saved successfully`,
      });
      setShowSystemForm(false);
      return savedSystem;
    } catch (error) {
      console.error("Error saving system:", error);
      toast({
        title: "Error",
        description: "Failed to save system",
        variant: "destructive",
      });
      return null;
    }
  };

  // Set demo mode when there are no systems
  useEffect(() => {
    if (!toolsLoading) {
      setIsDemoMode(systems.length === 0);
    }
  }, [toolsLoading, systems.length]);

  // Keyboard shortcuts for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K or just `/` to open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === "/" && !showSystemForm) {
        // Only trigger on `/` if not in a form
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          setShowSearch(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSystemForm]);

  // Transform data into ReactFlow format
  useEffect(() => {
    // Use demo data if in demo mode, otherwise use real data
    const activeSystems = isDemoMode ? (demoLandscapeData.systems as any[]) : systems;
    const activeTools = isDemoMode ? (demoLandscapeData.tools as any[]) : tools;

    if (!activeSystems.length || toolsLoading) return;

    const filteredSystems = activeSystems;

    // Get theme colors with accent orange
    const isDark = document.documentElement.classList.contains("dark");
    const edgeColor = "#FFA500"; // accent orange

    // Create nodes for systems
    const systemNodes: Node[] = filteredSystems.map((system) => {
      const isExpanded = !isDemoMode && selectedSystemForDetails?.id === system.id;

      return {
        id: `int-${system.id}`,
        type: "system",
        position: { x: 0, y: 0 },
        data: {
          label: system.id,
          system,
          isExpanded,
          tools: activeTools,
          onClick: isDemoMode ? undefined : () => setSelectedSystemForDetails(system),
          onClose: (e: React.MouseEvent) => {
            e.stopPropagation();
            setSelectedSystemForDetails(null);
          },
          onEdit: () => {
            setEditingSystem(system);
            setSelectedSystemForDetails(null);
            setShowSystemForm(true);
          },
        },
        width: isExpanded ? 320 : 180,
        height: isExpanded ? 300 : 100,
        zIndex: isExpanded ? 9999 : 1,
      };
    });

    // Create nodes for ALL tools
    const toolNodes: Node[] = activeTools.map((tool) => {
      const isExpanded = !isDemoMode && selectedToolForDetails?.id === tool.id;
      const toolSchedules = getSchedulesForTool(tool.id);
      const activeSchedules = toolSchedules.filter((s) => s.enabled).length;

      return {
        id: `tool-${tool.id}`,
        type: "tool",
        position: { x: 0, y: 0 },
        data: {
          label: tool.id,
          tool: isDemoMode ? undefined : tool,
          isExpanded,
          activeSchedules,
          systems: filteredSystems,
          onClick: isDemoMode ? undefined : () => setSelectedToolForDetails(tool),
          onClose: (e: React.MouseEvent) => {
            e.stopPropagation();
            setSelectedToolForDetails(null);
          },
          onSelectSystem: (system: any) => {
            setSelectedToolForDetails(null);
            setSelectedSystemForDetails(system);
          },
        },
        width: isExpanded ? 320 : 120,
        height: isExpanded ? 300 : 60,
        zIndex: isExpanded ? 9999 : 1,
        connectable: false, // Tools are read-only, can't connect to/from them
      };
    });

    // Create edges: systems -> tools -> systems
    const allEdges: Edge[] = [];

    activeTools.forEach((tool) => {
      const toolNodeId = `tool-${tool.id}`;

      // Collect ALL unique systems used by this tool
      const allSystemIds = new Set<string>();

      if (tool.steps && tool.steps.length > 0) {
        tool.steps.forEach((step: any) => {
          if (step.systemId && filteredSystems.find((int) => int.id === step.systemId)) {
            allSystemIds.add(step.systemId);
          }
        });
      }

      if (tool.systemIds && tool.systemIds.length > 0) {
        tool.systemIds.forEach((id) => {
          if (filteredSystems.find((int) => int.id === id)) {
            allSystemIds.add(id);
          }
        });
      }

      const uniqueSystems = Array.from(allSystemIds).map((id) => `int-${id}`);

      // Connect all systems through the tool node
      if (uniqueSystems.length > 0) {
        // First system -> tool
        allEdges.push({
          id: `${tool.id}-in`,
          source: uniqueSystems[0],
          target: toolNodeId,
          sourceHandle: "source-right",
          targetHandle: "target-left",
          type: "default",
          animated: true,
          style: {
            stroke: edgeColor,
            strokeWidth: 2,
            strokeDasharray: "5,5",
          },
        } as Edge);

        // Tool -> all other systems
        for (let i = 1; i < uniqueSystems.length; i++) {
          allEdges.push({
            id: `${tool.id}-out-${i}`,
            source: toolNodeId,
            target: uniqueSystems[i],
            sourceHandle: "source-right",
            targetHandle: "target-left",
            type: "default",
            animated: true,
            style: {
              stroke: edgeColor,
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
          } as Edge);
        }
      }
    });

    // Layout everything together
    const allNodes = [...systemNodes, ...toolNodes];
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(allNodes, allEdges);

    // Sort nodes so expanded ones render last (on top)
    const sortedNodes = [...layoutedNodes].sort((a, b) => {
      const aExpanded = a.data.isExpanded ? 1 : 0;
      const bExpanded = b.data.isExpanded ? 1 : 0;
      return aExpanded - bExpanded;
    });

    setNodes(sortedNodes);
    setEdges(layoutedEdges);
  }, [
    systems,
    tools,
    toolsLoading,
    selectedSystemForDetails,
    selectedToolForDetails,
    setNodes,
    setEdges,
    router,
    isDemoMode,
    getSchedulesForTool,
  ]);

  // Fit view only on initial load
  useEffect(() => {
    if (!toolsLoading && (systems.length > 0 || isDemoMode)) {
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 });
      }, 100);
    }
  }, [toolsLoading, systems.length, fitView, isDemoMode]);

  if (toolsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RotateCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Loading landscape...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {showSystemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-background rounded-xl max-w-2xl w-full p-0">
            <SystemForm
              modal={true}
              system={editingSystem || undefined}
              onSave={handleSaveSystem}
              onCancel={() => {
                setShowSystemForm(false);
                setEditingSystem(null);
              }}
              systemOptions={systemOptions}
              getSimpleIcon={getSimpleIcon}
            />
          </div>
        </div>
      )}

      <SearchOverlay
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        systems={systems}
        tools={tools}
        onSelectItem={handleSelectNode}
      />

      {isDemoMode && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-2xl">
          <div className="bg-card border-2 border-[#FFA500] rounded-lg shadow-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="bg-[#FFA500]/20 p-2 rounded-lg flex-shrink-0">
                <Globe className="h-5 w-5 text-[#FFA500]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground mb-1">Demo Landscape</h3>
                <p className="text-sm text-muted-foreground">
                  Preview with example data. Add systems to see your actual landscape.
                </p>
              </div>
              <Button
                onClick={() => setShowSystemForm(true)}
                size="sm"
                className="bg-[#FFA500] hover:bg-[#FF8C00] text-white flex-shrink-0"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add System
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={isDemoMode ? undefined : onConnect}
          isValidConnection={isDemoMode ? () => false : isValidConnection}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          elementsSelectable={!isDemoMode}
          edgesUpdatable={false}
          edgesFocusable={!isDemoMode}
          nodesDraggable={!isDemoMode}
          nodesConnectable={!isDemoMode}
          connectionLineType={ConnectionLineType.Bezier}
          defaultEdgeOptions={{
            type: "default",
            animated: true,
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls className="space-y-1 !bg-background-muted [&_button]:!border-2 [&_button]:!border-border [&_button]:!rounded-lg !shadow-none [&_button]:!bg-card [&_button]:!w-4 [&_button]:!h-4 [&_button]:!transition-colors [&_svg]:!max-w-3 [&_svg]:!max-h-3 [&_svg]:!fill-muted-foreground" />

          {/* Floating action buttons */}
          <Panel position="top-right" className="m-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSearch(true)}
                className="shadow-lg !bg-background h-9"
              >
                <Search className="h-4 w-4 mr-2" />
                Search
                <kbd className="ml-2 px-1.5 py-0.5 text-xs font-mono bg-background rounded border border-border">
                  /
                </kbd>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSystemForm(true)}
                className="shadow-lg !bg-background h-9"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add System
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={refreshData}
                disabled={isRefreshing || isRefreshingSystems}
                className="shadow-lg !bg-background"
              >
                <RotateCw
                  className={`h-4 w-4 ${isRefreshing || isRefreshingSystems ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </Panel>

          <Panel
            position="bottom-right"
            className="bg-card border border-border rounded-lg p-3 !ml-16 w-32"
          >
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 rounded border border-border bg-card flex-shrink-0 flex items-center justify-center">
                  <Globe className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
                <span>System</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 rounded border border-border bg-card flex-shrink-0 flex items-center justify-center">
                  <Hammer className="h-2.5 w-2.5 text-[#FFA500]" />
                </div>
                <span>Tool</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-4 h-0.5 bg-[#FFA500] flex-shrink-0" />
                <span>Data flow</span>
              </div>
            </div>
          </Panel>
          <Panel
            position="bottom-right"
            className="bg-card border border-border rounded-lg p-3 !mb-28 w-32"
          >
            <div className="text-xs space-y-1">
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {isDemoMode ? demoLandscapeData.systems.length : systems.length}
                </span>{" "}
                systems
              </div>
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {isDemoMode ? demoLandscapeData.tools.length : tools.length}
                </span>{" "}
                tools
              </div>
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">{edges.length}</span> connections
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export default function LandscapePage() {
  return (
    <ReactFlowProvider>
      <Landscape />
    </ReactFlowProvider>
  );
}
