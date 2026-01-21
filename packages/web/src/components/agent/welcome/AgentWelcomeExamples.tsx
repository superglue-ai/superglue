import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { getSimpleIcon } from "@/src/lib/general-utils";
import { X } from "lucide-react";

interface ToolExample {
  title: string;
  icon: string;
  userPrompt: string;
  systemPrompt: string;
}

const TOOL_EXAMPLES: ToolExample[] = [
  {
    title: "List My GitHub Repositories",
    icon: "github",
    userPrompt:
      "Create a tool that fetches all public repositories for the GitHub user '<user_name>' using the GitHub REST API.",
    systemPrompt: `
  The GitHub API is needs a personal access token from https://github.com/settings/tokens (no scopes required for public repos).
  
  Ask the user for his access token and for his GitHub username - you need this to create the tool!
  
  Return the result in **markdown** with a brief explanation and an example JSON structure like:
  \`\`\`json
  { "repositories": [ { "name": "repo-name", "description": "repo-description" } ] }
  \`\`\`
  Be concise, helpful, and suggest next steps if relevant.
      `,
  },

  {
    title: "Add a Contact to HubSpot",
    icon: "hubspot",
    userPrompt:
      "Create a tool that adds a new contact to a HubSpot account using the HubSpot CRM API.",
    systemPrompt: `
  HubSpot requires an personal access key.
  To generate a new Key, go to your HubSpot account, navigate to Development.
  In the left sidebar menu, click Keys, then click Personal access key and create a new key.
  
  Docs: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot#personal-access-keys
  
  Include fields such as email, firstname, and lastname in the request body.  
  Return markdown explaining the setup briefly and include an example JSON structure for creating a contact.
  
  Answer briefly, suggest and help the user.
      `,
  },

  {
    title: "Get Products from a Public Store",
    icon: "shopify",
    userPrompt:
      "Create a tool that retrieves all products from timbuk2.com/products.json and supports pagination.",
    systemPrompt: `
  The Timbuk2 store exposes a public Shopify endpoint: https://www.timbuk2.com/products.json  
  Pagination is handled via the \`page\` and \`limit\` query parameters.
  
  Example: \`https://www.timbuk2.com/products.json?page=1&limit=20\`
  
  No authentication is required.  
  Return markdown with a short explanation and show a JSON result example listing product names and prices.
  
  Be brief but clear.
      `,
  },

  {
    title: "Create a Page in Notion",
    icon: "notion",
    userPrompt: "Create a tool that adds a new page to a Notion database using the Notion API.",
    systemPrompt: `
  The Notion API requires an integration token.  
  Create one here: https://www.notion.so/my-integrations  
  Then share the target database with that system.
  
  Docs: https://developers.notion.com/reference/post-page
  
  The user needs to give the system access to pages in his notion workspace.
  
  Make sure that the user gives you all the information you need before creating the tool. For creating a page, you need to know the database id or a workspace id or a parent page id.
  
  The tool should send a POST request to create a page with a title and optional properties.  
  Answer in markdown, briefly explain setup, and include an example JSON payload.
  
  Be concise, helpful, and guide the user.
      `,
  },
];

interface AgentWelcomeExamplesProps {
  onStartPrompt: (userPrompt: string, systemPrompt?: string) => void;
  onDismiss: () => void;
}

export function AgentWelcomeExamples({ onStartPrompt, onDismiss }: AgentWelcomeExamplesProps) {
  const handleSuggestionClick = (suggestion: ToolExample) => {
    onStartPrompt(suggestion.userPrompt, suggestion.systemPrompt);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Tool Examples</span>
        {onDismiss && (
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onDismiss}>
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Examples Grid */}
      <div className="flex flex-wrap gap-2">
        {TOOL_EXAMPLES.map((tool, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="h-auto py-2 px-3 text-xs hover:bg-primary hover:text-primary-foreground transition-colors whitespace-normal text-left"
            onClick={() => {
              handleSuggestionClick(tool);
            }}
          >
            {(() => {
              const icon = tool.icon ? getSimpleIcon(tool.icon) : null;
              return icon ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill={`#${icon.hex}`}
                  className="mr-1 flex-shrink-0"
                >
                  <path d={icon.path} />
                </svg>
              ) : null;
            })()}
            {tool.title}
          </Button>
        ))}
      </div>
    </div>
  );
}
