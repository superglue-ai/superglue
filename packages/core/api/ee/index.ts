/**
 * EE Features Entry Point
 *
 * This module exports hooks that can be registered by EE feature modules.
 * If no EE modules are loaded, all hooks return permissive defaults.
 *
 * To disable EE features: simply don't import the feature modules (or delete them).
 * The core code will continue to work with "allow all" behavior.
 */

import "./api-key-scopes.js";
import "./api-keys.js";
import "./me.js";
import "./summarize.js";

// Re-export the hook registry for use in core code
export {
  checkToolExecutionPermissionAsync,
  filterToolsByPermissionAsync,
  filterSystemsByPermissionAsync,
  type ScopeContext,
  type AsyncScopeContext,
} from "./scope-hooks.js";
