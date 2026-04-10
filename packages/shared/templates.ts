import { System } from "./types";

export interface SystemConfig {
  name: string;
  apiUrl: string;
  regex: string;
  icon: string;
  docsUrl: string;
  openApiUrl?: string;
  openApiSchema?: string;
  preferredAuthType?: "oauth" | "apikey" | "none";
  oauth?: {
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string;
    client_id?: string; // Public client ID (non-sensitive, can be in template)
    grant_type?: "authorization_code" | "client_credentials";
    tokenAuthMethod?: "body" | "basic_auth";
    tokenContentType?: "form" | "json";
    extraHeaders?: Record<string, string>;
    usePKCE?: boolean;
  };
  keywords?: string[];
  systemSpecificInstructions?: string;
}

export const systems: Record<string, SystemConfig> = {
  // Important: keys and names are the same and do not change without updating the integration and integration_details table with the template entries
  postgres: {
    name: "postgres",
    apiUrl: "postgres://<<username>>:<<password>>@<<host>>:<<port>>/<<database>>",
    regex: "^.*(postgres|postgresql).*$",
    icon: "postgresql",
    docsUrl: "",
    preferredAuthType: "apikey",
    keywords: ["database", "sql", "postgres", "postgresql", "api key", "tables"],
  },
  redis_direct: {
    name: "redis_direct",
    apiUrl: "redis://<<username>>:<<password>>@<<host>>:<<port>>/<<database>>",
    regex: "^.*(rediss?://).*$",
    icon: "redis",
    docsUrl: "https://redis.io/docs/latest/commands/",
    preferredAuthType: "apikey",
    keywords: ["database", "cache", "redis", "key-value", "nosql", "api key"],
  },
  azure_sql: {
    name: "azure_sql",
    apiUrl: "sqlserver://<<host>>:1433;database=<<database>>",
    regex: "^.*(azure.*sql|sql.*azure|database\\.windows\\.net).*$",
    icon: "default",
    docsUrl: "https://learn.microsoft.com/en-us/azure/azure-sql/",
    preferredAuthType: "apikey",
    keywords: [
      "database",
      "sql",
      "azure",
      "query",
      "table",
      "schema",
      "connection",
      "mssql",
      "sqlserver",
    ],
  },
  stripe: {
    name: "stripe",
    apiUrl: "https://api.stripe.com",
    regex: "^.*stripe.*$",
    icon: "stripe",
    docsUrl: "https://docs.stripe.com/api",
    openApiUrl: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    preferredAuthType: "apikey",
    keywords: [
      "customers",
      "charges",
      "payment_intents",
      "products",
      "prices",
      "subscriptions",
      "invoices",
      "balance_transactions",
      "refunds",
      "checkout_sessions",
      "line_items",
      "payment_methods",
      "issuers",
      "plans",
      "setup_intents",
      "payouts",
      "transfers",
      "balance",
      "users",
      "emails",
    ],
  },
  shopify: {
    name: "shopify",
    apiUrl: "https://admin.shopify.com",
    regex: "^.*(shopify|myshopify).*$",
    icon: "shopify",
    docsUrl: "https://shopify.dev/docs/api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
      tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
      scopes:
        "read_products write_products read_orders write_orders read_customers write_customers read_inventory write_inventory read_fulfillments write_fulfillments read_shipping write_shipping",
    },
    keywords: [
      "products",
      "variants",
      "collections",
      "customers",
      "orders",
      "fulfillments",
      "inventory_items",
      "inventory_levels",
      "metafields",
      "price_rules",
      "discount_codes",
      "shipping_zones",
      "locations",
      "gift_cards",
      "product_images",
    ],
  },
  hubspot: {
    name: "hubspot",
    apiUrl: "https://api.hubapi.com/crm/v3",
    regex: "^.*(hubapi|hubspot).*$",
    icon: "hubspot",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
    openApiUrl: "https://api.hubspot.com/public/api/spec/v1/specs",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes:
        "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write crm.objects.owners.read forms forms-uploaded-files files sales-email-read crm.objects.quotes.read crm.objects.quotes.write",
    },
    keywords: [
      "contacts",
      "companies",
      "deals",
      "tickets",
      "line_items",
      "products",
      "associations",
      "memberships",
    ],
  },
  hrworks: {
    name: "hrworks",
    apiUrl: "https://api.hrworks.de/v2",
    regex: "(^|.*\\b)(hr\\s?works|hrworks)(\\b.*|$)",
    icon: "default",
    docsUrl: "https://developers.hrworks.de/",
    preferredAuthType: "apikey",
    keywords: [
      "hr",
      "employee",
      "absence",
      "vacation",
      "payroll",
      "personnel",
      "time_tracking",
      "human_resources",
      "working_time",
      "attendance",
      "onboarding",
      "applicant_management",
      "travel_expenses",
      "sick_leave",
    ],
  },
  attio: {
    name: "attio",
    apiUrl: "https://api.attio.com/v2/",
    regex: "^.*attio.*$",
    icon: "attio",
    docsUrl: "https://docs.attio.com/rest-api/overview",
    openApiUrl: "https://api.attio.com/openapi/api",
    preferredAuthType: "apikey",
    keywords: [
      "people",
      "objects",
      "records",
      "lists",
      "entries",
      "workspace_members",
      "notes",
      "tasks",
      "threads",
      "comments",
      "sorts",
      "api_slug",
      "attribute_type",
      "record_id",
      "workspace_id",
      "object_id",
    ],
  },
  twilio: {
    name: "twilio",
    apiUrl: "https://api.twilio.com",
    regex: "^.*twilio.*$",
    icon: "twilio",
    docsUrl: "https://www.twilio.com/docs/api",
    openApiUrl:
      "https://raw.githubusercontent.com/twilio/twilio-oai/refs/heads/main/spec/json/twilio_api_v2010.json",
    preferredAuthType: "apikey",
    keywords: [
      "Messages",
      "Media",
      "MessageFeedback",
      "Calls",
      "Accounts",
      "APIKeys",
      "Addresses",
      "UsageRecords",
      "CallFeedback",
      "CredentialsList",
      "TaskRouter_Workspaces",
      "TaskRouter_Tasks",
      "TaskRouter_Workers",
      "TaskRouter_Activities",
      "MessagingServices",
    ],
  },
  sendgrid: {
    name: "sendgrid",
    apiUrl: "https://api.sendgrid.com",
    regex: "^.*sendgrid.*$",
    icon: "sendgrid",
    docsUrl: "https://www.twilio.com/docs/sendgrid/api-reference",
    openApiUrl: "https://raw.githubusercontent.com/sendgrid/sendgrid-oai/main/oai.json",
    preferredAuthType: "apikey",
    keywords: [
      "mail_send",
      "templates",
      "campaigns",
      "marketing_contacts",
      "marketing_lists",
      "suppression_groups",
      "global_suppressions",
      "asm_suppressions",
      "subusers",
      "stats",
      "categories",
      "whitelabel",
      "ips",
      "access_settings",
    ],
  },
  github: {
    name: "github",
    apiUrl: "https://api.github.com",
    regex: "^.*github.*$",
    icon: "github",
    docsUrl: "https://docs.github.com/en/rest",
    openApiUrl:
      "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes:
        "repo user admin:org workflow gist notifications delete_repo write:packages read:packages",
    },
    keywords: [
      "repositories",
      "issues",
      "pull_requests",
      "commits",
      "branches",
      "tags",
      "releases",
      "deployments",
      "check_runs",
      "actions_artifacts",
      "organizations",
      "packages",
      "collaborators",
      "gists",
      "milestones",
    ],
  },
  gitlab: {
    name: "gitlab",
    apiUrl: "https://api.gitlab.com",
    regex: "^.*gitlab.*$",
    icon: "gitlab",
    docsUrl: "https://docs.gitlab.com/api/rest/",
    openApiUrl: "https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi.yaml",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://gitlab.com/oauth/authorize",
      tokenUrl: "https://gitlab.com/oauth/token",
      scopes: "api",
    },
    keywords: [
      "projects",
      "repositories",
      "issues",
      "pull_requests",
      "commits",
      "branches",
      "tags",
      "releases",
      "deployments",
      "check_runs",
      "actions_artifacts",
      "organizations",
      "packages",
      "collaborators",
      "gists",
      "milestones",
    ],
  },
  bitbucket: {
    name: "bitbucket",
    apiUrl: "https://api.bitbucket.org",
    regex: "^.*bitbucket.*$",
    icon: "bitbucket",
    docsUrl: "https://developer.atlassian.com/cloud/bitbucket/rest",
    openApiUrl: "https://api.bitbucket.org/swagger.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://bitbucket.org/site/oauth2/authorize",
      tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
      scopes: "repository:admin account:write team:write webhook",
    },
    keywords: [
      "repositories",
      "projects",
      "commits",
      "branches",
      "pullrequests",
      "downloads",
      "issues",
      "pipelines",
      "branchRestrictions",
      "components",
      "milestones",
      "refs",
      "hooks",
      "forks",
      "user",
    ],
  },
  slack: {
    name: "slack",
    apiUrl: "https://slack.com/api",
    regex: "^.*slack.*$",
    icon: "slack",
    docsUrl: "https://docs.slack.dev/apis/web-api/",
    openApiUrl:
      "https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json",
    preferredAuthType: "oauth",
    oauth: {
      grant_type: "authorization_code",
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes:
        "channels:read channels:history chat:write chat:write.public users:read users:read.email files:read files:write groups:read im:read im:write mpim:read",
    },
    keywords: [
      "channel",
      "conversation",
      "user",
      "file",
      "event",
      "message",
      "workflow_step",
      "workflow_published",
      "workflow_step_execute",
      "usergroup",
      "im",
      "mpim",
      "group",
      "check_run",
      "apps_permissions_resource",
    ],
  },
  airtable: {
    name: "airtable",
    apiUrl: "https://api.airtable.com",
    regex: "^.*airtable.*$",
    icon: "airtable",
    docsUrl: "https://airtable.com/developers/web/api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://airtable.com/oauth2/v1/authorize",
      tokenUrl: "https://airtable.com/oauth2/v1/token",
      scopes:
        "data.recordComments:read data.recordComments:write data.records:read data.records:write schema.bases:read schema.bases:write user.email:read enterprise.groups:read workspacesAndBases.shares:manage workspacesAndBases:read workspacesAndBases:write data.records:manage enterprise.account:read enterprise.account:write enterprise.auditLogs:read enterprise.changeEvents:read enterprise.exports:manage enterprise.groups:manage enterprise.scim.usersAndGroups:manage enterprise.user:read enterprise.user:write workspacesAndBases:manage webhook:manage",
      usePKCE: true,
      tokenAuthMethod: "basic_auth",
      tokenContentType: "form",
    },
    keywords: [
      "bases",
      "tables",
      "records",
      "fields",
      "views",
      "formulas",
      "attachments",
      "comments",
      "collaborators",
      "metadata",
      "schemas",
      "api key",
      "key",
    ],
  },
  gmail: {
    name: "gmail",
    apiUrl: "https://gmail.googleapis.com/gmail/v1",
    regex: "^.*(gmail\\.googleapis|developers\\.google\\.com/gmail|mail\\.google).*$",
    icon: "gmail",
    docsUrl: "https://developers.google.com/gmail/api/reference/rest",
    openApiUrl: "https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://mail.google.com/",
    },
    keywords: [
      "messages",
      "threads",
      "labels",
      "drafts",
      "send",
      "attachments",
      "history",
      "filters",
      "settings",
      "forwarding",
      "inbox",
      "profile",
      "oauth",
    ],
  },
  granola: {
    name: "granola",
    apiUrl: "https://public-api.granola.ai",
    regex: "^.*granola.*$",
    icon: "default",
    docsUrl: "https://docs.granola.ai",
    preferredAuthType: "apikey",
    keywords: ["meeting", "notes", "transcript", "summary", "ai", "recording"],
  },
  googleDrive: {
    name: "googleDrive",
    apiUrl: "https://www.googleapis.com/drive/v3",
    regex: "^.*(googleapis\\.com/drive|developers\\.google\\.com/drive|drive\\.google).*$",
    icon: "googledrive",
    docsUrl: "https://developers.google.com/drive/api/v3/reference",
    openApiUrl: "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/drive",
    },
    keywords: [
      "files",
      "folders",
      "permissions",
      "sharing",
      "comments",
      "revisions",
      "changes",
      "uploads",
      "downloads",
      "metadata",
      "teamdrives",
      "export",
      "copy",
      "move",
      "oauth",
    ],
  },
  googleCalendar: {
    name: "googleCalendar",
    apiUrl: "https://www.googleapis.com/calendar/v3",
    regex: "^.*(googleapis\\.com/calendar|developers\\.google\\.com/calendar|calendar\\.google).*$",
    icon: "googlecalendar",
    docsUrl: "https://developers.google.com/calendar/api/v3/reference",
    openApiUrl: "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/calendar",
    },
    keywords: [
      "events",
      "calendars",
      "attendees",
      "reminders",
      "recurring",
      "availability",
      "free busy",
      "settings",
      "acl",
      "colors",
      "notifications",
      "timezone",
      "quick add",
      "oauth",
    ],
  },
  googleSheets: {
    name: "googleSheets",
    apiUrl: "https://sheets.googleapis.com/v4",
    regex: "^.*(sheets\\.googleapis|developers\\.google\\.com/sheets|sheets\\.google).*$",
    icon: "googlesheets",
    docsUrl: "https://developers.google.com/sheets/api/reference/rest",
    openApiUrl: "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    },
    keywords: [
      "spreadsheets",
      "sheets",
      "cells",
      "ranges",
      "values",
      "formulas",
      "formatting",
      "charts",
      "pivot tables",
      "named ranges",
      "protected ranges",
      "batch update",
      "append",
      "oauth",
    ],
  },
  googleAnalytics: {
    name: "googleAnalytics",
    apiUrl: "https://analytics.google.com",
    regex: "^.*(analytics|analyticsdata).*$",
    icon: "googleAnalytics",
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    openApiUrl: "https://analyticsdata.googleapis.com/$discovery/rest?version=v1beta",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/analytics.edit",
    },
    keywords: [
      "properties",
      "dimensions",
      "metrics",
      "reports",
      "audiences",
      "conversions",
      "events",
      "goals",
      "segments",
      "real time",
      "user activity",
      "attribution",
      "funnels",
      "cohorts",
      "oauth",
    ],
  },
  youtube: {
    name: "youtube",
    apiUrl: "https://youtube.googleapis.com",
    regex: "^.*youtube.*$",
    icon: "youtube",
    docsUrl: "https://developers.google.com/youtube/v3/docs",
    openApiUrl: "https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/youtube",
    },
    keywords: [
      "videos",
      "channels",
      "playlists",
      "comments",
      "captions",
      "live streams",
      "analytics",
      "thumbnails",
      "subscriptions",
      "activities",
      "ratings",
      "uploads",
      "members",
      "oauth",
    ],
  },
  AWS: {
    name: "AWS",
    apiUrl: "https://amazonaws.com",
    regex: "^.*(aws|amazonaws).*$",
    icon: "amazonwebservices",
    docsUrl: "https://docs.aws.amazon.com/index.html",
    preferredAuthType: "apikey",
    keywords: [
      "ec2",
      "s3",
      "lambda",
      "rds",
      "dynamodb",
      "sqs",
      "sns",
      "cloudformation",
      "iam",
      "cloudwatch",
      "vpc",
      "instances",
      "buckets",
      "functions",
      "api key",
    ],
  },
  googleCloud: {
    name: "googleCloud",
    apiUrl: "https://cloud.google.com",
    regex: "^.*(cloud\\.google|gcp|googlecloud).*$",
    icon: "googleCloud",
    docsUrl: "https://cloud.google.com/apis/docs/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    },
    keywords: [
      "compute",
      "storage",
      "pubsub",
      "cloud run",
      "kubernetes",
      "iam",
      "vpc",
      "cloud sql",
      "bigtable",
      "dataflow",
      "logging",
      "monitoring",
      "oauth",
    ],
  },
  bigquery: {
    name: "bigquery",
    apiUrl: "https://bigquery.googleapis.com/bigquery/v2",
    regex: "^.*(bigquery|bq\\.googleapis).*$",
    icon: "googleCloud",
    docsUrl: "https://cloud.google.com/bigquery/docs/reference/rest",
    openApiUrl: "https://bigquery.googleapis.com/$discovery/rest?version=v2",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/bigquery",
    },
    systemSpecificInstructions: `BigQuery REST API - Authentication Options:

OPTION 1: OAuth App (Recommended)
If the user has or creates an OAuth app in their Google Cloud project:
1. Create OAuth credentials in Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID
2. Set application type to "Web application" and add the superglue callback URL as authorized redirect URI
3. Use create_system with credentials: { client_id: "..." } and sensitiveCredentials: { client_secret: true }
4. After system creation, use authenticate_oauth - user completes Google sign-in in popup
5. Superglue auto-refreshes tokens - no manual token management needed

OPTION 2: Service Account JWT (Advanced)
If the user has a service account JSON file, you can generate JWTs dynamically using a transform step:
- Extract private_key and client_email from the service account JSON
- Build the JWT header and claims, then sign with crypto.sign('sha256', data, privateKey, 'base64url')
- Exchange the JWT for an access token via POST to https://oauth2.googleapis.com/token

OPTION 3: Service Account Token via CLI (Manual refresh required)
If the user prefers to generate tokens externally:
- User generates an access token on their machine using gcloud CLI:
  1. Activate the service account: gcloud auth activate-service-account --key-file=/path/to/service-account.json
  2. Print the token: gcloud auth print-access-token
- The token is valid for 1 hour only
- For tools built this way: the token should be a required INPUT in the tool payload, not stored as a system credential (since it expires quickly)

REQUIRED GCP PERMISSIONS:
- BigQuery Data Viewer (roles/bigquery.dataViewer) - read access
- BigQuery Data Editor (roles/bigquery.dataEditor) - write access  
- BigQuery Job User (roles/bigquery.jobUser) - run queries

HEADERS: { "Authorization": "Bearer <<token>>", "Content-Type": "application/json" }`,
    keywords: [
      "datasets",
      "tables",
      "queries",
      "jobs",
      "projects",
      "schemas",
      "rows",
      "streaming",
      "partitions",
      "clustering",
      "views",
      "routines",
      "models",
      "data warehouse",
      "sql",
      "oauth",
    ],
  },
  firebase: {
    name: "firebase",
    apiUrl: "https://firestore.googleapis.com",
    regex: "^.*(firebase|firestore).*$",
    icon: "firebase",
    docsUrl: "https://firebase.google.com/docs/reference/firebase-management/rest",
    openApiUrl: "https://firestore.googleapis.com/$discovery/rest?version=v1",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes:
        "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
    },
    keywords: [
      "firestore",
      "realtime database",
      "authentication",
      "cloud functions",
      "storage",
      "hosting",
      "documents",
      "collections",
      "users",
      "projects",
      "apps",
      "query",
      "oauth",
    ],
  },
  salesforce: {
    name: "salesforce",
    apiUrl: "https://api.salesforce.com",
    regex: "^.*salesforce.*$",
    icon: "salesforce",
    // documentation not crawlable due to weird htm site. PDF available at https://resources.docs.salesforce.com/258/latest/en-us/sfdc/pdf/api_rest.pdf - convert to text and insert in db.
    docsUrl:
      "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
      scopes: "full",
      grant_type: "authorization_code",
    },
    keywords: [
      "accounts",
      "contacts",
      "leads",
      "opportunities",
      "cases",
      "campaigns",
      "products",
      "price books",
      "quotes",
      "contracts",
      "orders",
      "custom objects",
      "soql",
      "query",
      "search",
      "sobjects",
      "oauth",
    ],
  },
  facebook: {
    name: "facebook",
    apiUrl: "https://graph.facebook.com",
    regex: "^.*facebook.*$",
    icon: "facebook",
    docsUrl: "https://developers.facebook.com/docs/graph-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
      scopes:
        "email public_profile pages_show_list pages_read_engagement pages_manage_metadata pages_read_user_content pages_manage_posts pages_manage_engagement business_management ads_management ads_read catalog_management leads_retrieval",
    },
    keywords: [
      "pages",
      "posts",
      "comments",
      "insights",
      "ads",
      "campaigns",
      "audiences",
      "business",
      "catalog",
      "events",
      "groups",
      "photos",
      "videos",
      "live videos",
      "oauth",
    ],
  },
  instagram: {
    name: "instagram",
    apiUrl: "https://graph.facebook.com/v23.0/",
    regex: "^.*instagram.*$",
    icon: "instagram",
    docsUrl: "https://developers.facebook.com/docs/graph-api/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.facebook.com/v23.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v23.0/oauth/access_token",
      scopes:
        "instagram_basic pages_show_list instagram_content_publish pages_read_engagement instagram_manage_comments instagram_manage_insights instagram_manage_messages business_management",
    },
    keywords: [
      "media",
      "posts",
      "stories",
      "comments",
      "insights",
      "hashtags",
      "mentions",
      "business discovery",
      "content publishing",
      "user media",
      "account info",
      "oauth",
    ],
  },
  twitter: {
    name: "twitter",
    apiUrl: "https://api.twitter.com",
    regex: "^.*(twitter|x\\.com).*$",
    icon: "x",
    docsUrl: "https://docs.x.com/x-api/introduction",
    openApiUrl: "https://api.x.com/2/openapi.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      scopes:
        "tweet.read tweet.write users.read follows.read follows.write offline.access like.read like.write list.read list.write block.read block.write bookmark.read bookmark.write mute.read mute.write",
    },
    keywords: [
      "tweets",
      "users",
      "followers",
      "timeline",
      "mentions",
      "retweets",
      "likes",
      "lists",
      "spaces",
      "direct messages",
      "trends",
      "media",
      "polls",
      "oauth",
    ],
  },
  linkedin: {
    name: "linkedin",
    apiUrl: "https://api.linkedin.com",
    regex: "^.*linkedin.*$",
    icon: "linkedin",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes:
        "r_liteprofile r_emailaddress w_member_social r_fullprofile r_basicprofile rw_company_admin r_1st_connections r_ads r_ads_reporting r_organization_social rw_organization_admin w_organization_social r_events",
    },
    keywords: [
      "profiles",
      "connections",
      "companies",
      "shares",
      "posts",
      "articles",
      "jobs",
      "skills",
      "endorsements",
      "recommendations",
      "groups",
      "events",
      "messaging",
      "oauth",
    ],
  },
  paypal: {
    name: "paypal",
    apiUrl: "https://api.paypal.com",
    regex: "^.*paypal.*$",
    icon: "paypal",
    docsUrl: "https://developer.paypal.com/api/rest",
    // openapi specs are split across different files - all here: https://github.com/paypal/paypal-rest-api-specifications/tree/main/openapi
    preferredAuthType: "apikey",
    keywords: [
      "payments",
      "orders",
      "captures",
      "refunds",
      "payouts",
      "invoices",
      "subscriptions",
      "plans",
      "products",
      "transactions",
      "balances",
      "webhooks",
      "checkout",
      "billing",
      "query",
      "search",
    ],
  },
  square: {
    name: "square",
    apiUrl: "https://connect.squareup.com",
    regex: "^.*(square|squareup).*$",
    icon: "square",
    docsUrl: "https://developer.squareup.com/reference/square",
    openApiUrl:
      "https://raw.githubusercontent.com/square/connect-api-specification/refs/heads/master/api.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://connect.squareup.com/oauth2/authorize",
      tokenUrl: "https://connect.squareup.com/oauth2/token",
      scopes:
        "MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE INVENTORY_READ INVENTORY_WRITE ORDERS_READ ORDERS_WRITE ITEMS_READ ITEMS_WRITE EMPLOYEES_READ EMPLOYEES_WRITE TIMECARDS_READ TIMECARDS_WRITE",
    },
    keywords: [
      "payments",
      "customers",
      "orders",
      "catalog",
      "inventory",
      "locations",
      "transactions",
      "refunds",
      "cards",
      "checkout",
      "invoices",
      "subscriptions",
      "terminals",
      "employees",
      "shifts",
      "query",
      "search",
      "oauth",
    ],
  },
  adyen: {
    name: "adyen",
    apiUrl: "https://checkout-test.adyen.com",
    regex: "^.*adyen.*$",
    icon: "adyen",
    docsUrl: "https://docs.adyen.com/api-explorer",
    openApiUrl:
      "https://raw.githubusercontent.com/Adyen/adyen-openapi/main/yaml/CheckoutService-v71.yaml",
    preferredAuthType: "apikey",
    keywords: [
      "paymentMethods",
      "sessions",
      "payments",
      "payments.details",
      "cardDetails",
      "recurringContracts",
      "payouts",
      "balanceTransfers",
      "legalEntities",
      "binLookup",
      "storedValueCards",
      "transferRules",
      "terminalManagement",
      "accountHolders",
      "issuers",
    ],
  },
  razorpay: {
    name: "razorpay",
    apiUrl: "https://api.razorpay.com",
    regex: "^.*razorpay.*$",
    icon: "razorpay",
    docsUrl: "https://razorpay.com/docs/api",
    preferredAuthType: "apikey",
    keywords: [
      "payments",
      "orders",
      "customers",
      "refunds",
      "invoices",
      "subscriptions",
      "accounts",
      "fund_accounts",
      "payouts",
      "virtual_accounts",
      "mandates",
      "disputes",
      "settlements",
      "payment_links",
      "bin_lookup",
    ],
  },
  plaid: {
    name: "plaid",
    apiUrl: "https://production.plaid.com",
    regex: "^.*plaid.*$",
    icon: "plaid",
    docsUrl: "https://plaid.com/docs/api",
    openApiUrl: "https://raw.githubusercontent.com/plaid/plaid-openapi/master/2020-09-14.yml",
    preferredAuthType: "apikey",
    keywords: [
      "items",
      "accounts",
      "institutions",
      "link_tokens",
      "access_tokens",
      "transactions",
      "auth",
      "identity",
      "assets",
      "liabilities",
      "income",
      "user",
      "processor_tokens",
      "transfer",
      "investments",
    ],
  },
  zendesk: {
    name: "zendesk",
    apiUrl: "https://api.zendesk.com",
    regex: "^.*zendesk.*$",
    icon: "zendesk",
    docsUrl: "https://developer.zendesk.com/api-reference",
    openApiUrl: "https://developer.zendesk.com/zendesk/oas.yaml",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
      tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
      scopes:
        "read write tickets:read tickets:write users:read users:write organizations:read organizations:write hc:read hc:write chat:read chat:write",
    },
    keywords: [
      "tickets",
      "users",
      "organizations",
      "groups",
      "agents",
      "views",
      "macros",
      "triggers",
      "automations",
      "sla",
      "custom fields",
      "tags",
      "satisfaction",
      "help center",
      "api key",
    ],
  },
  freshdesk: {
    name: "freshdesk",
    apiUrl: "https://{domain}.freshdesk.com/api/v2",
    regex: "^.*freshdesk.*$",
    icon: "freshdesk",
    // doc cannot be crawled from our setup
    docsUrl: "https://developers.freshdesk.com/api",
    preferredAuthType: "apikey",
    keywords: [
      "tickets",
      "contacts",
      "agents",
      "companies",
      "groups",
      "forums",
      "solutions",
      "categories",
      "folders",
      "articles",
      "time entries",
      "surveys",
      "satisfaction",
      "sla",
      "escalations",
      "api key",
    ],
  },
  freshworks: {
    name: "freshworks",
    apiUrl: "https://{domain}.freshservice.com/api/v2",
    regex: "^.*(freshworks|freshservice).*$",
    icon: "freshworks",
    // doc cannot be crawled from our setup
    docsUrl: "https://api.freshservice.com",
    preferredAuthType: "apikey",
    keywords: [
      "tickets",
      "requesters",
      "agents",
      "assets",
      "changes",
      "problems",
      "releases",
      "service catalog",
      "service items",
      "departments",
      "locations",
      "products",
      "vendors",
      "contracts",
      "api key",
    ],
  },
  servicenow: {
    name: "servicenow",
    apiUrl: "https://{instance}.service-now.com/api",
    regex: "^.*(servicenow|service-now).*$",
    icon: "servicenow",
    // service now page does not allow playwright to crawl their page
    docsUrl: "https://developer.servicenow.com/dev.do#!/reference/api/latest/rest",
    preferredAuthType: "apikey",
    keywords: [
      "incidents",
      "problems",
      "changes",
      "requests",
      "users",
      "groups",
      "cmdb",
      "configuration items",
      "service catalog",
      "knowledge",
      "tasks",
      "approvals",
      "sla",
      "workflows",
      "tables",
      "api key",
    ],
  },
  helpscout: {
    name: "helpscout",
    apiUrl: "https://api.helpscout.net",
    regex: "^.*helpscout.*$",
    icon: "helpscout",
    docsUrl: "https://developer.helpscout.com/mailbox-api",
    preferredAuthType: "apikey",
    keywords: [
      "conversations",
      "customers",
      "mailboxes",
      "threads",
      "tags",
      "teams",
      "users",
      "reports",
      "satisfaction",
      "ratings",
      "workflows",
      "saved replies",
      "docs",
      "beacon",
      "api key",
    ],
  },
  dropbox: {
    name: "dropbox",
    apiUrl: "https://api.dropboxapi.com",
    regex: "^.*dropbox.*$",
    icon: "dropbox",
    docsUrl: "https://www.dropbox.com/developers/documentation/http/documentation",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes:
        "files.metadata.read files.metadata.write files.content.read files.content.write sharing.read sharing.write account_info.read account_info.write",
    },
    keywords: [
      "files",
      "folders",
      "upload",
      "download",
      "sharing",
      "links",
      "metadata",
      "search",
      "sync",
      "paper",
      "users",
      "teams",
      "move",
      "copy",
      "delete",
      "oauth",
    ],
  },
  mailchimp: {
    name: "mailchimp",
    apiUrl: "https://api.mailchimp.com",
    regex: "^.*mailchimp.*$",
    icon: "mailchimp",
    docsUrl: "https://mailchimp.com/developer/marketing/api",
    openApiUrl: "https://api.mailchimp.com/schema/3.0/Swagger.json",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://login.mailchimp.com/oauth2/authorize",
      tokenUrl: "https://login.mailchimp.com/oauth2/token",
      scopes:
        "audiences:read audiences:write automations:read automations:write campaigns:read campaigns:write conversations:read conversations:write ecommerce:read ecommerce:write files:read files:write lists:read lists:write reports:read templates:read templates:write",
    },
    keywords: [
      "lists",
      "campaigns",
      "templates",
      "audiences",
      "members",
      "segments",
      "tags",
      "automations",
      "reports",
      "folders",
      "merge fields",
      "activities",
      "ecommerce",
      "batch",
      "query",
      "api key",
    ],
  },
  jira: {
    name: "jira",
    apiUrl: "https://{your-domain}.atlassian.net/rest/api",
    regex: "^.*(jira|atlassian).*$",
    icon: "jira",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3",
    openApiUrl: "https://developer.atlassian.com/cloud/jira/platform/swagger-v3.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes:
        "read:jira-work write:jira-work read:jira-user write:jira-user read:jira-work-management write:jira-work-management read:servicedesk-request write:servicedesk-request manage:jira-project manage:jira-configuration manage:jira-data-provider offline_access",
    },
    systemSpecificInstructions:
      "You need a cloud id in the url to connect to the Jira instance. Fetch it from available-resources and store it in the system. The /rest/api/3/search endpoint has been deprecated - Use GET /rest/api/3/search/jql with query parameter 'jql' for searching issues. MUST specify a project in the JQL query. Example: GET /rest/api/3/search/jql?jql=project=KAN&maxResults=100. The jql parameter accepts JQL queries like 'project=KEY', 'assignee=currentUser()', 'order by created DESC'. Always URL-encode the jql parameter value.",
    keywords: [
      "issues",
      "projects",
      "boards",
      "sprints",
      "epics",
      "users",
      "workflows",
      "fields",
      "components",
      "versions",
      "priorities",
      "statuses",
      "comments",
      "attachments",
      "jql",
      "query",
      "search",
      "oauth",
    ],
  },
  confluence: {
    name: "confluence",
    apiUrl: "https://{your-domain}.atlassian.net/wiki/rest/api",
    regex: "^.*(confluence|atlassian).*$",
    icon: "confluence",
    docsUrl: "https://developer.atlassian.com/cloud/confluence/rest",
    openApiUrl: "https://developer.atlassian.com/cloud/confluence/swagger.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes:
        "read:confluence-content.all write:confluence-content read:confluence-space.summary write:confluence-space read:confluence-props write:confluence-props read:confluence-user write:confluence-user read:confluence-groups write:confluence-groups delete:confluence-content delete:confluence-space offline_access",
    },
    keywords: [
      "spaces",
      "pages",
      "content",
      "attachments",
      "comments",
      "labels",
      "templates",
      "blueprints",
      "macros",
      "restrictions",
      "versions",
      "ancestors",
      "descendants",
      "children",
      "oauth",
    ],
  },
  quickbooks: {
    name: "quickbooks",
    apiUrl: "https://quickbooks.api.intuit.com",
    regex: "^.*(quickbooks|intuit).*$",
    icon: "quickbooks",
    docsUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      scopes:
        "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment com.intuit.quickbooks.payroll com.intuit.quickbooks.payroll.timetracking com.intuit.quickbooks.payroll.benefits openid profile email phone address",
    },
    keywords: [
      "accounts",
      "invoices",
      "customers",
      "vendors",
      "bills",
      "payments",
      "estimates",
      "purchase orders",
      "sales receipts",
      "credit memos",
      "journal entries",
      "items",
      "tax rates",
      "employees",
      "reports",
      "oauth",
    ],
  },
  xero: {
    name: "xero",
    apiUrl: "https://api.xero.com",
    regex: "^.*xero.*$",
    icon: "xero",
    docsUrl: "https://developer.xero.com/documentation/api/api-overview",
    openApiUrl:
      "https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero_accounting.yaml",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.xero.com/identity/connect/authorize",
      tokenUrl: "https://identity.xero.com/connect/token",
      scopes:
        "accounting.transactions accounting.transactions.read accounting.reports.read accounting.journals.read accounting.settings accounting.settings.read accounting.contacts accounting.contacts.read accounting.attachments accounting.attachments.read payroll.employees payroll.payruns payroll.payslip payroll.timesheets payroll.settings",
    },
    keywords: [
      "accounts",
      "invoices",
      "contacts",
      "bills",
      "credit notes",
      "bank transactions",
      "payments",
      "receipts",
      "journals",
      "purchase orders",
      "quotes",
      "reports",
      "tax rates",
      "tracking categories",
      "payroll",
      "oauth",
    ],
  },
  docusign: {
    name: "docusign",
    apiUrl: "https://api.docusign.com",
    regex: "^.*docusign.*$",
    icon: "docusign",
    docsUrl: "https://developers.docusign.com/docs/esign-rest-api",
    openApiUrl:
      "https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/refs/heads/master/esignature.rest.swagger-v2.1.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://account.docusign.com/oauth/auth",
      tokenUrl: "https://account.docusign.com/oauth/token",
      scopes:
        "signature extended impersonation organization_read group_read permission_read user_read user_write account_read domain_read identity_provider_read user_data_redact asset_group_account_read asset_group_account_clone_write asset_group_account_clone_read",
    },
    keywords: [
      "envelopes",
      "documents",
      "recipients",
      "templates",
      "signatures",
      "tabs",
      "brands",
      "accounts",
      "users",
      "groups",
      "powerforms",
      "bulk send",
      "connect",
      "custom fields",
      "oauth",
    ],
  },
  intercom: {
    name: "intercom",
    apiUrl: "https://api.intercom.io",
    regex: "^.*intercom.*$",
    icon: "intercom",
    docsUrl: "https://developers.intercom.com/intercom-api-reference",
    openApiUrl:
      "https://raw.githubusercontent.com/intercom/Intercom-OpenAPI/refs/heads/main/descriptions/2.9/api.intercom.io.yaml",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.intercom.com/oauth",
      tokenUrl: "https://api.intercom.io/auth/eagle/token",
      scopes:
        "inbox:read inbox:write users:read users:write companies:read companies:write contacts:read contacts:write conversations:read conversations:write help_center:read help_center:write teams:read teams:write tags:read tags:write segments:read events:write counts:read",
    },
    keywords: [
      "contacts",
      "conversations",
      "messages",
      "users",
      "companies",
      "events",
      "tags",
      "segments",
      "articles",
      "help center",
      "teams",
      "admins",
      "inbox",
      "notes",
      "custom attributes",
      "query",
      "api key",
    ],
  },
  asana: {
    name: "asana",
    apiUrl: "https://app.asana.com/api",
    regex: "^.*asana.*$",
    icon: "asana",
    docsUrl: "https://developers.asana.com/docs",
    openApiUrl: "https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.asana.com/-/oauth_authorize",
      tokenUrl: "https://app.asana.com/-/oauth_token",
      scopes: "default openid email profile",
      grant_type: "authorization_code",
    },
    keywords: [
      "tasks",
      "projects",
      "workspaces",
      "teams",
      "portfolios",
      "goals",
      "sections",
      "tags",
      "custom fields",
      "stories",
      "attachments",
      "followers",
      "assignee",
      "due dates",
      "query",
      "search",
      "api key",
    ],
  },
  trello: {
    name: "trello",
    apiUrl: "https://api.trello.com",
    regex: "^.*trello.*$",
    icon: "trello",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest",
    openApiUrl: "https://developer.atlassian.com/cloud/trello/swagger.v3.json",
    preferredAuthType: "apikey",
    keywords: [
      "boards",
      "lists",
      "cards",
      "members",
      "labels",
      "checklists",
      "attachments",
      "comments",
      "actions",
      "organizations",
      "teams",
      "power-ups",
      "custom fields",
      "stickers",
      "api key",
    ],
  },
  notion: {
    name: "notion",
    apiUrl: "https://api.notion.com",
    regex: "^.*notion.*$",
    icon: "notion",
    docsUrl: "https://developers.notion.com",
    // this openapi spec was last updated in 2024 - might be outdated
    openApiUrl:
      "https://raw.githubusercontent.com/cameronking4/notion-openapi-chatgpt-action/refs/heads/main/public/notion-openapi.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes:
        "read_content update_content insert_content read_comments update_comments insert_comments read_user update_user",
      tokenAuthMethod: "basic_auth",
      tokenContentType: "json",
      extraHeaders: { "Notion-Version": "2022-06-28" },
    },
    keywords: [
      "pages",
      "databases",
      "blocks",
      "users",
      "workspaces",
      "properties",
      "rich text",
      "search",
      "comments",
      "parent",
      "children",
      "query",
      "filter",
      "sort",
      "api key",
    ],
  },
  digitalocean: {
    name: "digitalocean",
    apiUrl: "https://api.digitalocean.com",
    regex: "^.*digitalocean.*$",
    icon: "digitalocean",
    docsUrl: "https://docs.digitalocean.com/reference/api",
    openApiUrl:
      "https://raw.githubusercontent.com/digitalocean/openapi/refs/heads/main/specification/DigitalOcean-public.v2.yaml",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://cloud.digitalocean.com/v1/oauth/authorize",
      tokenUrl: "https://cloud.digitalocean.com/v1/oauth/token",
      scopes: "read write admin",
    },
    keywords: [
      "droplets",
      "volumes",
      "images",
      "snapshots",
      "regions",
      "sizes",
      "ssh_keys",
      "domains",
      "domain_records",
      "certificates",
      "firewalls",
      "load_balancers",
      "projects",
      "tags",
      "vpcs",
      "api key",
    ],
  },
  heroku: {
    name: "heroku",
    apiUrl: "https://api.heroku.com",
    regex: "^.*heroku.*$",
    icon: "heroku",
    docsUrl: "https://devcenter.heroku.com/categories/platform-api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://id.heroku.com/oauth/authorize",
      tokenUrl: "https://id.heroku.com/oauth/token",
      scopes: "global read write read-protected write-protected",
    },
    keywords: [
      "apps",
      "addons",
      "builds",
      "releases",
      "config_vars",
      "formations",
      "dynos",
      "buildpacks",
      "domains",
      "collaborators",
      "keys",
      "account",
      "apps/~/addons",
      "spaces",
      "pipelines",
      "api key",
    ],
  },
  huggingface: {
    name: "huggingface",
    apiUrl: "https://huggingface.co",
    regex: "^.*huggingface.*$",
    icon: "huggingface",
    docsUrl: "https://huggingface.co/docs/hub/en/api",
    preferredAuthType: "apikey",
    keywords: [
      "models",
      "datasets",
      "spaces",
      "parameters",
      "inference",
      "fine-tuning",
      "files",
      "spaces",
      "accounts",
      "groups",
      "api key",
    ],
  },
  circleci: {
    name: "circleci",
    apiUrl: "https://circleci.com/api",
    regex: "^.*circleci.*$",
    icon: "circleci",
    docsUrl: "https://circleci.com/docs/api",
    openApiUrl: "https://circleci.com/api/v2/openapi.json",
    preferredAuthType: "apikey",
    keywords: [
      "pipelines",
      "workflows",
      "jobs",
      "projects",
      "builds",
      "artifacts",
      "environment_variables",
      "contexts",
      "orbs",
      "insights",
      "schedules",
      "checkouts",
      "api key",
    ],
  },
  travisci: {
    name: "travisci",
    apiUrl: "https://api.travis-ci.com",
    regex: "^.*(travis|travis-ci).*$",
    icon: "travisCI",
    docsUrl: "https://docs.travis-ci.com/api",
    preferredAuthType: "apikey",
    keywords: [
      "builds",
      "jobs",
      "repositories",
      "branches",
      "requests",
      "caches",
      "env_vars",
      "settings",
      "logs",
      "stages",
      "beta_features",
      "api key",
    ],
  },
  wordpress: {
    name: "wordpress",
    apiUrl: "https://{your-site.com}/wp-json/wp/v2",
    regex: "^.*wordpress.*$",
    icon: "wordpress",
    docsUrl: "https://developer.wordpress.org/rest-api",
    openApiUrl: "https://developer.wordpress.com/docs/api/",
    preferredAuthType: "apikey",
    keywords: [
      "posts",
      "pages",
      "media",
      "users",
      "categories",
      "tags",
      "comments",
      "taxonomies",
      "types",
      "statuses",
      "settings",
      "themes",
      "plugins",
      "api key",
    ],
  },
  cloudflare: {
    name: "cloudflare",
    apiUrl: "https://api.cloudflare.com",
    regex: "^.*cloudflare.*$",
    icon: "cloudflare",
    docsUrl: "https://developers.cloudflare.com/api",
    openApiUrl:
      "https://raw.githubusercontent.com/cloudflare/api-schemas/refs/heads/main/openapi.json",
    preferredAuthType: "apikey",
    keywords: [
      "zones",
      "dns_records",
      "firewall_rules",
      "page_rules",
      "workers",
      "certificates",
      "load_balancers",
      "rate_limits",
      "waf",
      "analytics",
      "cache",
      "ssl",
      "api key",
    ],
  },
  bigcommerce: {
    name: "bigcommerce",
    apiUrl: "https://api.bigcommerce.com",
    regex: "^.*bigcommerce.*$",
    icon: "bigcommerce",
    docsUrl: "https://developer.bigcommerce.com/docs/rest-management",
    preferredAuthType: "apikey",
    keywords: [
      "products",
      "categories",
      "brands",
      "orders",
      "customers",
      "carts",
      "checkouts",
      "coupons",
      "price_lists",
      "customer_groups",
      "shipping",
      "store_content",
      "themes",
      "api key",
    ],
  },
  woocommerce: {
    name: "woocommerce",
    apiUrl: "https://{yourstore.com}/wp-json/wc/v3",
    regex: "^.*woocommerce.*$",
    icon: "woocommerce",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs",
    preferredAuthType: "apikey",
    keywords: [
      "products",
      "orders",
      "customers",
      "coupons",
      "categories",
      "shipping_classes",
      "tax_classes",
      "payment_gateways",
      "shipping_zones",
      "shipping_methods",
      "product_variations",
      "refunds",
      "reports",
      "api key",
    ],
  },
  prestashop: {
    name: "prestashop",
    apiUrl: "https://{yourstore.com}/api",
    regex: "^.*prestashop.*$",
    icon: "prestashop",
    docsUrl: "https://devdocs.prestashop-project.org/8/webservice",
    preferredAuthType: "apikey",
    keywords: [
      "products",
      "categories",
      "customers",
      "addresses",
      "carts",
      "orders",
      "carriers",
      "countries",
      "currencies",
      "languages",
      "manufacturers",
      "suppliers",
      "stocks",
      "api key",
    ],
  },
  squarespace: {
    name: "squarespace",
    apiUrl: "https://api.squarespace.com",
    regex: "^.*squarespace.*$",
    icon: "squarespace",
    docsUrl: "https://developers.squarespace.com/commerce-apis",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.squarespace.com/api/1/login/oauth/provider/authorize",
      tokenUrl: "https://login.squarespace.com/api/1/login/oauth/provider/tokens",
      scopes:
        "website.products.read website.products.write website.orders.read website.orders.write website.inventory.read website.transactions.read website.store_settings.read email.campaigns.read email.campaigns.send",
    },
    keywords: [
      "products",
      "orders",
      "inventory",
      "transactions",
      "profiles",
      "store_pages",
      "categories",
      "discounts",
      "gift_cards",
      "abandoned_carts",
      "webhooks",
      "oauth",
    ],
  },
  monday: {
    name: "monday",
    apiUrl: "https://api.monday.com/v2",
    regex: "^.*monday.*$",
    icon: "monday",
    docsUrl: "https://developer.monday.com/api-reference/docs",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://auth.monday.com/oauth2/authorize",
      tokenUrl: "https://auth.monday.com/oauth2/token",
      scopes:
        "me:read users:read boards:read boards:write workspaces:read workspaces:write webhooks:write updates:read updates:write assets:read assets:write tags:read teams:read",
    },
    keywords: [
      "boards",
      "items",
      "groups",
      "columns",
      "updates",
      "users",
      "workspaces",
      "tags",
      "files",
      "activities",
      "teams",
      "subitems",
      "graphql",
      "mutations",
      "query",
      "api key",
    ],
  },
  clickup: {
    name: "clickup",
    apiUrl: "https://api.clickup.com/api/v2",
    regex: "^.*clickup.*$",
    icon: "clickup",
    docsUrl: "https://clickup.com/api",
    openApiUrl: "https://developer.clickup.com/openapi/clickup-api-v2-reference.json",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.clickup.com/api",
      tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
      scopes:
        "user:read user:write task:read task:write list:read list:write folder:read folder:write space:read space:write team:read team:write webhook:read webhook:write goal:read goal:write",
    },
    keywords: [
      "tasks",
      "lists",
      "folders",
      "spaces",
      "teams",
      "goals",
      "views",
      "statuses",
      "priorities",
      "tags",
      "custom fields",
      "time tracking",
      "comments",
      "checklists",
      "dependencies",
      "api key",
    ],
  },
  typeform: {
    name: "typeform",
    apiUrl: "https://api.typeform.com",
    regex: "^.*typeform.*$",
    icon: "typeform",
    docsUrl: "https://developer.typeform.com",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://api.typeform.com/oauth/authorize",
      tokenUrl: "https://api.typeform.com/oauth/token",
      scopes:
        "forms:read forms:write responses:read responses:write themes:read themes:write images:read images:write workspaces:read workspaces:write webhooks:read webhooks:write accounts:read offline",
    },
    keywords: [
      "forms",
      "responses",
      "questions",
      "fields",
      "themes",
      "images",
      "workspaces",
      "logic jumps",
      "hidden fields",
      "variables",
      "calculations",
      "insights",
      "reports",
      "oauth",
    ],
  },
  figma: {
    name: "figma",
    apiUrl: "https://api.figma.com",
    regex: "^(.*\\.)?figma\\.com(/.*)?$",
    icon: "figma",
    docsUrl: "https://www.figma.com/developers/api",
    openApiUrl:
      "https://raw.githubusercontent.com/figma/rest-api-spec/refs/heads/main/openapi/openapi.yaml",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.figma.com/oauth",
      tokenUrl: "https://www.figma.com/api/oauth/token",
      scopes:
        "file_read file_write file_dev_resources:read file_dev_resources:write webhooks:write",
    },
    keywords: [
      "files",
      "projects",
      "teams",
      "components",
      "styles",
      "nodes",
      "frames",
      "pages",
      "images",
      "comments",
      "versions",
      "branches",
      "libraries",
      "plugins",
      "oauth",
    ],
  },
  contentful: {
    name: "contentful",
    apiUrl: "https://api.contentful.com",
    regex: "^(.*\\.)?contentful\\.com(/.*)?$",
    icon: "contentful",
    docsUrl: "https://www.contentful.com/developers/docs/references/content-management-api",
    preferredAuthType: "apikey",
    keywords: [
      "spaces",
      "environments",
      "content types",
      "entries",
      "assets",
      "locales",
      "tags",
      "webhooks",
      "roles",
      "api keys",
      "content model",
      "publishing",
      "preview",
      "api key",
    ],
  },
  creatio: {
    name: "creatio",
    apiUrl: "https://<<instance>>.creatio.com/0/odata",
    regex: "^(.*\\.)?creatio\\.com(/.*)?$",
    icon: "default",
    docsUrl:
      "https://academy.creatio.com/docs/developer/integrations_and_api/data_services/odata/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://<<instance>>.creatio.com/0/connect/authorize",
      tokenUrl: "https://<<instance>>.creatio.com/0/connect/token",
      scopes: "offline_access",
      grant_type: "authorization_code",
    },
    systemSpecificInstructions: `Creatio uses OIDC-compliant OAuth endpoints. The standard /ServiceModel/AuthService.svc/Authorize and /rest/oauth/token endpoints are behind IIS session auth and will NOT work for OAuth flows — you MUST use the /0/connect/* OIDC endpoints instead.

To discover the correct endpoints for any Creatio instance, fetch: https://<instance>.creatio.com/0/.well-known/openid-configuration

This returns authorization_endpoint, token_endpoint, and other OIDC URLs.

IMPORTANT — Scopes:
- "offline_access" gets you a refresh token but may not grant API access alone.
- To get actual API access, the user needs the ApplicationAccess scope: "offline_access ApplicationAccess_<GUID>"
- The GUID is found in Creatio: System Designer → Lookups → "OAuth resources" → Name column (strip dashes).
- The OAuth app in Creatio must also have this resource added under its permitted resources.

OAuth App Setup in Creatio:
1. System Designer → "OAuth 2.0 integrated applications" → create app with grant type "On behalf of a user (authorization code)"
2. Set redirect URI to the superglue callback URL
3. Under the app's permitted resources, add the ApplicationAccess resource
4. Note the Client ID and Client Secret

API Base URLs:
- OData 4: https://<instance>.creatio.com/0/odata/ (e.g., /0/odata/Contact)
- OData 3: https://<instance>.creatio.com/0/ServiceModel/EntityDataService.svc/ (e.g., /EntityDataService.svc/ContactCollection)
- Use Bearer token auth: Authorization: Bearer <access_token>`,
    keywords: [
      "contacts",
      "accounts",
      "leads",
      "opportunities",
      "activities",
      "cases",
      "orders",
      "products",
      "invoices",
      "campaigns",
      "crm",
      "bpm",
      "odata",
      "oauth",
    ],
  },
  sanity: {
    name: "sanity",
    apiUrl: "https://api.sanity.io",
    regex: "^(.*\\.)?sanity\\.io(/.*)?$",
    icon: "sanity",
    docsUrl: "https://www.sanity.io/docs/http-api",
    preferredAuthType: "apikey",
    keywords: [
      "documents",
      "datasets",
      "projects",
      "schemas",
      "assets",
      "images",
      "mutations",
      "transactions",
      "groq",
      "listening",
      "history",
      "api key",
    ],
  },
  prismic: {
    name: "prismic",
    apiUrl: "https://api.prismic.io",
    regex: "^(.*\\.)?prismic\\.io(/.*)?$",
    icon: "prismic",
    docsUrl: "https://prismic.io/docs/rest-api",
    preferredAuthType: "apikey",
    keywords: [
      "documents",
      "repositories",
      "custom types",
      "slices",
      "releases",
      "previews",
      "tags",
      "languages",
      "master ref",
      "api key",
    ],
  },
  netlify: {
    name: "netlify",
    apiUrl: "https://api.netlify.com",
    regex: "^(.*\\.)?netlify\\.com(/.*)?$",
    icon: "netlify",
    docsUrl: "https://docs.netlify.com/api/get-started",
    openApiUrl: "https://raw.githubusercontent.com/netlify/open-api/refs/heads/master/swagger.yml",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.netlify.com/authorize",
      tokenUrl: "https://api.netlify.com/oauth/token",
      scopes:
        "user sites deploys dns_zones forms submissions assets functions logs split_tests analytics billing members",
    },
    keywords: [
      "sites",
      "deploys",
      "builds",
      "functions",
      "forms",
      "identity",
      "large media",
      "split tests",
      "analytics",
      "bandwidth",
      "dns zones",
      "ssl certificates",
      "api key",
    ],
  },
  vercel: {
    name: "vercel",
    apiUrl: "https://api.vercel.com",
    regex: "^(.*\\.)?vercel\\.com(/.*)?$",
    icon: "vercel",
    docsUrl: "https://vercel.com/docs/rest-api",
    openApiUrl: "https://openapi.vercel.sh/",
    preferredAuthType: "apikey",
    keywords: [
      "deployments",
      "projects",
      "domains",
      "aliases",
      "secrets",
      "environment variables",
      "teams",
      "logs",
      "certificates",
      "dns",
      "edge config",
      "functions",
      "builds",
      "api key",
    ],
  },
  amplitude: {
    name: "amplitude",
    apiUrl: "https://api.amplitude.com",
    regex: "^(.*\\.)?amplitude\\.com(/.*)?$",
    icon: "amplitude",
    docsUrl: "https://www.docs.developers.amplitude.com",
    preferredAuthType: "apikey",
    keywords: [
      "events",
      "users",
      "cohorts",
      "charts",
      "dashboards",
      "behavioral",
      "properties",
      "segments",
      "funnels",
      "retention",
      "revenue",
      "annotations",
      "export",
      "api key",
    ],
  },
  segment: {
    name: "segment",
    apiUrl: "https://api.segment.com",
    regex: "^(.*\\.)?segment\\.com(/.*)?$",
    icon: "segment",
    docsUrl: "https://segment.com/docs/api",
    preferredAuthType: "apikey",
    keywords: [
      "sources",
      "destinations",
      "tracking",
      "identify",
      "events",
      "traits",
      "warehouses",
      "functions",
      "transformations",
      "audiences",
      "personas",
      "protocols",
      "catalog",
      "api key",
    ],
  },
  mixpanel: {
    name: "mixpanel",
    apiUrl: "https://api.mixpanel.com",
    regex: "^(.*\\.)?mixpanel\\.com(/.*)?$",
    icon: "mixpanel",
    docsUrl: "https://developer.mixpanel.com/reference/overview",
    openApiUrl: "https://developer.mixpanel.com/reference/overview",
    preferredAuthType: "apikey",
    keywords: [
      "events",
      "users",
      "profiles",
      "cohorts",
      "funnels",
      "retention",
      "insights",
      "properties",
      "engage",
      "import",
      "export",
      "jql",
      "query",
      "segmentation",
      "track",
      "api key",
    ],
  },
  algolia: {
    name: "algolia",
    apiUrl: "https://api.algolia.com",
    regex: "^(.*\\.)?algolia\\.com(/.*)?$",
    icon: "algolia",
    docsUrl: "https://www.algolia.com/doc/rest-api/search",
    openApiUrl: "https://www.algolia.com/doc/rest-api/search/",
    preferredAuthType: "apikey",
    keywords: [
      "indices",
      "search",
      "records",
      "objects",
      "facets",
      "filters",
      "ranking",
      "synonyms",
      "rules",
      "api keys",
      "analytics",
      "insights",
      "browse",
      "query",
      "api key",
    ],
  },
  snowflake: {
    name: "snowflake",
    apiUrl: "https://account.snowflakecomputing.com",
    regex: "^(.*\\.)?(snowflake\\.com|snowflakecomputing\\.com)(/.*)?$",
    icon: "snowflake",
    docsUrl: "https://docs.snowflake.com/en/developer-guide/sql-api/index",
    // snowflake stores multiple openapi specs in different files - all here: https://github.com/snowflakedb/snowflake-rest-api-specs
    preferredAuthType: "apikey",
    keywords: [
      "warehouses",
      "databases",
      "schemas",
      "tables",
      "views",
      "stages",
      "pipes",
      "tasks",
      "streams",
      "procedures",
      "functions",
      "roles",
      "users",
      "sql",
      "api key",
    ],
  },
  databricks: {
    name: "databricks",
    apiUrl: "https://{your-workspace}.cloud.databricks.com/api",
    regex: "^(.*\\.)?(databricks\\.com|cloud\\.databricks\\.com)(/.*)?$",
    icon: "databricks",
    // databricks is tricky since the documentation and the oauth changes if you use databricks on aws, gcp or azure
    docsUrl: "https://docs.databricks.com/api/workspace/introduction",
    preferredAuthType: "apikey",
    keywords: [
      "clusters",
      "jobs",
      "notebooks",
      "dbfs",
      "libraries",
      "secrets",
      "tokens",
      "workspace",
      "mlflow",
      "delta",
      "sql endpoints",
      "permissions",
      "groups",
      "api key",
    ],
  },
  looker: {
    name: "looker",
    apiUrl: "https://{your-domain}.looker.com/api",
    regex: "^(.*\\.)?looker\\.com(/.*)?$",
    icon: "looker",
    docsUrl: "https://docs.looker.com/reference/api-and-integration/api-reference",
    openApiUrl:
      "https://raw.githubusercontent.com/looker-open-source/sdk-codegen/refs/heads/main/spec/Looker.4.0.oas.json",
    preferredAuthType: "apikey",
    keywords: [
      "looks",
      "dashboards",
      "explores",
      "models",
      "views",
      "fields",
      "dimensions",
      "measures",
      "folders",
      "spaces",
      "schedules",
      "users",
      "groups",
      "roles",
      "api key",
    ],
  },
  mongodb: {
    name: "mongodb",
    apiUrl: "https://cloud.mongodb.com/api",
    regex: "^(.*\\.)?mongodb\\.com(/.*)?$",
    icon: "mongodb",
    docsUrl: "https://www.mongodb.com/docs/atlas/api",
    preferredAuthType: "apikey",
    keywords: [
      "clusters",
      "databases",
      "collections",
      "documents",
      "indexes",
      "atlas",
      "realm",
      "charts",
      "data lake",
      "search",
      "triggers",
      "backups",
      "alerts",
      "api key",
    ],
  },
  supabase: {
    name: "supabase",
    apiUrl: "https://api.supabase.co",
    regex: "^(.*\\.)?(supabase\\.co|supabase\\.io)(/.*)?$",
    icon: "supabase",
    docsUrl: "https://supabase.com/docs/reference/api",
    openApiUrl: "https://api.supabase.com/api/v1-json",
    preferredAuthType: "apikey",
    keywords: [
      "tables",
      "rows",
      "auth",
      "storage",
      "functions",
      "realtime",
      "rpc",
      "buckets",
      "policies",
      "users",
      "postgrest",
      "select",
      "insert",
      "update",
      "delete",
      "filter",
      "api key",
    ],
  },
  planetscale: {
    name: "planetscale",
    apiUrl: "https://api.planetscale.com",
    regex: "^(.*\\.)?planetscale\\.com(/.*)?$",
    icon: "planetscale",
    docsUrl: "https://api-docs.planetscale.com",
    openApiUrl: "https://api.planetscale.com/v1/openapi-spec",
    preferredAuthType: "apikey",
    keywords: [
      "databases",
      "branches",
      "deploy requests",
      "schemas",
      "backups",
      "passwords",
      "certificates",
      "regions",
      "organizations",
      "audit logs",
      "insights",
      "api key",
    ],
  },
  openai: {
    name: "openai",
    apiUrl: "https://api.openai.com",
    regex: "^.*openai.*$",
    icon: "openai",
    // openai prevents playwright from crawling their page - we manually copied the text to the template doc
    docsUrl: "https://platform.openai.com/docs/api-reference/introduction",
    openApiUrl: "https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml",
    preferredAuthType: "apikey",
    keywords: [
      "completions",
      "chat",
      "models",
      "embeddings",
      "images",
      "audio",
      "files",
      "fine-tuning",
      "assistants",
      "threads",
      "messages",
      "runs",
      "moderation",
      "usage",
      "api key",
    ],
    systemSpecificInstructions: `As of February 2026, these are the available OpenAI API models:

    FLAGSHIP MODELS:
    - gpt-5.2 - Latest and most capable model (recommended for most use cases)
    - gpt-5 - Previous flagship model
    - o4-mini - Optimized reasoning model

    LEGACY MODELS (still available via API):
    - gpt-4o - Being retired from ChatGPT but still available via API
    - gpt-4.1 / gpt-4.1-mini - Previous generation models
    - gpt-4-turbo - Older turbo variant
    - gpt-3.5-turbo - Legacy model for cost-sensitive applications

    SPECIALIZED MODELS:
    - text-embedding-3-large / text-embedding-3-small - For embeddings
    - dall-e-3 - Image generation
    - whisper-1 - Audio transcription
    - tts-1 / tts-1-hd - Text-to-speech
    `,
  },
  anthropic: {
    name: "anthropic",
    apiUrl: "https://api.anthropic.com",
    regex: "^.*anthropic.*$",
    icon: "anthropic",
    docsUrl: "https://docs.anthropic.com/claude/reference",
    preferredAuthType: "apikey",
    keywords: [
      "messages",
      "completions",
      "claude",
      "models",
      "prompts",
      "conversations",
      "tokens",
      "streaming",
      "api key",
    ],
    systemSpecificInstructions: `As of February 2026, these are the available Anthropic Claude API models:

    LATEST MODELS:
    - claude-opus-4-6 - Most intelligent model for agents and coding (200K / 1M beta context, 128K output)
    - claude-sonnet-4-6 - Best speed/intelligence balance (200K / 1M beta context, 64K output)
    - claude-haiku-4-5-20251001 (alias: claude-haiku-4-5) - Fastest model (200K context, 64K output)

    OLDER CLAUDE 4 VERSIONS (still active):
    - claude-sonnet-4-5-20250929 (alias: claude-sonnet-4-5) - Previous Sonnet version
    - claude-opus-4-5-20251101 (alias: claude-opus-4-5) - Previous Opus version
    - claude-opus-4-1-20250805 (alias: claude-opus-4-1) - Earlier Opus version
    - claude-sonnet-4-20250514 (alias: claude-sonnet-4-0) - Original Claude 4 Sonnet
    - claude-opus-4-20250514 (alias: claude-opus-4-0) - Original Claude 4 Opus

    DEPRECATED (retiring Apr 19, 2026):
    - claude-3-haiku-20240307 - Claude 3 Haiku (use claude-haiku-4-5 instead)

    RETIRED (no longer available):
    - claude-3-7-sonnet-20250219 (retired Feb 2026)
    - claude-3-5-haiku-20241022 (retired Feb 2026)
    - claude-3-5-sonnet-* (retired Oct 2025)
    - claude-3-opus-20240229 (retired Jan 2026)
    - claude-2.*, claude-3-sonnet-* (retired Jul 2025)
`,
  },
  pinecone: {
    name: "pinecone",
    apiUrl: "https://api.pinecone.io",
    regex: "^(.*\\.)?pinecone\\.io(/.*)?$",
    icon: "pinecone",
    docsUrl: "https://docs.pinecone.io/reference",
    openApiUrl:
      "https://raw.githubusercontent.com/sigpwned/pinecone-openapi-spec/refs/heads/main/openapi.yml",
    preferredAuthType: "apikey",
    keywords: [
      "indexes",
      "vectors",
      "upsert",
      "collections",
      "namespaces",
      "metadata",
      "embeddings",
      "dimensions",
      "pods",
      "replicas",
      "shards",
      "api key",
    ],
  },
  zoom: {
    name: "zoom",
    apiUrl: "https://api.zoom.us",
    regex: "^(.*\\.)?zoom\\.us(/.*)?$",
    icon: "zoom",
    docsUrl: "https://developers.zoom.us/docs/api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      scopes:
        "user:read user:write meeting:read meeting:write meeting:master recording:read recording:write webinar:read webinar:write chat_message:read chat_message:write chat_channel:read chat_channel:write contact:read report:read report:master dashboard:read",
    },
    keywords: [
      "meetings",
      "webinars",
      "users",
      "recordings",
      "chat",
      "channels",
      "messages",
      "participants",
      "registrants",
      "reports",
      "dashboards",
      "rooms",
      "schedule",
      "join",
      "oauth",
    ],
  },
  microsoft: {
    name: "microsoft",
    apiUrl: "https://graph.microsoft.com",
    regex: "^.*(microsoft|graph\\.microsoft|office|outlook|live\\.com|sharepoint).*$",
    icon: "default",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes:
        "User.Read User.ReadWrite Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Files.ReadWrite Sites.Read.All Sites.ReadWrite.All Teams.ReadBasic.All Chat.Read Chat.ReadWrite ChannelMessage.Read.All offline_access",
    },
    keywords: [
      "users",
      "groups",
      "mail",
      "calendar",
      "contacts",
      "onedrive",
      "sharepoint",
      "teams",
      "planner",
      "tasks",
      "drives",
      "sites",
      "lists",
      "permissions",
      "graph",
      "oauth",
    ],
    systemSpecificInstructions: `Azure App Registration Required: Create an app in Azure Portal → App registrations with redirect URI: https://app.superglue.cloud/api/auth/callback
    Tenant-Specific Endpoints: Multi-tenant apps need tenant ID in OAuth URLs (/04a63d67.../oauth2/v2.0/authorize) instead of /common endpoint
    Credentials Needed: Application (client) ID + Client Secret (generated under Certificates & secrets - copy the Value immediately, not the Secret ID)
    API Permissions: Add Microsoft Graph permissions (e.g., Sites.ReadWrite.All) under API permissions, then grant admin consent if you have admin rights
    Scopes Must Include: Always add offline_access scope to get refresh tokens for long-term access without re-authentication
    `,
  },
  dynamics365_sales: {
    name: "dynamics365_sales",
    apiUrl: "https://<<org>>.crm<<region_number>>.dynamics.com/api/data/v9.2",
    regex: "^.*(crm\\d*\\.dynamics\\.com|dynamicscrm).*$",
    icon: "lucide:square-percent",
    docsUrl:
      "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-data-web-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: "https://<<org>>.crm<<region_number>>.dynamics.com/user_impersonation offline_access",
      grant_type: "authorization_code",
    },
    keywords: [
      "accounts",
      "contacts",
      "leads",
      "opportunities",
      "quotes",
      "salesorders",
      "salesorderdetails",
      "products",
      "incidents",
      "campaigns",
      "invoices",
      "competitors",
      "teams",
      "systemusers",
      "businessunits",
      "odata",
      "dynamics",
      "crm",
      "dynamics 365 sales",
      "dataverse",
      "oauth",
    ],
    systemSpecificInstructions: `Dynamics 365 Sales — Dataverse Web API v9.2

REQUIRED HEADERS (in addition to Authorization):
- OData-MaxVersion: 4.0
- OData-Version: 4.0
- If-None-Match: null (recommended — prevents stale cached data, especially on $expand queries)

QUERY BEHAVIOR:
- $skip is NOT supported. Use @odata.nextLink for pagination (default page size 5000, control with Prefer: odata.maxpagesize=<n>).
- PAGINATION IN SUPERGLUE: Use cursorBased pagination with cursorPath "@odata.nextLink":
  pagination: { type: "cursorBased", pageSize: "5000", cursorPath: "@odata.nextLink" }
  The cursor is a full URL — use <<cursor>> as the step URL (set the initial URL via a "cursor" input variable).
- $apply is supported for aggregations.
- Lookup fields (foreign keys) are named _<field>_value — e.g. _parentaccountid_value, _customerid_value.
- To get formatted/display values (e.g. option set labels, currency formatting), add header: Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"
- FetchXML: GET /api/data/v9.2/<entity>?fetchXml=<url_encoded_xml> for complex aggregations and outer joins that OData $expand cannot express.
- Max URL length is 32KB. For long queries, wrap in a $batch POST request (raises limit to 64KB).
- Max individual OData URL segment is 260 chars — use parameter aliases (@p1=value) to shorten segments.

WRITE SPECIFICS:
- PATCH doubles as an upsert when the target record doesn't exist (by ID or alternate key). Use If-Match: * to prevent accidental creates. Use If-None-Match: * to prevent accidental updates.
- Setting lookups on write: use @odata.bind — e.g. "parentaccountid@odata.bind": "/accounts(<guid>)"
- Disassociating a lookup: set the navigation property to null (without @odata.bind), e.g. "parentcustomerid_account": null

RATE LIMITS (Service Protection):
- 429 Too Many Requests returned when limits exceeded. Always implement Retry-After handling.
- Per-user limits per 5-min window: 6,000 requests, 20 min combined execution time, 52+ concurrent requests.
- These are per web server — actual capacity varies by environment.

DISCOVERING CUSTOM ENTITIES:
GET /api/data/v9.2/EntityDefinitions?$filter=IsCustomEntity eq true&$select=LogicalName,DisplayName
`,
  },
  dynamics365_business_central: {
    name: "dynamics365_business_central",
    apiUrl: "https://api.businesscentral.dynamics.com/v2.0/<<environment>>/api/v2.0",
    regex: "^.*(businesscentral\\.dynamics\\.com|business[\\s\\-]?central).*$",
    icon: "lucide:landmark",
    docsUrl:
      "https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: "https://api.businesscentral.dynamics.com/.default offline_access",
      grant_type: "authorization_code",
    },
    keywords: [
      "customers",
      "vendors",
      "items",
      "salesOrders",
      "salesInvoices",
      "salesQuotes",
      "purchaseOrders",
      "purchaseInvoices",
      "generalLedgerEntries",
      "journals",
      "accounts",
      "employees",
      "dimensions",
      "warehouses",
      "inventory",
      "odata",
      "dynamics",
      "erp",
      "business central",
      "finance",
      "oauth",
    ],
    systemSpecificInstructions: `Dynamics 365 Business Central — API v2.0

COMPANY SCOPING: All entities are scoped under a company. List companies first: GET /api/v2.0/companies, then access entities at /companies(<id>)/<entity>.

WRITE SPECIFICS:
- Updates REQUIRE an If-Match header with the entity's @odata.etag value — omitting it will fail.
- Do NOT insert child records belonging to the same parent in parallel — causes locks. Use $batch to serialize them.
- Transactional $batch: add Isolation: snapshot header for all-or-nothing batch operations. Max 100 operations per $batch.

PAGINATION: Uses @odata.nextLink (a full URL for the next page). In superglue, use offsetBased pagination with $top and $skip since BC supports $skip:
  pagination: { type: "offsetBased", pageSize: "1000" }
  queryParams: { "$top": "<<limit>>", "$skip": "<<offset>>" }

QUERY LIMITS:
- Max page size: 20,000 entities per response (returns 413 if exceeded).
- Max request body size: 350 MB.
- Request timeout: 8 minutes — long-running requests get 408 or 504.
- Use Data-Access-Intent: ReadOnly header on GET requests that don't need latest data (routes to read replica, reduces load).

RATE LIMITS:
- 429 Too Many Requests when limits exceeded. Always implement Retry-After handling.
- Per-user: 6,000 requests per 5-min sliding window, 5 concurrent requests, 100 max connections.

PERFORMANCE GOTCHAS:
- Avoid temp-table-based API pages with >100 records — no caching, poor pagination.
- Calculated/complex fields on API pages are expensive. Prefer stored values.
- API pages/queries are up to 10x faster than SOAP endpoints — always prefer API v2.0.

WEBHOOKS: Supports up to 200 webhook subscriptions for entity change notifications via /subscriptions.

CUSTOM APIs: Publishers expose custom API pages at /api/{publisher}/{group}/{version}/companies(<id>)/<endpoint>, NOT under /api/v2.0/.
`,
  },
  redis: {
    name: "redis",
    apiUrl: "https://app.redislabs.com/api/v1",
    regex: "^(.*\\.)?(redis\\.com|redislabs\\.com|redis\\.io)(/.*)?$",
    icon: "redis",
    docsUrl: "https://docs.redis.com/latest/rc/api",
    openApiUrl: "https://api.redislabs.com/v1/cloud-api-docs",
    preferredAuthType: "apikey",
    keywords: [
      "databases",
      "subscriptions",
      "cloud accounts",
      "regions",
      "modules",
      "persistence",
      "replication",
      "clustering",
      "acl",
      "alerts",
      "backup",
      "api key",
    ],
  },
  elasticsearch: {
    name: "elasticsearch",
    apiUrl: "https://api.elastic.co",
    regex: "^(.*\\.)?elastic\\.co(/.*)?$",
    icon: "elasticsearch",
    docsUrl: "https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-apis.html",
    openApiUrl:
      "https://raw.githubusercontent.com/elastic/elasticsearch-specification/refs/heads/main/output/openapi/elasticsearch-openapi.json",
    preferredAuthType: "apikey",
    keywords: [
      "indices",
      "documents",
      "search",
      "mappings",
      "settings",
      "aliases",
      "templates",
      "clusters",
      "nodes",
      "shards",
      "aggregations",
      "analyzers",
      "pipelines",
      "snapshots",
      "api key",
    ],
  },
  postmark: {
    name: "postmark",
    apiUrl: "https://api.postmarkapp.com",
    regex: "^(.*\\.)?postmarkapp\\.com(/.*)?$",
    icon: "postmark",
    docsUrl: "https://postmarkapp.com/developer",
    preferredAuthType: "apikey",
    keywords: [
      "emails",
      "templates",
      "servers",
      "domains",
      "senders",
      "bounces",
      "message streams",
      "inbound",
      "stats",
      "suppressions",
      "dkim",
      "spf",
      "tracking",
      "api key",
    ],
  },
  sentry: {
    name: "sentry",
    apiUrl: "https://sentry.io/api",
    regex: "^(.*\\.)?sentry\\.io(/.*)?$",
    icon: "sentry",
    docsUrl: "https://docs.sentry.io/api",
    openApiUrl:
      "https://raw.githubusercontent.com/getsentry/sentry-api-schema/refs/heads/main/openapi-derefed.json",
    preferredAuthType: "apikey",
    keywords: [
      "projects",
      "issues",
      "events",
      "releases",
      "organizations",
      "teams",
      "alerts",
      "discover",
      "performance",
      "dashboards",
      "integrations",
      "debug files",
      "source maps",
      "api key",
    ],
  },
  pagerduty: {
    name: "pagerduty",
    apiUrl: "https://api.pagerduty.com",
    regex: "^(.*\\.)?pagerduty\\.com(/.*)?$",
    icon: "pagerduty",
    docsUrl: "https://developer.pagerduty.com/api-reference",
    preferredAuthType: "apikey",
    keywords: [
      "incidents",
      "services",
      "escalation policies",
      "schedules",
      "users",
      "teams",
      "oncalls",
      "alerts",
      "event rules",
      "response plays",
      "analytics",
      "maintenance windows",
      "priorities",
      "api key",
    ],
  },
  datadog: {
    name: "datadog",
    apiUrl: "https://api.datadoghq.com",
    regex: "^(.*\\.)?datadoghq\\.com(/.*)?$",
    icon: "datadog",
    docsUrl: "https://docs.datadoghq.com/api/latest",
    preferredAuthType: "apikey",
    keywords: [
      "metrics",
      "monitors",
      "dashboards",
      "logs",
      "traces",
      "synthetics",
      "events",
      "hosts",
      "tags",
      "downtimes",
      "slos",
      "incidents",
      "notebooks",
      "api key",
    ],
  },
  newrelic: {
    name: "newrelic",
    apiUrl: "https://api.newrelic.com",
    regex: "^(.*\\.)?newrelic\\.com(/.*)?$",
    icon: "newrelic",
    docsUrl: "https://docs.newrelic.com/docs/apis/rest-api-v2",
    preferredAuthType: "apikey",
    keywords: [
      "applications",
      "apm",
      "browser",
      "synthetics",
      "alerts",
      "dashboards",
      "nrql",
      "insights",
      "infrastructure",
      "logs",
      "errors",
      "transactions",
      "deployments",
      "api key",
    ],
  },
  auth0: {
    name: "auth0",
    apiUrl: "https://{your-domain}.auth0.com/api/v2",
    regex: "^.*auth0.*$",
    icon: "auth0",
    docsUrl: "https://auth0.com/docs/api/management/v2",
    openApiUrl: "https://auth0.com/docs/api/management/openapi.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://{your-domain}.auth0.com/authorize",
      tokenUrl: "https://{your-domain}.auth0.com/oauth/token",
      scopes:
        "read:users update:users delete:users create:users read:users_app_metadata update:users_app_metadata delete:users_app_metadata create:users_app_metadata read:user_idp_tokens read:client_grants create:client_grants delete:client_grants update:client_grants read:connections update:connections delete:connections create:connections read:resource_servers",
    },
    keywords: [
      "users",
      "roles",
      "permissions",
      "connections",
      "applications",
      "rules",
      "hooks",
      "actions",
      "organizations",
      "branding",
      "emails",
      "mfa",
      "logs",
      "tenants",
      "oauth",
    ],
  },
  okta: {
    name: "okta",
    apiUrl: "https://{your-domain}.okta.com/api/v1",
    regex: "^(.*\\.)?okta\\.com(/.*)?$",
    icon: "okta",
    docsUrl: "https://developer.okta.com/docs/reference",
    openApiUrl:
      "https://raw.githubusercontent.com/okta/okta-management-openapi-spec/refs/heads/master/dist/2025.01.1/management-minimal.yaml",
    preferredAuthType: "apikey",
    keywords: [
      "users",
      "groups",
      "applications",
      "factors",
      "policies",
      "rules",
      "identity providers",
      "sessions",
      "tokens",
      "events",
      "system logs",
      "schemas",
      "brands",
      "domains",
      "api key",
    ],
  },
  discord: {
    name: "discord",
    apiUrl: "https://discord.com/api",
    regex: "^.*discord.*$",
    icon: "discord",
    docsUrl: "https://discord.com/developers/docs/intro",
    // failed to fetch for some reason...
    openApiUrl:
      "https://raw.githubusercontent.com/discord/discord-api-spec/refs/heads/main/specs/openapi.json",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://discord.com/api/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      scopes:
        "identify email guilds guilds.join connections bot applications.commands applications.commands.update guilds.members.read messages.read webhook.incoming role_connections.write dm_channels.read voice",
    },
    keywords: [
      "guilds",
      "channels",
      "messages",
      "bots",
      "users",
      "members",
      "roles",
      "permissions",
      "emojis",
      "reactions",
      "voice",
      "invites",
      "bans",
      "audit logs",
      "slash commands",
      "interactions",
      "api key",
    ],
  },
  telegram: {
    name: "telegram",
    apiUrl: "https://api.telegram.org",
    regex: "^(.*\\.)?telegram\\.org(/.*)?$",
    icon: "telegram",
    docsUrl: "https://core.telegram.org/bots/api",
    preferredAuthType: "apikey",
    keywords: [
      "messages",
      "chats",
      "updates",
      "inline",
      "keyboards",
      "media",
      "stickers",
      "polls",
      "dice",
      "commands",
      "callbacks",
      "bot api",
      "api key",
    ],
  },
  whatsapp: {
    name: "whatsapp",
    apiUrl: "https://graph.facebook.com",
    regex: "^(.*\\.)?whatsapp\\.com(/.*)?$",
    icon: "whatsapp",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    preferredAuthType: "apikey",
    keywords: [
      "messages",
      "media",
      "contacts",
      "groups",
      "business",
      "templates",
      "interactive",
      "webhooks",
      "phone numbers",
      "profiles",
      "settings",
      "api key",
    ],
  },
  linear: {
    name: "linear",
    apiUrl: "https://api.linear.app/graphql",
    regex: "^(.*\\.)?linear\\.app(/.*)?$",
    icon: "linear",
    docsUrl: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    preferredAuthType: "apikey",
    keywords: [
      "issues",
      "projects",
      "cycles",
      "teams",
      "users",
      "comments",
      "labels",
      "milestones",
      "roadmaps",
      "workflows",
      "states",
      "graphql",
      "mutations",
      "queries",
      "api key",
    ],
  },
  resend: {
    name: "resend",
    apiUrl: "https://api.resend.com",
    regex: "^(.*\\.)?resend\\.com(/.*)?$",
    icon: "resend",
    docsUrl: "https://resend.com/docs/api-reference",
    // problem fetching the yml and converting it to json
    openApiUrl: "https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml",
    preferredAuthType: "apikey",
    keywords: [
      "emails",
      "domains",
      "api keys",
      "contacts",
      "audiences",
      "broadcasts",
      "batch",
      "send",
      "templates",
      "react email",
      "transactional",
      "api key",
    ],
  },
  alphavantage: {
    name: "alphavantage",
    apiUrl: "https://www.alphavantage.co",
    regex: "^.*alphavantage.*$",
    icon: "chart-line",
    docsUrl: "https://www.alphavantage.co/documentation/",
    preferredAuthType: "apikey",
    keywords: [
      "stocks",
      "quote",
      "time series",
      "intraday",
      "daily",
      "weekly",
      "monthly",
      "crypto",
      "forex",
      "commodities",
      "technical indicators",
      "fundamental data",
      "earnings",
      "company overview",
      "market data",
      "financial markets",
      "api key",
    ],
  },
  superglueEmail: {
    name: "superglueEmail",
    apiUrl: "https://api.superglue.cloud/v1/notify/email",
    regex: "^.*api\\.superglue\\.cloud.*$",
    icon: "lucide:mail",
    docsUrl: "https://docs.superglue.cloud/guides/email-service",
    preferredAuthType: "apikey",
    keywords: ["email", "send", "notification", "transactional", "demo", "superglue", "api key"],
  },
  googleAds: {
    name: "googleAds",
    apiUrl: "https://googleads.googleapis.com/v23",
    regex: "^.*(googleads\\.googleapis|developers\\.google\\.com/google-ads|adwords\\.google).*$",
    icon: "googleads",
    docsUrl: "https://developers.google.com/google-ads/api/docs/concepts/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/adwords",
    },
    systemSpecificInstructions: `Google Ads API requires BOTH OAuth AND a developer token on every request.

REQUIRED HEADERS:
- Authorization: Bearer <access_token>
- developer-token: <22-char token from https://ads.google.com/aw/apicenter>
- login-customer-id: <manager-account-id without hyphens> (only when calling through a manager account)

SETUP: User needs a Google Ads Manager account, a Google Cloud project with OAuth credentials, and a developer token (applied for via the API Center). New tokens start as test-only; production access requires a follow-up application.

QUERYING (GAQL): Use Google Ads Query Language via:
- POST /v23/customers/{customerId}/googleAds:searchStream (streaming, recommended)
- POST /v23/customers/{customerId}/googleAds:search (paginated)
Example: SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS`,
    keywords: [
      "campaigns",
      "ad_groups",
      "ads",
      "keywords",
      "GAQL",
      "budgets",
      "bidding",
      "conversions",
      "audiences",
      "extensions",
      "reports",
      "accounts",
      "billing",
      "targeting",
      "search_terms",
      "metrics",
      "segments",
      "oauth",
    ],
  },
  google: {
    name: "google",
    apiUrl: "https://googleapis.com",
    regex:
      "^.*(googleapis\\.com(?!/(?:gmail|drive|calendar|sheets|googleads))|developers\\.google\\.com(?!/(?:gmail|drive|calendar|sheets|google-ads))).*$",
    icon: "google",
    docsUrl: "https://developers.google.com/apis-explorer",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes:
        "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
    },
    keywords: [
      "apis",
      "services",
      "resources",
      "GAQL",
      "methods",
      "scopes",
      "projects",
      "quotas",
      "usage",
      "oauth",
    ],
  },
  posthog: {
    name: "posthog",
    apiUrl: "https://us.posthog.com/api",
    regex: "^.*posthog.*$",
    icon: "posthog",
    docsUrl: "https://posthog.com/docs/api",
    openApiUrl: "https://app.posthog.com/api/schema/",
    preferredAuthType: "apikey",
    keywords: [
      "events",
      "users",
      "products",
      "dashboard",
      "properties",
      "cohorts",
      "funnels",
      "retention",
      "insights",
      "engage",
      "import",
      "export",
      "jql",
      "query",
      "segmentation",
      "track",
      "api key",
    ],
  },
  circleback: {
    name: "circleback",
    apiUrl: "https://app.circleback.ai",
    regex: "^.*circleback.*$",
    icon: "default",
    docsUrl: "https://support.circleback.ai/en/articles/13249081-circleback-mcp",
    preferredAuthType: "oauth",
    systemSpecificInstructions: `Circleback has NO traditional REST API. Data access is exclusively via their MCP server.

MCP ENDPOINT: https://app.circleback.ai/api/mcp
PROTOCOL: JSON-RPC 2.0 over Streamable HTTP transport
AUTH: OAuth 2.0 with dynamic client registration (no app registration needed).

AVAILABLE DATA: meetings, transcripts, action items, calendar events, emails, people, companies.`,
    keywords: [
      "meetings",
      "transcripts",
      "notes",
      "action_items",
      "calendar_events",
      "attendees",
      "summaries",
      "people",
      "companies",
      "emails",
    ],
  },
  firecrawl: {
    name: "firecrawl",
    apiUrl: "https://api.firecrawl.dev/v1",
    regex: "^.*firecrawl.*$",
    icon: "firecrawl",
    docsUrl: "https://docs.firecrawl.dev/api-reference/introduction",
    preferredAuthType: "apikey",
    keywords: ["crawl", "scrape", "extract", "search", "pdf", "web", "html", "markdown", "api key"],
  },
  crawlbase: {
    name: "crawlbase",
    apiUrl: "https://api.crawlbase.com",
    regex: "^.*crawlbase.*$",
    icon: "crawlbase",
    docsUrl: "https://crawlbase.com/docs/crawling-api/",
    preferredAuthType: "apikey",
    keywords: ["crawl", "scrape", "extract", "search", "pdf", "web", "html", "markdown", "api key"],
  },
  procore: {
    name: "procore",
    apiUrl: "https://api.procore.com/rest/",
    regex: "^.*procore.*$",
    icon: "procore",
    docsUrl: "https://developers.procore.com/reference/rest/docs/rest-api-overview",
    openApiUrl:
      "https://raw.githubusercontent.com/procore/open-api-spec/refs/heads/master/pub-api.swagger.json",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.procore.com/oauth/authorize",
      tokenUrl: "https://login.procore.com/oauth/token",
      scopes: "",
    },
    systemSpecificInstructions: `Setup: 1) Create app at developers.procore.com → My Apps → Create New App. 2) Add a "Data Connector Component" with User-level Authentication, then create a version. 3) Under OAuth Credentials, set the Redirect URI to the superglue callback URL (e.g. https://app.superglue.cloud/api/auth/callback). 4) Copy the Client ID and Client Secret — these are the only credentials superglue needs. For sandbox testing, use login-sandbox.procore.com for auth and sandbox.procore.com for API calls instead of the production URLs. The app must be installed on the target company before API calls will work (via the Developer Portal for sandbox, or the App Marketplace for production). Procore does not use granular OAuth scopes — access is controlled by the app's component permissions in the Developer Portal.

IMPORTANT: Sandbox and production use completely separate credentials and base URLs — never mix them. Sandbox: login-sandbox.procore.com (auth) + sandbox.procore.com (API). Production: login.procore.com (auth) + api.procore.com (API). OAuth scopes must be left empty — Procore does not accept standard OAuth scope strings and will return an "invalid scope" error. All API requests require a Procore-Company-Id header with the numeric company ID (visible in the browser URL when logged into Procore, e.g. {domain}/{company_id}/...), and the app must be explicitly installed/connected to that company before any API calls will succeed. The REST API base path is /rest/v1.0/ and most resources are nested under /companies/{company_id}/ or /projects/{project_id}/. Procore has both v1.0 (/rest/v1.0/) and v2.0 (/rest/v2.0/) APIs. Most resources exist in both, but new resources (e.g. RFIs) are v2-only. Check the API reference for which version applies to each endpoint. To get started, call /rest/v1.0/me to verify authentication and /rest/v1.0/companies/{company_id}/projects to list available projects.`,
    keywords: [
      "projects",
      "rfis",
      "submittals",
      "drawings",
      "documents",
      "punch items",
      "observations",
      "inspections",
      "incidents",
      "daily logs",
      "budgets",
      "commitments",
      "change orders",
      "prime contracts",
      "purchase orders",
      "schedule",
      "directory",
      "photos",
      "specifications",
      "meetings",
      "tasks",
      "timesheets",
      "oauth",
    ],
  },
  gemini: {
    name: "gemini",
    apiUrl:
      "https://generativelanguage.googleapis.com/v1beta/models/{model_string}:generateContent?key={your-api-key}",
    regex: "^.*(gemini|generativelanguage)\\.googleapis\\.com.*$",
    icon: "gemini",
    docsUrl: "https://ai.google.dev/api",
    // there is a openapi spec here: https://generativelanguage.googleapis.com/$discovery/OPENAPI3_0?version=v1beta&key=$GOOGLE_API_KEY - but you need your own google api key to access it
    preferredAuthType: "apikey",
  },
  tableau: {
    name: "tableau",
    apiUrl: "https://{your-server}.online.tableau.com",
    regex: "^.*(tableau\\.com|online\\.tableau).*$",
    icon: "lucide:plus",
    docsUrl: "https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api.htm",
    preferredAuthType: "apikey",
    keywords: [
      "workbooks",
      "views",
      "datasources",
      "projects",
      "users",
      "groups",
      "permissions",
      "sheets",
      "published data sources",
      "sites",
      "jobs",
      "favorites",
      "flows",
      "metrics",
      "webhooks",
      "connected apps",
      "jwt",
      "vizql",
      "row-level security",
    ],
    systemSpecificInstructions: `Tableau supports two Connected App authentication methods:
1. **Direct Trust**: Requires client_id, secret_id, and secret_value — you generate and sign JWTs yourself
2. **OAuth 2.0**: Standard OAuth flow with client_id and client_secret

DIRECT TRUST CREDENTIALS (from Settings > Connected Apps):
- tableau_url: Server URL (e.g., https://prod-uk-a.online.tableau.com)
- tableau_site_id: The content URL from browser (e.g., "mysite" from /site/mysite/)
- tableau_client_id: Connected App ID
- tableau_secret_id: The key ID you generated
- tableau_client_secret: The secret value (only shown once when created)

DIRECT TRUST AUTH FLOW:
1. Generate a JWT signed with HMAC-SHA256 using the secret value. Include:
   - Header: { alg: "HS256", typ: "JWT", kid: secret_id, iss: client_id }
   - Payload: { iss: client_id, sub: "<username>", aud: "tableau", exp: <now+600>, jti: <uuid>, scp: ["tableau:content:read", "tableau:query:run"] }
2. Exchange JWT for access token: POST /api/3.24/auth/signin with body: { credentials: { jwt: "<token>", site: { contentUrl: "<site_id>" } } }
3. Use the returned token in X-Tableau-Auth header for all subsequent requests

AVAILABLE APIs:
- REST API (/api/3.24/...): Management & metadata — list datasources, workbooks, users, download view/dashboard data
- Metadata API: GraphQL for relationships and lineage
- VizQL Data Service (/api/v1/vizql-data-service/query-datasource): Query datasource rows directly

ROW-LEVEL SECURITY: The JWT's "sub" claim determines which user's permissions apply. Data is automatically filtered based on that user's access.

SUPERGLUE EXAMPLE - JWT generation in a transform step (Direct Trust):
\`\`\`javascript
(data) => {
  const creds = data._credentials || {};
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: creds.tableau_secret_id, iss: creds.tableau_client_id }));
  const payload = base64url(JSON.stringify({ iss: creds.tableau_client_id, sub: data.username, aud: 'tableau', exp: now + 600, jti: crypto.randomUUID(), scp: ['tableau:content:read', 'tableau:query:run'] }));
  const signature = crypto.createHmac('sha256', creds.tableau_client_secret).update(header + '.' + payload).digest('base64url');
  return { jwt: header + '.' + payload + '.' + signature };
};
\`\`\`

EXAMPLE WORKFLOWS:
- Generate JWT → Sign in → List datasources → Query via VizQL Data Service
- Generate JWT → Sign in → Get workbook → Download view/dashboard data as CSV/PDF`,
  },
};

export const systemOptions = [
  { value: "manual", label: "Custom API", icon: "default" },
  ...Object.entries(systems).map(([key, system]) => ({
    value: key,
    label: key
      .replace(/([A-Z])/g, " $1") // Add space before capital letters
      .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
      .trim(), // Remove leading space
    icon: system.icon || "default",
  })),
];

/**
 * Find matching template for a System object.
 * Priority order: templateName > id > id with numeric suffix stripped > name > urlHost regex match
 * @param system - System object with templateName, id, name, and/or url
 * @returns The matching template key and config, or null if no match found
 */
export function findTemplateForSystem(
  system: Partial<System>,
): { key: string; template: SystemConfig } | null {
  // 1. Direct lookup via stored templateName (highest priority)
  if (system.templateName && systems[system.templateName]) {
    return { key: system.templateName, template: systems[system.templateName] };
  }

  // 2. Direct lookup by system ID
  if (system.id && systems[system.id]) {
    return { key: system.id, template: systems[system.id] };
  }

  // 3. Try ID with numeric suffix stripped (e.g., "firebase-1" -> "firebase")
  if (system.id) {
    const baseId = system.id.replace(/-\d+$/, "");
    if (baseId !== system.id && systems[baseId]) {
      return { key: baseId, template: systems[baseId] };
    }
  }

  // 4. Try by name (lowercase)
  if (system.name && systems[system.name]) {
    return { key: system.name, template: systems[system.name] };
  }

  // 5. URL regex matching (lowest priority)
  if (system.url) {
    // Ensure URL has a scheme for proper matching
    const urlForMatching =
      system.url.startsWith("http") || system.url.startsWith("postgres")
        ? system.url
        : `https://${system.url}`;

    const matches: { key: string; template: SystemConfig; specificity: number }[] = [];

    for (const [key, template] of Object.entries(systems)) {
      try {
        if (new RegExp(template.regex).test(urlForMatching)) {
          // Calculate specificity: longer, more specific regexes get higher scores
          const specificity = template.regex.length + (template.regex.includes("(?!") ? 100 : 0);
          matches.push({ key, template, specificity });
        }
      } catch (e) {
        console.error(`Invalid regex pattern for system: ${key}`);
      }
    }

    if (matches.length > 0) {
      // Return the most specific match (highest specificity score)
      const bestMatch = matches.sort((a, b) => b.specificity - a.specificity)[0];
      return { key: bestMatch.key, template: bestMatch.template };
    }
  }

  return null;
}

export function uniqueKeywords(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  return [...new Set(keywords)];
}

export function enrichWithTemplate(input: System): System {
  const match = findTemplateForSystem(input);

  if (!match) {
    return input;
  }

  const { key: templateKey, template: matchingTemplate } = match;

  const mergedUniqueKeywords = uniqueKeywords([
    ...(input.documentationKeywords || []),
    ...(matchingTemplate.keywords || []),
  ]);

  input.openApiUrl = input.openApiUrl || matchingTemplate.openApiUrl;
  input.openApiSchema = input.openApiSchema || matchingTemplate.openApiSchema;
  input.documentationUrl = input.documentationUrl || matchingTemplate.docsUrl;
  input.url = input.url || matchingTemplate.apiUrl;
  input.documentationKeywords = mergedUniqueKeywords;
  if (!input.templateName) {
    input.templateName = templateKey;
  }
  return input;
}

/**
 * Get OAuth configuration for a system
 * @param systemKey - The key of the system
 * @returns OAuth config or null if not available
 */
export function getOAuthConfig(systemKey: string): SystemConfig["oauth"] | null {
  return systems[systemKey]?.oauth || null;
}

/**
 * Get OAuth token exchange configuration for a system
 * Priority: system credentials > template config > defaults
 * @param system - The system object
 * @returns Token exchange config
 */
export function getOAuthTokenExchangeConfig(system: System): {
  tokenAuthMethod?: "body" | "basic_auth";
  tokenContentType?: "form" | "json";
  extraHeaders?: Record<string, string>;
} {
  const creds = system.credentials || {};

  // Parse extraHeaders if stored as JSON string
  let extraHeaders: Record<string, string> | undefined;
  if (creds.extraHeaders) {
    try {
      extraHeaders =
        typeof creds.extraHeaders === "string"
          ? JSON.parse(creds.extraHeaders)
          : creds.extraHeaders;
    } catch {
      extraHeaders = undefined;
    }
  }

  const storedConfig = {
    tokenAuthMethod: creds.tokenAuthMethod as "body" | "basic_auth" | undefined,
    tokenContentType: creds.tokenContentType as "form" | "json" | undefined,
    extraHeaders,
  };

  // Get template config as fallback
  const match = findTemplateForSystem(system);
  const templateOAuth = match?.template.oauth;

  return {
    tokenAuthMethod: storedConfig.tokenAuthMethod ?? templateOAuth?.tokenAuthMethod,
    tokenContentType: storedConfig.tokenContentType ?? templateOAuth?.tokenContentType,
    extraHeaders: storedConfig.extraHeaders ?? templateOAuth?.extraHeaders,
  };
}

/**
 * Get OAuth token URL for a system
 * @param system - The system object with credentials and URL info
 * @returns The token URL for OAuth token exchange
 */
export function getOAuthTokenUrl(system: System): string {
  // First priority: User-provided token URL in credentials
  if (system.credentials?.token_url) {
    return system.credentials.token_url;
  }

  // Second priority: Template lookup (templateName > id > urlHost)
  const match = findTemplateForSystem(system);
  if (match?.template.oauth?.tokenUrl) {
    return match.template.oauth.tokenUrl;
  }

  // Fallback: Default OAuth token endpoint
  if (!system.url) {
    throw new Error(
      `Cannot determine OAuth token URL for system ${system.id}: no url or token_url provided`,
    );
  }

  // Extract host from url
  try {
    const urlObj = new URL(system.url.startsWith("http") ? system.url : `https://${system.url}`);
    return `${urlObj.origin}/oauth/token`;
  } catch {
    return `${system.url}/oauth/token`;
  }
}
