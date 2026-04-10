export { getTunnelRegistry, InMemoryTunnelRegistry, setTunnelRegistry } from "./tunnel-registry.js";
export type { TunnelRegistryStrategy } from "./tunnel-registry.js";
export {
  getTunnelService,
  initTunnelService,
  rewriteUrlForTunnel,
  setupTunnelsForTool,
  TunnelService,
} from "./tunnel-service.js";
export type { TunnelPortMappings, TunnelSetupResult } from "./tunnel-service.js";
export type {
  AgentMessage,
  ConnectedTunnel,
  ControlMessage,
  OpenTunnelMessage,
  RegisterMessage,
  TunnelResult,
  TunnelServiceOptions,
} from "./tunnel-types.js";
