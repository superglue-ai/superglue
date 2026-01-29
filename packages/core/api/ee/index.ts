/**
 * EE Features Entry Point
 *
 * This module exports hooks that can be registered by EE feature modules.
 * If no EE modules are loaded, all hooks return permissive defaults.
 *
 * To disable EE features: simply don't import the feature modules (or delete them).
 * The core code will continue to work with "allow all" behavior.
 */

// Import EE feature modules - these self-register their hooks
import "./api-key-scopes.js";
import "./discovery-runs.js";
import "./file-references.js";
import "./metrics.js";
import "./schedules.js";
import "./settings.js";
import "./tool-history.js";
import "./webhooks.js";

// Re-export the hook registry for use in core code
export {
  checkGraphQLAccess,
  checkToolExecutionPermission,
  filterToolsByPermission,
} from "./scope-hooks.js";
