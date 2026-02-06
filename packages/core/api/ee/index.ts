/**
 * EE Features Entry Point
 *
 * This module exports hooks that can be registered by EE feature modules.
 * If no EE modules are loaded, all hooks return permissive defaults.
 *
 * To disable EE features: simply don't import the feature modules (or delete them).
 * The core code will continue to work with "allow all" behavior.
 */

// Re-export the hook registry for use in core code
export {
  checkGraphQLAccess,
  checkToolExecutionPermission,
  filterToolsByPermission,
} from "./scope-hooks.js";
