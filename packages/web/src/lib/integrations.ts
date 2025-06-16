export const integrations: Record<string, {
  apiUrl: string;
  regex: string;
  icon: string;
  docsUrl: string;
}> = {
  stripe: {
    apiUrl: "https://api.stripe.com",
    regex: "^(.*\\.)?stripe\\.com(/.*)?$",
    icon: "stripe",
    docsUrl: "https://stripe.com/docs/api"
  },
  shopify: {
    apiUrl: "https://admin.shopify.com",
    regex: "^.*\\.myshopify\\.com(/.*)?$",
    icon: "shopify",
    docsUrl: "https://shopify.dev/docs/api"
  },
  hubspot: {
    apiUrl: "https://api.hubapi.com/crm/v3",
    regex: "^(.*\\.)?hubapi\\.com(/.*)?$",
    icon: "hubspot",
    docsUrl: "https://developers.hubspot.com/docs/api/overview"
  },
  twilio: {
    apiUrl: "https://api.twilio.com",
    regex: "^(.*\\.)?twilio\\.com(/.*)?$",
    icon: "twilio",
    docsUrl: "https://www.twilio.com/docs/api"
  },
  sendgrid: {
    apiUrl: "https://api.sendgrid.com",
    regex: "^(.*\\.)?sendgrid\\.com(/.*)?$",
    icon: "sendgrid",
    docsUrl: "https://docs.sendgrid.com/api-reference"
  },
  github: {
    apiUrl: "https://api.github.com",
    regex: "^(.*\\.)?github\\.com(/.*)?$",
    icon: "github",
    docsUrl: "https://docs.github.com/en/rest"
  },
  gitlab: {
    apiUrl: "https://api.gitlab.com",
    regex: "^(.*\\.)?gitlab\\.com(/.*)?$",
    icon: "gitlab",
    docsUrl: "https://docs.gitlab.com/ee/api/"
  },
  bitbucket: {
    apiUrl: "https://api.bitbucket.org",
    regex: "^(.*\\.)?bitbucket\\.org(/.*)?$",
    icon: "bitbucket",
    docsUrl: "https://developer.atlassian.com/cloud/bitbucket/rest"
  },
  slack: {
    apiUrl: "https://api.slack.com",
    regex: "^(.*\\.)?slack\\.com(/.*)?$",
    icon: "slack",
    docsUrl: "https://api.slack.com/docs"
  },
  airtable: {
    apiUrl: "https://api.airtable.com",
    regex: "^(.*\\.)?airtable\\.com(/.*)?$",
    icon: "airtable",
    docsUrl: "https://airtable.com/developers/web/api"
  },
  google: {
    apiUrl: "https://googleapis.com",
    regex: "^(.*\\.)?google\\.com(/.*)?$",
    icon: "google",
    docsUrl: "https://developers.google.com/apis-explorer"
  },
  googleAnalytics: {
    apiUrl: "https://analytics.google.com",
    regex: "^(.*\\.)?analytics\\.google\\.com(/.*)?$",
    icon: "googleAnalytics",
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1"
  },
  youtube: {
    apiUrl: "https://youtube.googleapis.com",
    regex: "^(.*\\.)?youtube\\.com(/.*)?$",
    icon: "youtube",
    docsUrl: "https://developers.google.com/youtube/v3/docs"
  },
  aws: {
    apiUrl: "https://amazonaws.com",
    regex: "^(.*\\.)?amazonaws\\.com(/.*)?$",
    icon: "amazonAWS",
    docsUrl: "https://docs.aws.amazon.com/index.html"
  },
  googleCloud: {
    apiUrl: "https://cloud.google.com",
    regex: "^(.*\\.)?cloud\\.google\\.com(/.*)?$",
    icon: "googleCloud",
    docsUrl: "https://cloud.google.com/apis/docs/overview"
  },
  firebase: {
    apiUrl: "https://firestore.googleapis.com",
    regex: "^(.*\\.)?firebase\\.google\\.com(/.*)?$",
    icon: "firebase",
    docsUrl: "https://firebase.google.com/docs/reference"
  },
  salesforce: {
    apiUrl: "https://api.salesforce.com",
    regex: "^(.*\\.)?salesforce\\.com(/.*)?$",
    icon: "salesforce",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm"
  },
  facebook: {
    apiUrl: "https://graph.facebook.com",
    regex: "^(.*\\.)?facebook\\.com(/.*)?$",
    icon: "facebook",
    docsUrl: "https://developers.facebook.com/docs/graph-api"
  },
  instagram: {
    apiUrl: "https://api.instagram.com",
    regex: "^(.*\\.)?instagram\\.com(/.*)?$",
    icon: "instagram",
    docsUrl: "https://developers.facebook.com/docs/instagram-api"
  },
  twitter: {
    apiUrl: "https://api.twitter.com",
    regex: "^(.*\\.)?twitter\\.com(/.*)?$",
    icon: "twitter",
    docsUrl: "https://developer.twitter.com/en/docs/twitter-api"
  },
  linkedin: {
    apiUrl: "https://api.linkedin.com",
    regex: "^(.*\\.)?linkedin\\.com(/.*)?$",
    icon: "linkedin",
    docsUrl: "https://developer.linkedin.com/docs"
  },
  paypal: {
    apiUrl: "https://api.paypal.com",
    regex: "^(.*\\.)?paypal\\.com(/.*)?$",
    icon: "paypal",
    docsUrl: "https://developer.paypal.com/api/rest"
  },
  braintree: {
    apiUrl: "https://api.braintreegateway.com",
    regex: "^(.*\\.)?braintree\\.com(/.*)?$",
    icon: "braintree",
    docsUrl: "https://developer.paypal.com/braintree/docs"
  },
  square: {
    apiUrl: "https://connect.squareup.com",
    regex: "^(.*\\.)?square\\.com(/.*)?$",
    icon: "square",
    docsUrl: "https://developer.squareup.com/reference/square"
  },
  adyen: {
    apiUrl: "https://checkout-test.adyen.com",
    regex: "^(.*\\.)?adyen\\.com(/.*)?$",
    icon: "adyen",
    docsUrl: "https://docs.adyen.com/api-explorer"
  },
  razorpay: {
    apiUrl: "https://api.razorpay.com",
    regex: "^(.*\\.)?razorpay\\.com(/.*)?$",
    icon: "razorpay",
    docsUrl: "https://razorpay.com/docs/api"
  },
  plaid: {
    apiUrl: "https://production.plaid.com",
    regex: "^(.*\\.)?plaid\\.com(/.*)?$",
    icon: "plaid",
    docsUrl: "https://plaid.com/docs/api"
  },
  zendesk: {
    apiUrl: "https://api.zendesk.com",
    regex: "^(.*\\.)?zendesk\\.com(/.*)?$",
    icon: "zendesk",
    docsUrl: "https://developer.zendesk.com/api-reference"
  },
  freshdesk: {
    apiUrl: "https://{domain}.freshdesk.com/api/v2",
    regex: "^(.*\\.)?freshdesk\\.com(/.*)?$",
    icon: "freshdesk",
    docsUrl: "https://developers.freshdesk.com/api"
  },
  freshworks: {
    apiUrl: "https://{domain}.freshservice.com/api/v2",
    regex: "^(.*\\.)?freshservice\\.com(/.*)?$",
    icon: "freshworks",
    docsUrl: "https://api.freshservice.com"
  },
  servicenow: {
    apiUrl: "https://{instance}.service-now.com/api",
    regex: "^(.*\\.)?servicenow\\.com(/.*)?$",
    icon: "servicenow",
    docsUrl: "https://developer.servicenow.com/dev.do#!/reference/api/latest/rest"
  },
  helpscout: {
    apiUrl: "https://api.helpscout.net",
    regex: "^(.*\\.)?helpscout\\.net(/.*)?$",
    icon: "helpscout",
    docsUrl: "https://developer.helpscout.com/mailbox-api"
  },
  dropbox: {
    apiUrl: "https://api.dropboxapi.com",
    regex: "^(.*\\.)?dropbox\\.com(/.*)?$",
    icon: "dropbox",
    docsUrl: "https://www.dropbox.com/developers/documentation/http/documentation"
  },
  mailchimp: {
    apiUrl: "https://api.mailchimp.com",
    regex: "^(.*\\.)?mailchimp\\.com(/.*)?$",
    icon: "mailchimp",
    docsUrl: "https://mailchimp.com/developer/marketing/api"
  },
  constantcontact: {
    apiUrl: "https://api.constantcontact.com",
    regex: "^(.*\\.)?constantcontact\\.com(/.*)?$",
    icon: "constantcontact",
    docsUrl: "https://developer.constantcontact.com/api_reference.html"
  },
  jira: {
    apiUrl: "https://{your-domain}.atlassian.net/rest/api",
    regex: "^(.*\\.)?jira\\.com(/.*)?$",
    icon: "jira",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3"
  },
  atlassian: {
    apiUrl: "https://api.atlassian.com",
    regex: "^(.*\\.)?atlassian\\.com(/.*)?$",
    icon: "atlassian",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3"
  },
  confluence: {
    apiUrl: "https://{your-domain}.atlassian.net/wiki/rest/api",
    regex: "^(.*\\.)?confluence\\.com(/.*)?$",
    icon: "confluence",
    docsUrl: "https://developer.atlassian.com/cloud/confluence/rest"
  },
  quickbooks: {
    apiUrl: "https://quickbooks.api.intuit.com",
    regex: "^(.*\\.)?quickbooks\\.com(/.*)?$",
    icon: "quickbooks",
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account"
  },
  xero: {
    apiUrl: "https://api.xero.com",
    regex: "^(.*\\.)?xero\\.com(/.*)?$",
    icon: "xero",
    docsUrl: "https://developer.xero.com/documentation/api/api-overview"
  },
  docusign: {
    apiUrl: "https://api.docusign.com",
    regex: "^(.*\\.)?docusign\\.com(/.*)?$",
    icon: "docusign",
    docsUrl: "https://developers.docusign.com/docs/esign-rest-api"
  },
  intercom: {
    apiUrl: "https://api.intercom.io",
    regex: "^(.*\\.)?intercom\\.com(/.*)?$",
    icon: "intercom",
    docsUrl: "https://developers.intercom.com/intercom-api-reference"
  },
  marketo: {
    apiUrl: "https://{instance-id}.mktorest.com",
    regex: "^(.*\\.)?marketo\\.com(/.*)?$",
    icon: "marketo",
    docsUrl: "https://developers.marketo.com/rest-api"
  },
  asana: {
    apiUrl: "https://app.asana.com/api",
    regex: "^(.*\\.)?asana\\.com(/.*)?$",
    icon: "asana",
    docsUrl: "https://developers.asana.com/docs"
  },
  trello: {
    apiUrl: "https://api.trello.com",
    regex: "^(.*\\.)?trello\\.com(/.*)?$",
    icon: "trello",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest"
  },
  notion: {
    apiUrl: "https://api.notion.com",
    regex: "^(.*\\.)?notion\\.so(/.*)?$",
    icon: "notion",
    docsUrl: "https://developers.notion.com"
  },
  digitalocean: {
    apiUrl: "https://api.digitalocean.com",
    regex: "^(.*\\.)?digitalocean\\.com(/.*)?$",
    icon: "digitalocean",
    docsUrl: "https://docs.digitalocean.com/reference/api"
  },
  heroku: {
    apiUrl: "https://api.heroku.com",
    regex: "^(.*\\.)?heroku\\.com(/.*)?$",
    icon: "heroku",
    docsUrl: "https://devcenter.heroku.com/categories/platform-api"
  },
  circleci: {
    apiUrl: "https://circleci.com/api",
    regex: "^(.*\\.)?circleci\\.com(/.*)?$",
    icon: "circleci",
    docsUrl: "https://circleci.com/docs/api"
  },
  travisci: {
    apiUrl: "https://api.travis-ci.com",
    regex: "^(.*\\.)?travis-ci\\.com(/.*)?$",
    icon: "travisCI",
    docsUrl: "https://docs.travis-ci.com/api"
  },
  wordpress: {
    apiUrl: "https://{your-site.com}/wp-json/wp/v2",
    regex: "^(.*\\.)?wordpress\\.com(/.*)?$",
    icon: "wordpress",
    docsUrl: "https://developer.wordpress.org/rest-api"
  },
  cloudflare: {
    apiUrl: "https://api.cloudflare.com",
    regex: "^(.*\\.)?cloudflare\\.com(/.*)?$",
    icon: "cloudflare",
    docsUrl: "https://developers.cloudflare.com/api"
  },
  bigcommerce: {
    apiUrl: "https://api.bigcommerce.com",
    regex: "^(.*\\.)?bigcommerce\\.com(/.*)?$",
    icon: "bigcommerce",
    docsUrl: "https://developer.bigcommerce.com/docs/rest-management"
  },
  woocommerce: {
    apiUrl: "https://{yourstore.com}/wp-json/wc/v3",
    regex: "^(.*\\.)?woocommerce\\.com(/.*)?$",
    icon: "woocommerce",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs"
  },
  prestashop: {
    apiUrl: "https://{yourstore.com}/api",
    regex: "^(.*\\.)?prestashop\\.com(/.*)?$",
    icon: "prestashop",
    docsUrl: "https://devdocs.prestashop-project.org/8/webservice"
  },
  squarespace: {
    apiUrl: "https://api.squarespace.com",
    regex: "^(.*\\.)?squarespace\\.com(/.*)?$",
    icon: "squarespace",
    docsUrl: "https://developers.squarespace.com/commerce-apis"
  },
  monday: {
    apiUrl: "https://api.monday.com/v2",
    regex: "^(.*\\.)?monday\\.com(/.*)?$",
    icon: "monday",
    docsUrl: "https://developer.monday.com/api-reference/docs"
  },
  clickup: {
    apiUrl: "https://api.clickup.com/api/v2",
    regex: "^(.*\\.)?clickup\\.com(/.*)?$",
    icon: "clickup",
    docsUrl: "https://clickup.com/api"
  },
  typeform: {
    apiUrl: "https://api.typeform.com",
    regex: "^(.*\\.)?typeform\\.com(/.*)?$",
    icon: "typeform",
    docsUrl: "https://developer.typeform.com"
  },
  figma: {
    apiUrl: "https://api.figma.com",
    regex: "^(.*\\.)?figma\\.com(/.*)?$",
    icon: "figma",
    docsUrl: "https://www.figma.com/developers/api"
  },
  contentful: {
    apiUrl: "https://api.contentful.com",
    regex: "^(.*\\.)?contentful\\.com(/.*)?$",
    icon: "contentful",
    docsUrl: "https://www.contentful.com/developers/docs/references/content-management-api"
  },
  sanity: {
    apiUrl: "https://api.sanity.io",
    regex: "^(.*\\.)?sanity\\.io(/.*)?$",
    icon: "sanity",
    docsUrl: "https://www.sanity.io/docs/http-api"
  },
  prismic: {
    apiUrl: "https://api.prismic.io",
    regex: "^(.*\\.)?prismic\\.io(/.*)?$",
    icon: "prismic",
    docsUrl: "https://prismic.io/docs/rest-api"
  },
  netlify: {
    apiUrl: "https://api.netlify.com",
    regex: "^(.*\\.)?netlify\\.com(/.*)?$",
    icon: "netlify",
    docsUrl: "https://docs.netlify.com/api/get-started"
  },
  vercel: {
    apiUrl: "https://api.vercel.com",
    regex: "^(.*\\.)?vercel\\.com(/.*)?$",
    icon: "vercel",
    docsUrl: "https://vercel.com/docs/rest-api"
  },
  amplitude: {
    apiUrl: "https://api.amplitude.com",
    regex: "^(.*\\.)?amplitude\\.com(/.*)?$",
    icon: "amplitude",
    docsUrl: "https://www.docs.developers.amplitude.com"
  },
  segment: {
    apiUrl: "https://api.segment.com",
    regex: "^(.*\\.)?segment\\.com(/.*)?$",
    icon: "segment",
    docsUrl: "https://segment.com/docs/api"
  },
  mixpanel: {
    apiUrl: "https://api.mixpanel.com",
    regex: "^(.*\\.)?mixpanel\\.com(/.*)?$",
    icon: "mixpanel",
    docsUrl: "https://developer.mixpanel.com/reference/overview"
  },
  algolia: {
    apiUrl: "https://api.algolia.com",
    regex: "^(.*\\.)?algolia\\.com(/.*)?$",
    icon: "algolia",
    docsUrl: "https://www.algolia.com/doc/rest-api/search"
  },
  snowflake: {
    apiUrl: "https://account.snowflakecomputing.com",
    regex: "^(.*\\.)?snowflake\\.com(/.*)?$",
    icon: "snowflake",
    docsUrl: "https://docs.snowflake.com/en/developer-guide/sql-api/index"
  },
  databricks: {
    apiUrl: "https://{your-workspace}.cloud.databricks.com/api",
    regex: "^(.*\\.)?databricks\\.com(/.*)?$",
    icon: "databricks",
    docsUrl: "https://docs.databricks.com/dev-tools/api/latest/index.html"
  },
  looker: {
    apiUrl: "https://{your-domain}.looker.com/api",
    regex: "^(.*\\.)?looker\\.com(/.*)?$",
    icon: "looker",
    docsUrl: "https://docs.looker.com/reference/api-and-integration/api-reference"
  },
  mongodb: {
    apiUrl: "https://cloud.mongodb.com/api",
    regex: "^(.*\\.)?mongodb\\.com(/.*)?$",
    icon: "mongodb",
    docsUrl: "https://www.mongodb.com/docs/atlas/api"
  },
  supabase: {
    apiUrl: "https://api.supabase.co",
    regex: "^(.*\\.)?supabase\\.co(/.*)?$",
    icon: "supabase",
    docsUrl: "https://supabase.com/docs/reference/api"
  },
  planetscale: {
    apiUrl: "https://api.planetscale.com",
    regex: "^(.*\\.)?planetscale\\.com(/.*)?$",
    icon: "planetscale",
    docsUrl: "https://api-docs.planetscale.com"
  },
  openai: {
    apiUrl: "https://api.openai.com",
    regex: "^(.*\\.)?openai\\.com(/.*)?$",
    icon: "openai",
    docsUrl: "https://platform.openai.com/docs/api-reference"
  },
  anthropic: {
    apiUrl: "https://api.anthropic.com",
    regex: "^(.*\\.)?anthropic\\.com(/.*)?$",
    icon: "anthropic",
    docsUrl: "https://docs.anthropic.com/claude/reference"
  },
  pinecone: {
    apiUrl: "https://api.pinecone.io",
    regex: "^(.*\\.)?pinecone\\.io(/.*)?$",
    icon: "pinecone",
    docsUrl: "https://docs.pinecone.io/reference"
  },
  zoom: {
    apiUrl: "https://api.zoom.us",
    regex: "^(.*\\.)?zoom\\.us(/.*)?$",
    icon: "zoom",
    docsUrl: "https://developers.zoom.us/docs/api"
  },
  microsoft: {
    apiUrl: "https://graph.microsoft.com",
    regex: "^(.*\\.)?microsoft\\.com(/.*)?$",
    icon: "microsoft",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/overview"
  },
  microsoftDynamics: {
    apiUrl: "https://api.dynamics.com",
    regex: "^(.*\\.)?dynamics\\.com(/.*)?$",
    icon: "microsoftDynamics365",
    docsUrl: "https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/data-entities-data-packages"
  },
  microsoftOffice: {
    apiUrl: "https://graph.microsoft.com",
    regex: "^(.*\\.)?office\\.com(/.*)?$",
    icon: "microsoftOffice",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/office365"
  },
  microsoftOutlook: {
    apiUrl: "https://graph.microsoft.com",
    regex: "^(.*\\.)?outlook\\.com(/.*)?$",
    icon: "microsoftOutlook",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview"
  },
  microsoftSharepoint: {
    apiUrl: "https://graph.microsoft.com",
    regex: "^(.*\\.)?sharepoint\\.com(/.*)?$",
    icon: "microsoftSharepoint",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/sharepoint"
  },
  microsoftAzure: {
    apiUrl: "https://management.azure.com",
    regex: "^(.*\\.)?azure\\.com(/.*)?$",
    icon: "microsoftAzure",
    docsUrl: "https://learn.microsoft.com/en-us/rest/api/azure"
  },
  adobe: {
    apiUrl: "https://api.adobecommerce.com",
    regex: "^(.*\\.)?adobecommerce\\.com(/.*)?$",
    icon: "adobe",
    docsUrl: "https://developer.adobe.com/commerce/webapi"
  },
  magento: {
    apiUrl: "https://magento.api.com",
    regex: "^(.*\\.)?magento\\.com(/.*)?$",
    icon: "magento",
    docsUrl: "https://devdocs.magento.com/guides/v2.4/rest/bk-rest.html"
  },
  klaviyo: {
    apiUrl: "https://a.klaviyo.com/api",
    regex: "^(.*\\.)?klaviyo\\.com(/.*)?$",
    icon: "klaviyo",
    docsUrl: "https://developers.klaviyo.com/en/reference/api-overview"
  },
  braze: {
    apiUrl: "https://rest.iad-01.braze.com",
    regex: "^(.*\\.)?braze\\.com(/.*)?$",
    icon: "braze",
    docsUrl: "https://www.braze.com/docs/api/basics"
  },
  brevo: {
    apiUrl: "https://api.brevo.com",
    regex: "^(.*\\.)?brevo\\.com(/.*)?$",
    icon: "brevo",
    docsUrl: "https://developers.brevo.com/reference"
  },
  greenhouse: {
    apiUrl: "https://harvest.greenhouse.io/v1",
    regex: "^(.*\\.)?greenhouse\\.io(/.*)?$",
    icon: "greenhouse",
    docsUrl: "https://developers.greenhouse.io/harvest.html"
  },
  lever: {
    apiUrl: "https://api.lever.co",
    regex: "^(.*\\.)?lever\\.co(/.*)?$",
    icon: "lever",
    docsUrl: "https://hire.lever.co/developer/documentation"
  },
  bamboohr: {
    apiUrl: "https://api.bamboohr.com",
    regex: "^(.*\\.)?bamboohr\\.com(/.*)?$",
    icon: "bamboohr",
    docsUrl: "https://documentation.bamboohr.com/reference"
  },
  gusto: {
    apiUrl: "https://api.gusto.com",
    regex: "^(.*\\.)?gusto\\.com(/.*)?$",
    icon: "gusto",
    docsUrl: "https://docs.gusto.com"
  },
  rippling: {
    apiUrl: "https://api.rippling.com",
    regex: "^(.*\\.)?rippling\\.com(/.*)?$",
    icon: "rippling",
    docsUrl: "https://developer.rippling.com/docs"
  },
  workday: {
    apiUrl: "https://api.workday.com",
    regex: "^(.*\\.)?workday\\.com(/.*)?$",
    icon: "workday",
    docsUrl: "https://community.workday.com/api"
  },
  sap: {
    apiUrl: "https://api.successfactors.com",
    regex: "^(.*\\.)?sap\\.com(/.*)?$",
    icon: "sap",
    docsUrl: "https://help.sap.com/docs/SAP_SUCCESSFACTORS_PLATFORM/28bc3c8e3f214ab487ec51b1b8709adc/af2b8d5437494b78a31a0d8879f43428.html"
  },
  zoho: {
    apiUrl: "https://www.zohoapis.com",
    regex: "^(.*\\.)?zoho\\.com(/.*)?$",
    icon: "zoho",
    docsUrl: "https://www.zoho.com/crm/developer/docs/api"
  },
  pipedrive: {
    apiUrl: "https://api.pipedrive.com",
    regex: "^(.*\\.)?pipedrive\\.com(/.*)?$",
    icon: "pipedrive",
    docsUrl: "https://developers.pipedrive.com/docs/api/v1"
  },
  sugarcrm: {
    apiUrl: "https://{instance}.sugarondemand.com/rest/v11",
    regex: "^(.*\\.)?sugarcrm\\.com(/.*)?$",
    icon: "sugarcrm",
    docsUrl: "https://support.sugarcrm.com/Documentation/Sugar_Developer/Sugar_Developer_Guide/Integration/Web_Services/REST_API"
  },
  chargebee: {
    apiUrl: "https://{your-site}.chargebee.com/api",
    regex: "^(.*\\.)?chargebee\\.com(/.*)?$",
    icon: "chargebee",
    docsUrl: "https://apidocs.chargebee.com/docs/api"
  },
  chargify: {
    apiUrl: "https://{subdomain}.chargify.com",
    regex: "^(.*\\.)?chargify\\.com(/.*)?$",
    icon: "chargify",
    docsUrl: "https://reference.chargify.com"
  },
  recurly: {
    apiUrl: "https://api.recurly.com",
    regex: "^(.*\\.)?recurly\\.com(/.*)?$",
    icon: "recurly",
    docsUrl: "https://developers.recurly.com/api/v2021-02-25"
  },
  authorize: {
    apiUrl: "https://api.authorize.net",
    regex: "^(.*\\.)?authorize\\.net(/.*)?$",
    icon: "default",
    docsUrl: "https://developer.authorize.net/api/reference"
  },
  checkout: {
    apiUrl: "https://api.checkout.com",
    regex: "^(.*\\.)?checkout\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://api-reference.checkout.com"
  },
  redis: {
    apiUrl: "https://{host}.redis.cloud",
    regex: "^(.*\\.)?redis\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://docs.redis.com/latest/rs/references/rest-api"
  },
  elastic: {
    apiUrl: "https://{cluster-id}.{region}.elasticsearch.com",
    regex: "^(.*\\.)?elastic\\.co(/.*)?$",
    icon: "default",
    docsUrl: "https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-apis.html"
  },
  cockroachdb: {
    apiUrl: "https://{cluster-id}.cockroachlabs.cloud",
    regex: "^(.*\\.)?cockroachlabs\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://www.cockroachlabs.com/docs/stable/api.html"
  },
  basecamp: {
    apiUrl: "https://3.basecampapi.com/{account_id}",
    regex: "^(.*\\.)?basecamp\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://github.com/basecamp/bc3-api"
  },
  huggingface: {
    apiUrl: "https://api-inference.huggingface.co",
    regex: "^(.*\\.)?huggingface\\.co(/.*)?$",
    icon: "default",
    docsUrl: "https://huggingface.co/docs/api-inference/en/index"
  },
  discord: {
    apiUrl: "https://discord.com/api",
    regex: "^(.*\\.)?discord\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://discord.com/developers/docs/reference"
  },
  whatsapp: {
    apiUrl: "https://graph.facebook.com/v18.0",
    regex: "^(.*\\.)?whatsapp\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api"
  },
  telegram: {
    apiUrl: "https://api.telegram.org",
    regex: "^(.*\\.)?telegram\\.org(/.*)?$",
    icon: "default",
    docsUrl: "https://core.telegram.org/bots/api"
  },
  campaignmonitor: {
    apiUrl: "https://api.createsend.com/api",
    regex: "^(.*\\.)?createsend\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://www.campaignmonitor.com/api"
  },
  activecampaign: {
    apiUrl: "https://{account}.api-us1.com/api/3",
    regex: "^(.*\\.)?activecampaign\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://developers.activecampaign.com/reference"
  },
  wix: {
    apiUrl: "https://www.wixapis.com",
    regex: "^(.*\\.)?wix\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://dev.wix.com/api/rest/getting-started"
  },
  ibmcloud: {
    apiUrl: "https://api.{region}.cloud.ibm.com",
    regex: "^(.*\\.)?ibm\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://cloud.ibm.com/apidocs"
  },
  oracle: {
    apiUrl: "https://api.oracle.com",
    regex: "^(.*\\.)?oracle\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://docs.oracle.com/en-us/iaas/api"
  },
  matomo: {
    apiUrl: "https://{your-domain}/matomo",
    regex: "^(.*\\.)?matomo\\.org(/.*)?$",
    icon: "default",
    docsUrl: "https://developer.matomo.org/api-reference/reporting-api"
  },
  pendo: {
    apiUrl: "https://app.pendo.io/api",
    regex: "^(.*\\.)?pendo\\.io(/.*)?$",
    icon: "default",
    docsUrl: "https://developers.pendo.io"
  },
  heap: {
    apiUrl: "https://heapanalytics.com/api",
    regex: "^(.*\\.)?heap\\.io(/.*)?$",
    icon: "default",
    docsUrl: "https://developers.heap.io/reference"
  },
  zuora: {
    apiUrl: "https://rest.zuora.com",
    regex: "^(.*\\.)?zuora\\.com(/.*)?$",
    icon: "zuora",
    docsUrl: "https://www.zuora.com/developer/api-reference"
  },
  netsuite: {
    apiUrl: "https://rest.netsuite.com/app/site/hosting/restlet.nl",
    regex: "^(.*\\.)?netsuite\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_4395824093.html"
  },
  odoo: {
    apiUrl: "https://{your-instance}.odoo.com/api",
    regex: "^(.*\\.)?odoo\\.com(/.*)?$",
    icon: "default",
    docsUrl: "https://www.odoo.com/documentation/15.0/developer/api/external_api.html"
  }
}

/**
 * Find matching integration for a given URL
 * @param url - The URL to match against integrations
 * @returns The matching integration key and details, or null if no match found
 */
export function findMatchingIntegration(url: string): { key: string; integration: typeof integrations[keyof typeof integrations] } | null {
  // Ensure URL has a scheme for proper matching
  const urlForMatching = url.startsWith('http') ? url : `https://${url}`;

  for (const [key, integration] of Object.entries(integrations)) {
    try {
      if (new RegExp(integration.regex).test(urlForMatching)) {
        return { key, integration };
      }
    } catch (e) {
      console.error(`Invalid regex pattern for integration: ${key}`);
    }
  }

  return null;
}

// Example usage:
// const match = findMatchingIntegration('api.stripe.com');
// if (match) {
//   console.log(`Found integration: ${match.key}`);
//   console.log(`API URL: ${match.integration.apiUrl}`);
//   console.log(`Icon: ${match.integration.icon}`);
// }

/**
 * Polls for all integrations to have documentation fetched (documentationPending === false and documentation non-empty).
 * Throws if docs are missing or timeout is reached.
 */
export async function waitForIntegrationsReady(
  ids: string[],
  client: any,
  toast: any,
  maxWaitMs = 20000,
  pollInterval = 1000
) {
  const start = Date.now();
  let prevPending: Record<string, boolean> = {};
  let activeIds = [...ids];

  while (Date.now() - start < maxWaitMs && activeIds.length > 0) {
    const settled = await Promise.allSettled(activeIds.map(id => client.getIntegration(id)));
    const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);

    // Remove deleted integrations from polling
    activeIds = activeIds.filter((id, idx) => results[idx] !== null);

    // Show toast for each integration that transitions from pending to ready or failed
    results.forEach(i => {
      if (!i) return;
      const pending = i.documentationPending === true;
      if (prevPending[i.id] && !pending) {
        if (!i.documentation) {
          toast && toast({
            title: 'Documentation Fetch Failed',
            description: `Documentation fetch failed for integration "${i.id}". Please edit the integration or refresh docs.`,
            variant: 'destructive',
          });
        } else {
          toast && toast({
            title: 'Documentation Ready',
            description: `Documentation for integration "${i.id}" is now ready!`,
            variant: 'success',
          });
        }
      }
      prevPending[i.id] = pending;
    });

    // Only wait for integrations that still exist and are not ready
    const notReady = results.find(i => i && (i.documentationPending === true || !i.documentation));
    if (!notReady) return results.filter(Boolean);

    await new Promise(res => setTimeout(res, pollInterval));
  }

  toast && toast({
    title: 'Timeout',
    description: 'Waiting for integration documentation timed out.',
    variant: 'destructive',
  });
  return [];
}


