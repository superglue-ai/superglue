export interface IntegrationConfig {
  apiUrl: string;
  regex: string;
  icon: string;
  docsUrl: string;
  preferredAuthType?: 'oauth' | 'apikey' | 'none';
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    scopes?: string;
  };
}

export const integrations: Record<string, IntegrationConfig> = {
  stripe: {
    apiUrl: "https://api.stripe.com",
    regex: "^(.*\\.)?stripe\\.com(/.*)?$",
    icon: "stripe",
    docsUrl: "https://stripe.com/docs/api",
    preferredAuthType: "apikey"
  },
  shopify: {
    apiUrl: "https://admin.shopify.com",
    regex: "^.*\\.myshopify\\.com(/.*)?$",
    icon: "shopify",
    docsUrl: "https://shopify.dev/docs/api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
      tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
      scopes: "read_products write_products read_orders write_orders read_customers write_customers read_inventory write_inventory read_fulfillments write_fulfillments read_shipping write_shipping"
    }
  },
  hubspot: {
    apiUrl: "https://api.hubapi.com/crm/v3",
    regex: "^(.*\\.)?hubapi\\.com(/.*)?$",
    icon: "hubspot",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes: "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write crm.objects.owners.read forms forms-uploaded-files files sales-email-read crm.objects.quotes.read crm.objects.quotes.write"
    }
  },
  attio: {
    apiUrl: "https://api.attio.com/v2/",
    regex: "^(.*\\.)?attio\\.com(/.*)?$",
    icon: "attio",
    docsUrl: "https://api.attio.com/openapi/api",
    preferredAuthType: "apikey"
  },
  twilio: {
    apiUrl: "https://api.twilio.com",
    regex: "^(.*\\.)?twilio\\.com(/.*)?$",
    icon: "twilio",
    docsUrl: "https://www.twilio.com/docs/api",
    preferredAuthType: "apikey"
  },
  sendgrid: {
    apiUrl: "https://api.sendgrid.com",
    regex: "^(.*\\.)?sendgrid\\.com(/.*)?$",
    icon: "sendgrid",
    docsUrl: "https://docs.sendgrid.com/api-reference",
    preferredAuthType: "apikey"
  },
  github: {
    apiUrl: "https://api.github.com",
    regex: "^(.*\\.)?github\\.com(/.*)?$",
    icon: "github",
    docsUrl: "https://docs.github.com/en/rest",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: "repo user read:org write:org admin:repo_hook admin:org_hook gist notifications delete_repo write:packages read:packages delete:packages admin:gpg_key workflow"
    }
  },
  gitlab: {
    apiUrl: "https://api.gitlab.com",
    regex: "^(.*\\.)?gitlab\\.com(/.*)?$",
    icon: "gitlab",
    docsUrl: "https://docs.gitlab.com/ee/api/",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://gitlab.com/oauth/authorize",
      tokenUrl: "https://gitlab.com/oauth/token",
      scopes: "api read_api read_user read_repository write_repository read_registry write_registry sudo admin_mode"
    }
  },
  bitbucket: {
    apiUrl: "https://api.bitbucket.org",
    regex: "^(.*\\.)?bitbucket\\.org(/.*)?$",
    icon: "bitbucket",
    docsUrl: "https://developer.atlassian.com/cloud/bitbucket/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://bitbucket.org/site/oauth2/authorize",
      tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
      scopes: "repository repository:write repository:admin repository:delete issue issue:write pullrequest pullrequest:write wiki snippet account account:write team team:write webhook"
    }
  },
  slack: {
    apiUrl: "https://api.slack.com",
    regex: "^(.*\\.)?slack\\.com(/.*)?$",
    icon: "slack",
    docsUrl: "https://api.slack.com/docs",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: "channels:read channels:write channels:history chat:write chat:write.public users:read users:read.email files:read files:write groups:read groups:write im:read im:write mpim:read mpim:write"
    }
  },
  airtable: {
    apiUrl: "https://api.airtable.com",
    regex: "^(.*\\.)?airtable\\.com(/.*)?$",
    icon: "airtable",
    docsUrl: "https://airtable.com/developers/web/api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://airtable.com/oauth2/v1/authorize",
      tokenUrl: "https://airtable.com/oauth2/v1/token",
      scopes: "data.records:read data.records:write data.recordComments:read data.recordComments:write schema.bases:read schema.bases:write webhook:manage user.email:read"
    }
  },
  google: {
    apiUrl: "https://googleapis.com",
    regex: "^(.*\\.)?google\\.com(/.*)?$",
    icon: "google",
    docsUrl: "https://developers.google.com/apis-explorer",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid"
    }
  },
  gmail: {
    apiUrl: "https://gmail.googleapis.com/gmail/v1",
    regex: "^(.*\\.)?gmail\\.googleapis\\.com(/.*)?$",
    icon: "gmail",
    docsUrl: "https://developers.google.com/gmail/api/reference/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.labels https://www.googleapis.com/auth/gmail.metadata https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.settings.sharing"
    }
  },
  googleDrive: {
    apiUrl: "https://www.googleapis.com/drive/v3",
    regex: "^(.*\\.)?drive\\.google\\.com(/.*)?$",
    icon: "googledrive",
    docsUrl: "https://developers.google.com/drive/api/v3/reference",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.metadata https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.photos.readonly"
    }
  },
  googleCalendar: {
    apiUrl: "https://www.googleapis.com/calendar/v3",
    regex: "^(.*\\.)?calendar\\.google\\.com(/.*)?$",
    icon: "googlecalendar",
    docsUrl: "https://developers.google.com/calendar/api/v3/reference",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.settings.readonly https://www.googleapis.com/auth/calendar.calendars https://www.googleapis.com/auth/calendar.calendars.readonly"
    }
  },
  googleSheets: {
    apiUrl: "https://sheets.googleapis.com/v4",
    regex: "^(.*\\.)?sheets\\.googleapis\\.com(/.*)?$",
    icon: "googlesheets",
    docsUrl: "https://developers.google.com/sheets/api/reference/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly"
    }
  },
  googleAnalytics: {
    apiUrl: "https://analytics.google.com",
    regex: "^(.*\\.)?analytics\\.google\\.com(/.*)?$",
    icon: "googleAnalytics",
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/analytics https://www.googleapis.com/auth/analytics.edit https://www.googleapis.com/auth/analytics.manage.users https://www.googleapis.com/auth/analytics.manage.users.readonly https://www.googleapis.com/auth/analytics.user.deletion"
    }
  },
  youtube: {
    apiUrl: "https://youtube.googleapis.com",
    regex: "^(.*\\.)?youtube\\.com(/.*)?$",
    icon: "youtube",
    docsUrl: "https://developers.google.com/youtube/v3/docs",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.channel-memberships.creator https://www.googleapis.com/auth/youtubepartner"
    }
  },
  aws: {
    apiUrl: "https://amazonaws.com",
    regex: "^(.*\\.)?amazonaws\\.com(/.*)?$",
    icon: "amazonAWS",
    docsUrl: "https://docs.aws.amazon.com/index.html",
    preferredAuthType: "apikey"
  },
  googleCloud: {
    apiUrl: "https://cloud.google.com",
    regex: "^(.*\\.)?cloud\\.google\\.com(/.*)?$",
    icon: "googleCloud",
    docsUrl: "https://cloud.google.com/apis/docs/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/cloud-platform.read-only https://www.googleapis.com/auth/cloudplatformprojects https://www.googleapis.com/auth/cloudplatformprojects.readonly https://www.googleapis.com/auth/devstorage.full_control https://www.googleapis.com/auth/devstorage.read_only https://www.googleapis.com/auth/devstorage.read_write"
    }
  },
  firebase: {
    apiUrl: "https://firestore.googleapis.com",
    regex: "^(.*\\.)?firebase\\.google\\.com(/.*)?$",
    icon: "firebase",
    docsUrl: "https://firebase.google.com/docs/reference",
    preferredAuthType: "apikey"
  },
  salesforce: {
    apiUrl: "https://api.salesforce.com",
    regex: "^(.*\\.)?salesforce\\.com(/.*)?$",
    icon: "salesforce",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
      scopes: "api refresh_token web full chatter_api custom_permissions eclair_api wave_api pardot_api content cdp_query_api cdp_profile_api cdp_ingest_api interaction_api"
    }
  },
  facebook: {
    apiUrl: "https://graph.facebook.com",
    regex: "^(.*\\.)?facebook\\.com(/.*)?$",
    icon: "facebook",
    docsUrl: "https://developers.facebook.com/docs/graph-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
      scopes: "email public_profile pages_show_list pages_read_engagement pages_manage_metadata pages_read_user_content pages_manage_posts pages_manage_engagement business_management ads_management ads_read catalog_management leads_retrieval"
    }
  },
  instagram: {
    apiUrl: "https://api.instagram.com",
    regex: "^(.*\\.)?instagram\\.com(/.*)?$",
    icon: "instagram",
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://api.instagram.com/oauth/authorize",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: "user_profile user_media basic instagram_basic instagram_content_publish instagram_manage_comments instagram_manage_insights instagram_shopping_tag_products"
    }
  },
  twitter: {
    apiUrl: "https://api.twitter.com",
    regex: "^(.*\\.)?twitter\\.com(/.*)?$",
    icon: "twitter",
    docsUrl: "https://developer.twitter.com/en/docs/twitter-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      scopes: "tweet.read tweet.write tweet.moderate.write users.read follows.read follows.write offline.access space.read mute.read mute.write like.read like.write list.read list.write block.read block.write bookmark.read bookmark.write"
    }
  },
  linkedin: {
    apiUrl: "https://api.linkedin.com",
    regex: "^(.*\\.)?linkedin\\.com(/.*)?$",
    icon: "linkedin",
    docsUrl: "https://developer.linkedin.com/docs",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: "r_liteprofile r_emailaddress w_member_social r_fullprofile r_basicprofile rw_company_admin r_1st_connections r_ads r_ads_reporting r_organization_social rw_organization_admin w_organization_social r_events"
    }
  },
  paypal: {
    apiUrl: "https://api.paypal.com",
    regex: "^(.*\\.)?paypal\\.com(/.*)?$",
    icon: "paypal",
    docsUrl: "https://developer.paypal.com/api/rest",
    preferredAuthType: "apikey"
  },
  braintree: {
    apiUrl: "https://api.braintreegateway.com",
    regex: "^(.*\\.)?braintree\\.com(/.*)?$",
    icon: "braintree",
    docsUrl: "https://developer.paypal.com/braintree/docs",
    preferredAuthType: "apikey"
  },
  square: {
    apiUrl: "https://connect.squareup.com",
    regex: "^(.*\\.)?square\\.com(/.*)?$",
    icon: "square",
    docsUrl: "https://developer.squareup.com/reference/square",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://connect.squareup.com/oauth2/authorize",
      tokenUrl: "https://connect.squareup.com/oauth2/token",
      scopes: "MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE INVENTORY_READ INVENTORY_WRITE ORDERS_READ ORDERS_WRITE ITEMS_READ ITEMS_WRITE EMPLOYEES_READ EMPLOYEES_WRITE TIMECARDS_READ TIMECARDS_WRITE"
    }
  },
  adyen: {
    apiUrl: "https://checkout-test.adyen.com",
    regex: "^(.*\\.)?adyen\\.com(/.*)?$",
    icon: "adyen",
    docsUrl: "https://docs.adyen.com/api-explorer",
    preferredAuthType: "apikey"
  },
  razorpay: {
    apiUrl: "https://api.razorpay.com",
    regex: "^(.*\\.)?razorpay\\.com(/.*)?$",
    icon: "razorpay",
    docsUrl: "https://razorpay.com/docs/api",
    preferredAuthType: "apikey"
  },
  plaid: {
    apiUrl: "https://production.plaid.com",
    regex: "^(.*\\.)?plaid\\.com(/.*)?$",
    icon: "plaid",
    docsUrl: "https://plaid.com/docs/api",
    preferredAuthType: "apikey"
  },
  zendesk: {
    apiUrl: "https://api.zendesk.com",
    regex: "^(.*\\.)?zendesk\\.com(/.*)?$",
    icon: "zendesk",
    docsUrl: "https://developer.zendesk.com/api-reference",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
      tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
      scopes: "read write tickets:read tickets:write users:read users:write organizations:read organizations:write hc:read hc:write chat:read chat:write"
    }
  },
  freshdesk: {
    apiUrl: "https://{domain}.freshdesk.com/api/v2",
    regex: "^(.*\\.)?freshdesk\\.com(/.*)?$",
    icon: "freshdesk",
    docsUrl: "https://developers.freshdesk.com/api",
    preferredAuthType: "apikey"
  },
  freshworks: {
    apiUrl: "https://{domain}.freshservice.com/api/v2",
    regex: "^(.*\\.)?freshservice\\.com(/.*)?$",
    icon: "freshworks",
    docsUrl: "https://api.freshservice.com",
    preferredAuthType: "apikey"
  },
  servicenow: {
    apiUrl: "https://{instance}.service-now.com/api",
    regex: "^(.*\\.)?servicenow\\.com(/.*)?$",
    icon: "servicenow",
    docsUrl: "https://developer.servicenow.com/dev.do#!/reference/api/latest/rest",
    preferredAuthType: "apikey"
  },
  helpscout: {
    apiUrl: "https://api.helpscout.net",
    regex: "^(.*\\.)?helpscout\\.net(/.*)?$",
    icon: "helpscout",
    docsUrl: "https://developer.helpscout.com/mailbox-api",
    preferredAuthType: "apikey"
  },
  dropbox: {
    apiUrl: "https://api.dropboxapi.com",
    regex: "^(.*\\.)?dropbox\\.com(/.*)?$",
    icon: "dropbox",
    docsUrl: "https://www.dropbox.com/developers/documentation/http/documentation",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes: "files.metadata.read files.metadata.write files.content.read files.content.write sharing.read sharing.write account_info.read account_info.write contacts.read"
    }
  },
  mailchimp: {
    apiUrl: "https://api.mailchimp.com",
    regex: "^(.*\\.)?mailchimp\\.com(/.*)?$",
    icon: "mailchimp",
    docsUrl: "https://mailchimp.com/developer/marketing/api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://login.mailchimp.com/oauth2/authorize",
      tokenUrl: "https://login.mailchimp.com/oauth2/token",
      scopes: "audiences:read audiences:write automations:read automations:write campaigns:read campaigns:write conversations:read conversations:write ecommerce:read ecommerce:write files:read files:write lists:read lists:write reports:read templates:read templates:write"
    }
  },
  constantcontact: {
    apiUrl: "https://api.constantcontact.com",
    regex: "^(.*\\.)?constantcontact\\.com(/.*)?$",
    icon: "constantcontact",
    docsUrl: "https://developer.constantcontact.com/api_reference.html",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://authz.constantcontact.com/oauth2/default/v1/authorize",
      tokenUrl: "https://authz.constantcontact.com/oauth2/default/v1/token",
      scopes: "contact_data campaign_data account_read account_update offline_access"
    }
  },
  jira: {
    apiUrl: "https://{your-domain}.atlassian.net/rest/api",
    regex: "^(.*\\.)?jira\\.com(/.*)?$",
    icon: "jira",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: "read:jira-work write:jira-work read:jira-user write:jira-user read:jira-work-management write:jira-work-management read:servicedesk-request write:servicedesk-request manage:jira-project manage:jira-configuration manage:jira-data-provider"
    }
  },
  atlassian: {
    apiUrl: "https://api.atlassian.com",
    regex: "^(.*\\.)?atlassian\\.com(/.*)?$",
    icon: "atlassian",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: "read:jira-work write:jira-work read:jira-user write:jira-user read:confluence-content.all write:confluence-content read:confluence-space.summary read:confluence-props write:confluence-props read:confluence-user write:confluence-user"
    }
  },
  confluence: {
    apiUrl: "https://{your-domain}.atlassian.net/wiki/rest/api",
    regex: "^(.*\\.)?confluence\\.com(/.*)?$",
    icon: "confluence",
    docsUrl: "https://developer.atlassian.com/cloud/confluence/rest",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: "read:confluence-content.all write:confluence-content read:confluence-space.summary write:confluence-space read:confluence-props write:confluence-props read:confluence-user write:confluence-user read:confluence-groups write:confluence-groups delete:confluence-content delete:confluence-space"
    }
  },
  quickbooks: {
    apiUrl: "https://quickbooks.api.intuit.com",
    regex: "^(.*\\.)?quickbooks\\.com(/.*)?$",
    icon: "quickbooks",
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      scopes: "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment com.intuit.quickbooks.payroll com.intuit.quickbooks.payroll.timetracking com.intuit.quickbooks.payroll.benefits openid profile email phone address"
    }
  },
  xero: {
    apiUrl: "https://api.xero.com",
    regex: "^(.*\\.)?xero\\.com(/.*)?$",
    icon: "xero",
    docsUrl: "https://developer.xero.com/documentation/api/api-overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.xero.com/identity/connect/authorize",
      tokenUrl: "https://identity.xero.com/connect/token",
      scopes: "accounting.transactions accounting.transactions.read accounting.reports.read accounting.journals.read accounting.settings accounting.settings.read accounting.contacts accounting.contacts.read accounting.attachments accounting.attachments.read payroll.employees payroll.payruns payroll.payslip payroll.timesheets payroll.settings"
    }
  },
  docusign: {
    apiUrl: "https://api.docusign.com",
    regex: "^(.*\\.)?docusign\\.com(/.*)?$",
    icon: "docusign",
    docsUrl: "https://developers.docusign.com/docs/esign-rest-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://account.docusign.com/oauth/auth",
      tokenUrl: "https://account.docusign.com/oauth/token",
      scopes: "signature extended impersonation organization_read group_read permission_read user_read user_write account_read domain_read identity_provider_read user_data_redact asset_group_account_read asset_group_account_clone_write asset_group_account_clone_read"
    }
  },
  intercom: {
    apiUrl: "https://api.intercom.io",
    regex: "^(.*\\.)?intercom\\.com(/.*)?$",
    icon: "intercom",
    docsUrl: "https://developers.intercom.com/intercom-api-reference",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.intercom.com/oauth",
      tokenUrl: "https://api.intercom.io/auth/eagle/token",
      scopes: "inbox:read inbox:write users:read users:write companies:read companies:write contacts:read contacts:write conversations:read conversations:write help_center:read help_center:write teams:read teams:write tags:read tags:write segments:read events:write counts:read"
    }
  },
  marketo: {
    apiUrl: "https://{instance-id}.mktorest.com",
    regex: "^(.*\\.)?marketo\\.com(/.*)?$",
    icon: "marketo",
    docsUrl: "https://developers.marketo.com/rest-api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://{instance-id}.mktorest.com/identity/oauth/token",
      tokenUrl: "https://{instance-id}.mktorest.com/identity/oauth/token",
      scopes: "api"
    }
  },
  asana: {
    apiUrl: "https://app.asana.com/api",
    regex: "^(.*\\.)?asana\\.com(/.*)?$",
    icon: "asana",
    docsUrl: "https://developers.asana.com/docs",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.asana.com/-/oauth_authorize",
      tokenUrl: "https://app.asana.com/-/oauth_token",
      scopes: "default openid email profile"
    }
  },
  trello: {
    apiUrl: "https://api.trello.com",
    regex: "^(.*\\.)?trello\\.com(/.*)?$",
    icon: "trello",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest",
    preferredAuthType: "apikey"
  },
  notion: {
    apiUrl: "https://api.notion.com",
    regex: "^(.*\\.)?notion\\.so(/.*)?$",
    icon: "notion",
    docsUrl: "https://developers.notion.com",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: "read_content update_content insert_content read_comments update_comments insert_comments read_user update_user"
    }
  },
  digitalocean: {
    apiUrl: "https://api.digitalocean.com",
    regex: "^(.*\\.)?digitalocean\\.com(/.*)?$",
    icon: "digitalocean",
    docsUrl: "https://docs.digitalocean.com/reference/api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://cloud.digitalocean.com/v1/oauth/authorize",
      tokenUrl: "https://cloud.digitalocean.com/v1/oauth/token",
      scopes: "read write admin"
    }
  },
  heroku: {
    apiUrl: "https://api.heroku.com",
    regex: "^(.*\\.)?heroku\\.com(/.*)?$",
    icon: "heroku",
    docsUrl: "https://devcenter.heroku.com/categories/platform-api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://id.heroku.com/oauth/authorize",
      tokenUrl: "https://id.heroku.com/oauth/token",
      scopes: "global read write read-protected write-protected"
    }
  },
  circleci: {
    apiUrl: "https://circleci.com/api",
    regex: "^(.*\\.)?circleci\\.com(/.*)?$",
    icon: "circleci",
    docsUrl: "https://circleci.com/docs/api",
    preferredAuthType: "apikey"
  },
  travisci: {
    apiUrl: "https://api.travis-ci.com",
    regex: "^(.*\\.)?travis-ci\\.com(/.*)?$",
    icon: "travisCI",
    docsUrl: "https://docs.travis-ci.com/api",
    preferredAuthType: "apikey"
  },
  wordpress: {
    apiUrl: "https://{your-site.com}/wp-json/wp/v2",
    regex: "^(.*\\.)?wordpress\\.com(/.*)?$",
    icon: "wordpress",
    docsUrl: "https://developer.wordpress.org/rest-api",
    preferredAuthType: "apikey"
  },
  cloudflare: {
    apiUrl: "https://api.cloudflare.com",
    regex: "^(.*\\.)?cloudflare\\.com(/.*)?$",
    icon: "cloudflare",
    docsUrl: "https://developers.cloudflare.com/api",
    preferredAuthType: "apikey"
  },
  bigcommerce: {
    apiUrl: "https://api.bigcommerce.com",
    regex: "^(.*\\.)?bigcommerce\\.com(/.*)?$",
    icon: "bigcommerce",
    docsUrl: "https://developer.bigcommerce.com/docs/rest-management",
    preferredAuthType: "apikey"
  },
  woocommerce: {
    apiUrl: "https://{yourstore.com}/wp-json/wc/v3",
    regex: "^(.*\\.)?woocommerce\\.com(/.*)?$",
    icon: "woocommerce",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs",
    preferredAuthType: "apikey"
  },
  prestashop: {
    apiUrl: "https://{yourstore.com}/api",
    regex: "^(.*\\.)?prestashop\\.com(/.*)?$",
    icon: "prestashop",
    docsUrl: "https://devdocs.prestashop-project.org/8/webservice",
    preferredAuthType: "apikey"
  },
  squarespace: {
    apiUrl: "https://api.squarespace.com",
    regex: "^(.*\\.)?squarespace\\.com(/.*)?$",
    icon: "squarespace",
    docsUrl: "https://developers.squarespace.com/commerce-apis",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.squarespace.com/api/1/login/oauth/provider/authorize",
      tokenUrl: "https://login.squarespace.com/api/1/login/oauth/provider/tokens",
      scopes: "website.products.read website.products.write website.orders.read website.orders.write website.inventory.read website.transactions.read website.store_settings.read email.campaigns.read email.campaigns.send"
    }
  },
  monday: {
    apiUrl: "https://api.monday.com/v2",
    regex: "^(.*\\.)?monday\\.com(/.*)?$",
    icon: "monday",
    docsUrl: "https://developer.monday.com/api-reference/docs",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://auth.monday.com/oauth2/authorize",
      tokenUrl: "https://auth.monday.com/oauth2/token",
      scopes: "me:read users:read boards:read boards:write workspaces:read workspaces:write webhooks:write updates:read updates:write assets:read assets:write tags:read teams:read"
    }
  },
  clickup: {
    apiUrl: "https://api.clickup.com/api/v2",
    regex: "^(.*\\.)?clickup\\.com(/.*)?$",
    icon: "clickup",
    docsUrl: "https://clickup.com/api",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.clickup.com/api",
      tokenUrl: "https://app.clickup.com/api/v2/oauth/token",
      scopes: "user:read user:write task:read task:write list:read list:write folder:read folder:write space:read space:write team:read team:write webhook:read webhook:write goal:read goal:write"
    }
  },
  typeform: {
    apiUrl: "https://api.typeform.com",
    regex: "^(.*\\.)?typeform\\.com(/.*)?$",
    icon: "typeform",
    docsUrl: "https://developer.typeform.com",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://api.typeform.com/oauth/authorize",
      tokenUrl: "https://api.typeform.com/oauth/token",
      scopes: "forms:read forms:write responses:read responses:write themes:read themes:write images:read images:write workspaces:read workspaces:write webhooks:read webhooks:write accounts:read offline"
    }
  },
  figma: {
    apiUrl: "https://api.figma.com",
    regex: "^(.*\\.)?figma\\.com(/.*)?$",
    icon: "figma",
    docsUrl: "https://www.figma.com/developers/api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://www.figma.com/oauth",
      tokenUrl: "https://www.figma.com/api/oauth/token",
      scopes: "file_read file_write file_dev_resources:read file_dev_resources:write webhooks:write"
    }
  },
  contentful: {
    apiUrl: "https://api.contentful.com",
    regex: "^(.*\\.)?contentful\\.com(/.*)?$",
    icon: "contentful",
    docsUrl: "https://www.contentful.com/developers/docs/references/content-management-api",
    preferredAuthType: "apikey"
  },
  sanity: {
    apiUrl: "https://api.sanity.io",
    regex: "^(.*\\.)?sanity\\.io(/.*)?$",
    icon: "sanity",
    docsUrl: "https://www.sanity.io/docs/http-api",
    preferredAuthType: "apikey"
  },
  prismic: {
    apiUrl: "https://api.prismic.io",
    regex: "^(.*\\.)?prismic\\.io(/.*)?$",
    icon: "prismic",
    docsUrl: "https://prismic.io/docs/rest-api",
    preferredAuthType: "apikey"
  },
  netlify: {
    apiUrl: "https://api.netlify.com",
    regex: "^(.*\\.)?netlify\\.com(/.*)?$",
    icon: "netlify",
    docsUrl: "https://docs.netlify.com/api/get-started",
    preferredAuthType: "apikey",
    oauth: {
      authUrl: "https://app.netlify.com/authorize",
      tokenUrl: "https://api.netlify.com/oauth/token",
      scopes: "user sites deploys dns_zones forms submissions assets functions logs split_tests analytics billing members"
    }
  },
  vercel: {
    apiUrl: "https://api.vercel.com",
    regex: "^(.*\\.)?vercel\\.com(/.*)?$",
    icon: "vercel",
    docsUrl: "https://vercel.com/docs/rest-api",
    preferredAuthType: "apikey"
  },
  amplitude: {
    apiUrl: "https://api.amplitude.com",
    regex: "^(.*\\.)?amplitude\\.com(/.*)?$",
    icon: "amplitude",
    docsUrl: "https://www.docs.developers.amplitude.com",
    preferredAuthType: "apikey"
  },
  segment: {
    apiUrl: "https://api.segment.com",
    regex: "^(.*\\.)?segment\\.com(/.*)?$",
    icon: "segment",
    docsUrl: "https://segment.com/docs/api",
    preferredAuthType: "apikey"
  },
  mixpanel: {
    apiUrl: "https://api.mixpanel.com",
    regex: "^(.*\\.)?mixpanel\\.com(/.*)?$",
    icon: "mixpanel",
    docsUrl: "https://developer.mixpanel.com/reference/overview",
    preferredAuthType: "apikey"
  },
  algolia: {
    apiUrl: "https://api.algolia.com",
    regex: "^(.*\\.)?algolia\\.com(/.*)?$",
    icon: "algolia",
    docsUrl: "https://www.algolia.com/doc/rest-api/search",
    preferredAuthType: "apikey"
  },
  snowflake: {
    apiUrl: "https://account.snowflakecomputing.com",
    regex: "^(.*\\.)?snowflake\\.com(/.*)?$",
    icon: "snowflake",
    docsUrl: "https://docs.snowflake.com/en/developer-guide/sql-api/index",
    preferredAuthType: "apikey"
  },
  databricks: {
    apiUrl: "https://{your-workspace}.cloud.databricks.com/api",
    regex: "^(.*\\.)?databricks\\.com(/.*)?$",
    icon: "databricks",
    docsUrl: "https://docs.databricks.com/dev-tools/api/latest/index.html",
    preferredAuthType: "apikey"
  },
  looker: {
    apiUrl: "https://{your-domain}.looker.com/api",
    regex: "^(.*\\.)?looker\\.com(/.*)?$",
    icon: "looker",
    docsUrl: "https://docs.looker.com/reference/api-and-integration/api-reference",
    preferredAuthType: "apikey"
  },
  mongodb: {
    apiUrl: "https://cloud.mongodb.com/api",
    regex: "^(.*\\.)?mongodb\\.com(/.*)?$",
    icon: "mongodb",
    docsUrl: "https://www.mongodb.com/docs/atlas/api",
    preferredAuthType: "apikey"
  },
  supabase: {
    apiUrl: "https://api.supabase.co",
    regex: "^(.*\\.)?supabase\\.co(/.*)?$",
    icon: "supabase",
    docsUrl: "https://supabase.com/docs/reference/api",
    preferredAuthType: "apikey"
  },
  planetscale: {
    apiUrl: "https://api.planetscale.com",
    regex: "^(.*\\.)?planetscale\\.com(/.*)?$",
    icon: "planetscale",
    docsUrl: "https://api-docs.planetscale.com",
    preferredAuthType: "apikey"
  },
  openai: {
    apiUrl: "https://api.openai.com",
    regex: "^(.*\\.)?openai\\.com(/.*)?$",
    icon: "openai",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    preferredAuthType: "apikey"
  },
  anthropic: {
    apiUrl: "https://api.anthropic.com",
    regex: "^(.*\\.)?anthropic\\.com(/.*)?$",
    icon: "anthropic",
    docsUrl: "https://docs.anthropic.com/claude/reference",
    preferredAuthType: "apikey"
  },
  pinecone: {
    apiUrl: "https://api.pinecone.io",
    regex: "^(.*\\.)?pinecone\\.io(/.*)?$",
    icon: "pinecone",
    docsUrl: "https://docs.pinecone.io/reference",
    preferredAuthType: "apikey"
  },
  zoom: {
    apiUrl: "https://api.zoom.us",
    regex: "^(.*\\.)?zoom\\.us(/.*)?$",
    icon: "zoom",
    docsUrl: "https://developers.zoom.us/docs/api",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      scopes: "user:read user:write meeting:read meeting:write meeting:master recording:read recording:write webinar:read webinar:write chat_message:read chat_message:write chat_channel:read chat_channel:write contact:read report:read report:master dashboard:read"
    }
  },
  microsoft: {
    apiUrl: "https://graph.microsoft.com",
    regex: "^(.*\\.)?microsoft\\.com(/.*)?$",
    icon: "microsoft",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/overview",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: "User.Read User.ReadWrite Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Files.ReadWrite Sites.Read.All Sites.ReadWrite.All Teams.ReadBasic.All Chat.Read Chat.ReadWrite ChannelMessage.Read.All offline_access"
    }
  },
  redis: {
    apiUrl: "https://app.redislabs.com/api/v1",
    regex: "^(.*\\.)?redis\\.com(/.*)?$",
    icon: "redis",
    docsUrl: "https://docs.redis.com/latest/rc/api",
    preferredAuthType: "apikey"
  },
  elasticsearch: {
    apiUrl: "https://api.elastic.co",
    regex: "^(.*\\.)?elastic\\.co(/.*)?$",
    icon: "elasticsearch",
    docsUrl: "https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-apis.html",
    preferredAuthType: "apikey"
  },
  postmark: {
    apiUrl: "https://api.postmarkapp.com",
    regex: "^(.*\\.)?postmarkapp\\.com(/.*)?$",
    icon: "postmark",
    docsUrl: "https://postmarkapp.com/developer",
    preferredAuthType: "apikey"
  },
  sentry: {
    apiUrl: "https://sentry.io/api",
    regex: "^(.*\\.)?sentry\\.io(/.*)?$",
    icon: "sentry",
    docsUrl: "https://docs.sentry.io/api",
    preferredAuthType: "apikey"
  },
  pagerduty: {
    apiUrl: "https://api.pagerduty.com",
    regex: "^(.*\\.)?pagerduty\\.com(/.*)?$",
    icon: "pagerduty",
    docsUrl: "https://developer.pagerduty.com/api-reference",
    preferredAuthType: "apikey"
  },
  datadog: {
    apiUrl: "https://api.datadoghq.com",
    regex: "^(.*\\.)?datadoghq\\.com(/.*)?$",
    icon: "datadog",
    docsUrl: "https://docs.datadoghq.com/api/latest",
    preferredAuthType: "apikey"
  },
  newrelic: {
    apiUrl: "https://api.newrelic.com",
    regex: "^(.*\\.)?newrelic\\.com(/.*)?$",
    icon: "newrelic",
    docsUrl: "https://docs.newrelic.com/docs/apis/rest-api-v2",
    preferredAuthType: "apikey"
  },
  auth0: {
    apiUrl: "https://{your-domain}.auth0.com/api/v2",
    regex: "^(.*\\.)?auth0\\.com(/.*)?$",
    icon: "auth0",
    docsUrl: "https://auth0.com/docs/api/management/v2",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://{your-domain}.auth0.com/authorize",
      tokenUrl: "https://{your-domain}.auth0.com/oauth/token",
      scopes: "read:users update:users delete:users create:users read:users_app_metadata update:users_app_metadata delete:users_app_metadata create:users_app_metadata read:user_idp_tokens read:client_grants create:client_grants delete:client_grants update:client_grants read:connections update:connections delete:connections create:connections read:resource_servers"
    }
  },
  okta: {
    apiUrl: "https://{your-domain}.okta.com/api/v1",
    regex: "^(.*\\.)?okta\\.com(/.*)?$",
    icon: "okta",
    docsUrl: "https://developer.okta.com/docs/reference",
    preferredAuthType: "apikey"
  },
  discord: {
    apiUrl: "https://discord.com/api",
    regex: "^(.*\\.)?discord\\.com(/.*)?$",
    icon: "discord",
    docsUrl: "https://discord.com/developers/docs/intro",
    preferredAuthType: "oauth",
    oauth: {
      authUrl: "https://discord.com/api/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      scopes: "identify email guilds guilds.join connections bot applications.commands applications.commands.update guilds.members.read messages.read webhook.incoming role_connections.write dm_channels.read voice"
    }
  },
  telegram: {
    apiUrl: "https://api.telegram.org",
    regex: "^(.*\\.)?telegram\\.org(/.*)?$",
    icon: "telegram",
    docsUrl: "https://core.telegram.org/bots/api",
    preferredAuthType: "apikey"
  },
  whatsapp: {
    apiUrl: "https://graph.facebook.com",
    regex: "^(.*\\.)?whatsapp\\.com(/.*)?$",
    icon: "whatsapp",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    preferredAuthType: "apikey"
  },
  linear: {
    apiUrl: "https://api.linear.app/graphql",
    regex: "^(.*\\.)?linear\\.app(/.*)?$",
    icon: "linear",
    docsUrl: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    preferredAuthType: "apikey"
  },
  resend: {
    apiUrl: "https://api.resend.com",
    regex: "^(.*\\.)?resend\\.com(/.*)?$",
    icon: "resend",
    docsUrl: "https://resend.com/docs/api-reference",
    preferredAuthType: "apikey"
  },
}

/**
 * Find matching integration for a given URL
 * @param url - The URL to match against integrations
 * @returns The matching integration key and details, or null if no match found
 */
export function findMatchingIntegration(url: string): { key: string; integration: IntegrationConfig } | null {
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

/**
 * Get OAuth configuration for an integration
 * @param integrationKey - The key of the integration
 * @returns OAuth config or null if not available
 */
export function getOAuthConfig(integrationKey: string): IntegrationConfig['oauth'] | null {
  return integrations[integrationKey]?.oauth || null;
}
