// Import API endpoint modules
import "./runs.js";
import "./tools.js";

// Automatically import all files from ee folder
import "./ee/index.js";

// Export the registry for use in the server
export { registerAllRoutes } from "./registry.js";
