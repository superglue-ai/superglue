"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { useSchedules } from "@/src/app/schedules-context";
import { useTools } from "@/src/app/tools-context";
import { SystemNode } from "@/src/components/landscape/SystemNode";
import { SearchOverlay } from "@/src/components/landscape/SearchOverlay";
import { ToolNode } from "@/src/components/landscape/ToolNode";
import { Button } from "@/src/components/ui/button";
import { useSystemPickerModal } from "@/src/components/systems/SystemPickerModalContext";
import demoLandscapeData from "@/src/data/demo-landscape.json";
import {
  System,
  Tool,
  excludeSeededSystems,
  excludeSeededTools,
  getToolSystemIds,
} from "@superglue/shared";
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

// Compute optimal handles based on node positions (shortest path)
const getOptimalHandles = (
  sourceNode: Node,
  targetNode: Node,
): { sourceHandle: string; targetHandle: string } => {
  const sourceWidth = sourceNode.width || (sourceNode.type === "tool" ? 120 : 200);
  const sourceHeight = sourceNode.height || (sourceNode.type === "tool" ? 60 : 140);
  const targetWidth = targetNode.width || (targetNode.type === "tool" ? 120 : 200);
  const targetHeight = targetNode.height || (targetNode.type === "tool" ? 60 : 140);

  // Calculate center points
  const sourceCenter = {
    x: sourceNode.position.x + sourceWidth / 2,
    y: sourceNode.position.y + sourceHeight / 2,
  };
  const targetCenter = {
    x: targetNode.position.x + targetWidth / 2,
    y: targetNode.position.y + targetHeight / 2,
  };

  // Calculate edge points for each side of source node
  const sourcePoints = {
    top: { x: sourceCenter.x, y: sourceNode.position.y },
    bottom: { x: sourceCenter.x, y: sourceNode.position.y + sourceHeight },
    left: { x: sourceNode.position.x, y: sourceCenter.y },
    right: { x: sourceNode.position.x + sourceWidth, y: sourceCenter.y },
  };

  // Calculate edge points for each side of target node
  const targetPoints = {
    top: { x: targetCenter.x, y: targetNode.position.y },
    bottom: { x: targetCenter.x, y: targetNode.position.y + targetHeight },
    left: { x: targetNode.position.x, y: targetCenter.y },
    right: { x: targetNode.position.x + targetWidth, y: targetCenter.y },
  };

  // Find the combination with shortest distance
  let minDistance = Infinity;
  let bestSource = "right";
  let bestTarget = "left";

  const sourceSides = ["top", "bottom", "left", "right"] as const;
  const targetSides = ["top", "bottom", "left", "right"] as const;

  for (const sourceSide of sourceSides) {
    for (const targetSide of targetSides) {
      const sp = sourcePoints[sourceSide];
      const tp = targetPoints[targetSide];
      const distance = Math.sqrt(Math.pow(tp.x - sp.x, 2) + Math.pow(tp.y - sp.y, 2));

      if (distance < minDistance) {
        minDistance = distance;
        bestSource = sourceSide;
        bestTarget = targetSide;
      }
    }
  }

  return {
    sourceHandle: `source-${bestSource}`,
    targetHandle: `target-${bestTarget}`,
  };
};

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
      ranksep: 250,
      nodesep: 120,
      edgesep: 40,
      ranker: "tight-tree",
    });

    connectedNodes.forEach((node) => {
      // Set node dimensions based on type
      // Systems with metadata get larger default size
      const width = node.type === "tool" ? 120 : 200;
      const height = node.type === "tool" ? 60 : 140;
      dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    layoutedConnectedNodes = connectedNodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const defaultWidth = node.type === "tool" ? 120 : 200;
      const defaultHeight = node.type === "tool" ? 60 : 140;
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || defaultWidth) / 2,
          y: nodeWithPosition.y - (node.height || defaultHeight) / 2,
        },
      };
    });
  }

  // Arrange disconnected nodes in a grid to the right
  const layoutedDisconnectedNodes: Node[] = [];
  const startX =
    connectedNodes.length > 0
      ? Math.max(...layoutedConnectedNodes.map((n) => n.position.x)) + 500
      : 0;

  // Separate disconnected nodes by type for better layout
  const disconnectedSystems = disconnectedNodes.filter((n) => n.type === "system");
  const disconnectedTools = disconnectedNodes.filter((n) => n.type === "tool");

  // Layout disconnected systems first
  const systemCols = 4;
  disconnectedSystems.forEach((node, index) => {
    const col = index % systemCols;
    const row = Math.floor(index / systemCols);
    layoutedDisconnectedNodes.push({
      ...node,
      position: {
        x: startX + col * 280,
        y: row * 280,
      },
    });
  });

  // Layout disconnected tools below systems
  const toolStartY =
    disconnectedSystems.length > 0
      ? Math.ceil(disconnectedSystems.length / systemCols) * 280 + 100
      : 0;
  const toolCols = 5;
  disconnectedTools.forEach((node, index) => {
    const col = index % toolCols;
    const row = Math.floor(index / toolCols);
    layoutedDisconnectedNodes.push({
      ...node,
      position: {
        x: startX + col * 180,
        y: toolStartY + row * 120,
      },
    });
  });

  const allLayoutedNodes = [...layoutedConnectedNodes, ...layoutedDisconnectedNodes];

  // Create a map for quick node lookup
  const nodeMap = new Map<string, Node>();
  allLayoutedNodes.forEach((node) => nodeMap.set(node.id, node));

  // Update edge handles based on actual node positions
  const updatedEdges = edges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceNode && targetNode) {
      const { sourceHandle, targetHandle } = getOptimalHandles(sourceNode, targetNode);
      return {
        ...edge,
        sourceHandle,
        targetHandle,
      };
    }
    return edge;
  });

  return {
    nodes: allLayoutedNodes,
    edges: updatedEdges,
  };
};

const nodeTypes = {
  system: SystemNode,
  tool: ToolNode,
};

function Landscape() {
  const config = useConfig();
  const router = useRouter();
  const { systems: allSystems, refreshSystems, isRefreshing: isRefreshingSystems } = useSystems();
  const { tools: allTools, refreshTools, isInitiallyLoading: toolsLoading } = useTools();
  const systems = useMemo(() => excludeSeededSystems(allSystems), [allSystems]);
  const tools = useMemo(
    () => excludeSeededTools(allTools.filter((tool) => !tool.archived)),
    [allTools],
  );
  const { schedules, refreshSchedules, getSchedulesForTool } = useSchedules();
  const { openSystemPicker } = useSystemPickerModal();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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

  const handleEditSystem = useCallback(
    (system: System) => {
      router.push(`/systems/${encodeURIComponent(system.id)}`);
    },
    [router],
  );

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
      } else if (e.key === "/") {
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
  }, []);

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
            setSelectedSystemForDetails(null);
            handleEditSystem(system);
          },
        },
        width: isExpanded ? 320 : 200,
        height: isExpanded ? 400 : 140,
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

      // Collect ALL unique systems used by this tool using the helper function
      const toolSystemIds = getToolSystemIds(tool);
      const allSystemIds = new Set<string>(
        toolSystemIds.filter((id) => filteredSystems.find((int) => int.id === id)),
      );

      const uniqueSystems = Array.from(allSystemIds).map((id) => `int-${id}`);

      // Connect all systems through the tool node
      if (uniqueSystems.length > 0) {
        // First system -> tool
        allEdges.push({
          id: `${tool.id}-in`,
          source: uniqueSystems[0],
          target: toolNodeId,
          // Handles will be computed dynamically based on node positions
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
            // Handles will be computed dynamically based on node positions
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
      <SearchOverlay
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        systems={systems}
        tools={tools}
        onSelectItem={handleSelectNode}
      />

      {isDemoMode && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-2xl">
          <div className="bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-[#FFA500]/50 rounded-2xl shadow-lg p-4">
            <div className="flex items-center gap-3">
              <div className="bg-[#FFA500]/20 p-2 rounded-xl flex-shrink-0">
                <Globe className="h-5 w-5 text-[#FFA500]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground mb-1">Demo Landscape</h3>
                <p className="text-sm text-muted-foreground">
                  Preview with example data. Add systems to see your actual landscape.
                </p>
              </div>
              <Button
                onClick={openSystemPicker}
                size="sm"
                className="bg-[#FFA500] hover:bg-[#FF8C00] text-white flex-shrink-0 rounded-xl"
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
                variant="glass"
                size="sm"
                onClick={() => setShowSearch(true)}
                className="h-9 rounded-xl"
              >
                <Search className="h-4 w-4 mr-2" />
                Search
                <kbd className="ml-2 px-1.5 py-0.5 text-xs font-mono bg-background/50 rounded border border-border/50">
                  /
                </kbd>
              </Button>
              <Button
                variant="glass"
                size="sm"
                onClick={openSystemPicker}
                className="h-9 rounded-xl"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add System
              </Button>
              <Button
                variant="glass"
                size="icon"
                onClick={refreshData}
                disabled={isRefreshing || isRefreshingSystems}
                className="rounded-xl"
              >
                <RotateCw
                  className={`h-4 w-4 ${isRefreshing || isRefreshingSystems ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </Panel>

          <Panel
            position="bottom-right"
            className="bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 rounded-2xl p-3 !ml-16 w-32"
          >
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 rounded-lg border border-border/50 bg-muted/30 flex-shrink-0 flex items-center justify-center">
                  <Globe className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
                <span>System</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 rounded-lg border border-border/50 bg-muted/30 flex-shrink-0 flex items-center justify-center">
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
            className="bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 rounded-2xl p-3 !mb-28 w-32"
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
