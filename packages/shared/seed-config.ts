import type { System, Tool } from "./types.js";
import { HttpMethod } from "./types.js";

export interface SeedConfig {
  systems: Partial<System>[];
  tools: Partial<Tool>[];
}

export const SEED_CONFIG: SeedConfig = {
  systems: [
    {
      id: "stock-market",
      name: "Stock Market Data",
      url: "https://www.alphavantage.co",
      templateName: "alphavantage",
      icon: "lucide:chart-line",
      credentials: {
        apikey: "J8BV3OUAXYOSZIX1",
      },
      specificInstructions:
        "Alpha Vantage provides real-time and historical stock market data. Use the 'function' parameter to specify the API endpoint (e.g., TIME_SERIES_DAILY, GLOBAL_QUOTE). Always include the 'apikey' parameter in your requests.",
      documentationUrl: "https://www.alphavantage.co/documentation/",
      documentation: `# Stock Market Data API (Alpha Vantage)

Alpha Vantage provides free APIs for real-time and historical financial market data, plus 50+ technical indicators.

## Base URL
\`https://www.alphavantage.co/query\`

## Authentication
Include \`apikey\` as a query parameter in all requests.

## Core Stock APIs

### GLOBAL_QUOTE - Get Current Price
Returns the latest price and volume for a stock.
\`\`\`
GET /query?function=GLOBAL_QUOTE&symbol=IBM&apikey={apikey}
\`\`\`
Response fields: symbol, open, high, low, price, volume, latest trading day, previous close, change, change percent.

### TIME_SERIES_INTRADAY - Intraday Prices
Returns intraday time series (1min, 5min, 15min, 30min, 60min intervals).
\`\`\`
GET /query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey={apikey}
\`\`\`

### TIME_SERIES_DAILY - Daily Prices
Returns daily open, high, low, close, and volume for up to 20+ years.
\`\`\`
GET /query?function=TIME_SERIES_DAILY&symbol=IBM&apikey={apikey}
\`\`\`

### TIME_SERIES_WEEKLY / TIME_SERIES_MONTHLY
Weekly and monthly aggregated time series data.

### SYMBOL_SEARCH - Find Ticker Symbols
Search for stocks by name or symbol.
\`\`\`
GET /query?function=SYMBOL_SEARCH&keywords=microsoft&apikey={apikey}
\`\`\`

## Fundamental Data

### OVERVIEW - Company Information
Returns company description, sector, industry, market cap, PE ratio, dividend yield, 52-week high/low, and more.
\`\`\`
GET /query?function=OVERVIEW&symbol=IBM&apikey={apikey}
\`\`\`

### INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW
Annual and quarterly financial statements.

### EARNINGS
Historical and upcoming earnings data with EPS estimates.

## Forex & Crypto

### CURRENCY_EXCHANGE_RATE
Real-time exchange rate between two currencies.
\`\`\`
GET /query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=EUR&apikey={apikey}
\`\`\`

### FX_DAILY / FX_WEEKLY / FX_MONTHLY
Historical forex data.

### CRYPTO_EXCHANGE_RATE / DIGITAL_CURRENCY_DAILY
Cryptocurrency prices and historical data.

## Technical Indicators
50+ indicators including: SMA, EMA, RSI, MACD, STOCH, ADX, BBANDS, and more.
\`\`\`
GET /query?function=RSI&symbol=IBM&interval=daily&time_period=14&series_type=close&apikey={apikey}
\`\`\`

## Economic Indicators
- REAL_GDP, REAL_GDP_PER_CAPITA
- TREASURY_YIELD
- FEDERAL_FUNDS_RATE
- CPI, INFLATION
- UNEMPLOYMENT, NONFARM_PAYROLL

## Commodities
Real-time and historical prices for: Gold, Silver, Crude Oil (WTI/Brent), Natural Gas, Copper, Wheat, Corn, Coffee, and more.

## Rate Limits
- Free tier: 25 requests/day, 5 requests/minute
- Premium tiers available for higher limits

## Response Format
All responses are JSON. Time series data is keyed by date/time strings.`,
    },
    {
      id: "superglue-email",
      name: "Superglue Email Service",
      url: "https://api.superglue.cloud/v1/notify/email",
      templateName: "superglueEmail",
      icon: "lucide:mail",
      credentials: {},
      specificInstructions:
        "Send emails to your own email address. Use POST https://api.superglue.cloud/v1/notify/email with your API key in the Authorization header. Request body: { subject: string, body: string }. The email will be sent to the email address you signed up with.",
      documentationUrl: "https://docs.superglue.cloud/guides/email-service",
      documentation: `# Superglue Email Service

A simple email notification service that sends emails to your registered Superglue account email address.

## Endpoint
\`POST https://api.superglue.cloud/v1/notify/email\`

## Authentication
Include your Superglue API key in the Authorization header:
\`\`\`
Authorization: Bearer {your_api_key}
\`\`\`

## Request Body
\`\`\`json
{
  "subject": "Your email subject",
  "body": "Your email body (supports HTML)"
}
\`\`\`

### Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subject | string | Yes | Email subject line |
| body | string | Yes | Email body content. Supports plain text or HTML |

## Response
### Success (200)
\`\`\`json
{
  "success": true,
  "message": "Email sent successfully"
}
\`\`\`

### Error (4xx/5xx)
\`\`\`json
{
  "success": false,
  "error": "Error description"
}
\`\`\`

## Example Request
\`\`\`bash
curl -X POST https://api.superglue.cloud/v1/notify/email \\
  -H "Authorization: Bearer your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject": "Hello from Superglue!",
    "body": "<h1>Welcome!</h1><p>This is a test email.</p>"
  }'
\`\`\`

## Use Cases
- Send alerts when workflows complete
- Notify yourself of important data changes
- Create automated reports delivered to your inbox
- Build notification systems for your integrations

## Notes
- Emails are sent FROM Superglue's notification system
- Emails are sent TO the email address associated with your Superglue account
- HTML content is supported for rich formatting
- Rate limits apply based on your Superglue plan`,
    },
    {
      id: "lego-database",
      name: "Lego Sets Database",
      url: "postgresql://test_user:LegoTest2026!xK9m@files.superglue.ai:5432/lego",
      templateName: "postgres",
      credentials: {
        user: "test_user",
        password: "LegoTest2026!xK9m",
        hostname: "files.superglue.ai",
        port: "5432",
        database_name: "lego",
      },
      specificInstructions:
        "PostgreSQL database containing all Lego sets (READ-ONLY access). Use parameterized queries with $1, $2, etc. placeholders. Example: { query: 'SELECT * FROM sets WHERE year > $1', params: [2020] }. Explore available tables first with: { query: 'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', params: ['public'] }",
      documentationUrl: "https://www.postgresql.org/docs/",
      documentation: `# Lego Sets Database

A comprehensive PostgreSQL database containing the complete Lego catalog from 1949 to 2026. READ-ONLY access.

## Database Stats
- **26,097** Lego sets
- **60,820** unique parts
- **16,535** minifigures
- **488** themes
- **275** colors
- Data spans from **1949 to 2026**

## Tables

### sets
All Lego sets ever released.
| Column | Type | Description |
|--------|------|-------------|
| set_num | varchar(50) | Primary key, e.g., "75192-1" |
| name | text | Set name, e.g., "Millennium Falcon" |
| year | integer | Release year |
| theme_id | integer | FK to themes table |
| num_parts | integer | Number of parts in set |
| img_url | text | URL to set image |

### themes
Lego product themes (Star Wars, City, Technic, etc.)
| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| name | text | Theme name |
| parent_id | integer | Parent theme (for sub-themes) |

Top-level themes include: Star Wars, City, Technic, Creator, Ninjago, Harry Potter, Marvel, Architecture, Ideas, and 400+ more.

### parts
Individual Lego pieces.
| Column | Type | Description |
|--------|------|-------------|
| part_num | varchar(50) | Primary key, e.g., "3001" |
| name | text | Part name, e.g., "Brick 2 x 4" |
| part_cat_id | integer | FK to part_categories |
| part_material | text | Material type |

### colors
All Lego colors.
| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| name | text | Color name, e.g., "Red" |
| rgb | varchar(6) | Hex color code |
| is_trans | boolean | Is transparent? |
| num_parts | integer | Parts available in this color |
| num_sets | integer | Sets using this color |

### minifigs
Lego minifigures.
| Column | Type | Description |
|--------|------|-------------|
| fig_num | varchar(50) | Primary key |
| name | text | Minifig name |
| num_parts | integer | Number of parts |
| img_url | text | URL to minifig image |

### inventories
Links sets to their contents.
| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| version | integer | Inventory version |
| set_num | varchar(50) | FK to sets |

### inventory_parts
Parts contained in each inventory.
| Column | Type | Description |
|--------|------|-------------|
| inventory_id | integer | FK to inventories |
| part_num | varchar(50) | FK to parts |
| color_id | integer | FK to colors |
| quantity | integer | Number of this part |
| is_spare | boolean | Is a spare part? |
| img_url | text | Part image URL |

### inventory_minifigs
Minifigs contained in each inventory.

### inventory_sets
Sub-sets contained in each inventory.

### part_categories
Categories for parts (Bricks, Plates, Tiles, etc.)

### part_relationships
Relationships between parts (molds, prints, alternates).

## Example Queries

### Find sets by theme
\`\`\`sql
SELECT s.set_num, s.name, s.year, s.num_parts
FROM sets s
JOIN themes t ON s.theme_id = t.id
WHERE t.name = 'Star Wars'
ORDER BY s.year DESC
LIMIT 10;
\`\`\`

### Find largest sets
\`\`\`sql
SELECT set_num, name, year, num_parts
FROM sets
ORDER BY num_parts DESC
LIMIT 10;
\`\`\`

### Search sets by name
\`\`\`sql
SELECT set_num, name, year, num_parts
FROM sets
WHERE name ILIKE '%millennium falcon%';
\`\`\`

### Get parts in a set
\`\`\`sql
SELECT p.part_num, p.name, c.name as color, ip.quantity
FROM inventory_parts ip
JOIN inventories i ON ip.inventory_id = i.id
JOIN parts p ON ip.part_num = p.part_num
JOIN colors c ON ip.color_id = c.id
WHERE i.set_num = '75192-1';
\`\`\`

### Count sets by year
\`\`\`sql
SELECT year, COUNT(*) as num_sets
FROM sets
GROUP BY year
ORDER BY year DESC;
\`\`\`

## Query Format
Use parameterized queries with $1, $2, etc. placeholders:
\`\`\`json
{
  "query": "SELECT * FROM sets WHERE year > $1 AND theme_id = $2",
  "params": [2020, 158]
}
\`\`\`

## Notes
- This is a READ-ONLY database
- All queries should use parameterized placeholders
- Data sourced from Rebrickable.com`,
    },
  ],
  tools: [
    {
      id: "stock-email-alert",
      steps: [
        {
          id: "fetchStock",
          config: {
            url: "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=<<(sourceData) => sourceData.symbol || 'AAPL'>>&apikey=<<stock-market_apikey>>",
            method: HttpMethod.GET,
            systemId: "stock-market",
          },
          instruction: "Fetch the current stock quote for the given symbol",
        },
        {
          id: "sendEmail",
          instruction: "Send an email with the stock information",
          config: {
            url: "https://api.superglue.cloud/v1/notify/email",
            method: HttpMethod.POST,
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer <<superglue-email_apiKey>>",
            },
            body: `<<(sourceData) => {
              const symbol = sourceData.symbol || 'AAPL';
              const quote = sourceData.fetchStock?.data?.["Global Quote"] || {};
              const price = quote["05. price"] || "N/A";
              const change = quote["09. change"] || "N/A";
              const changePercent = quote["10. change percent"] || "N/A";
              const volume = parseInt(quote["06. volume"] || "0").toLocaleString();
              const tradingDay = quote["07. latest trading day"] || "N/A";
              const isPositive = parseFloat(change) >= 0;
              const changeColor = isPositive ? "#22c55e" : "#ef4444";
              const changeArrow = isPositive ? "↑" : "↓";
              
              return JSON.stringify({
                subject: "📈 Stock Alert: " + symbol + " - $" + parseFloat(price).toFixed(2),
                body: \`
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                      <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Welcome to Superglue!</h1>
                      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your first automated workflow is working</p>
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
                      <div style="display: flex; align-items: center; margin-bottom: 16px;">
                        <span style="font-size: 32px; font-weight: bold; color: #1e293b;">\${symbol}</span>
                        <span style="margin-left: 12px; padding: 4px 12px; background: \${changeColor}; color: white; border-radius: 20px; font-size: 14px; font-weight: 500;">\${changeArrow} \${changePercent}</span>
                      </div>
                      
                      <div style="font-size: 48px; font-weight: bold; color: #0f172a; margin-bottom: 24px;">$\${parseFloat(price).toFixed(2)}</div>
                      
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                          <div style="color: #64748b; font-size: 12px; text-transform: uppercase; margin-bottom: 4px;">Change</div>
                          <div style="color: \${changeColor}; font-size: 18px; font-weight: 600;">\${isPositive ? "+" : ""}\${change}</div>
                        </div>
                        <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                          <div style="color: #64748b; font-size: 12px; text-transform: uppercase; margin-bottom: 4px;">Volume</div>
                          <div style="color: #1e293b; font-size: 18px; font-weight: 600;">\${volume}</div>
                        </div>
                      </div>
                      
                      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
                        Latest trading day: \${tradingDay}
                      </div>
                    </div>
                    
                    <div style="margin-top: 24px; padding: 20px; background: #fefce8; border-radius: 12px; border: 1px solid #fef08a;">
                      <p style="margin: 0; color: #854d0e; font-size: 14px;">
                        <strong>💡 This is a demo tool!</strong> You just ran your first Superglue workflow. 
                        Edit this tool or create your own to automate any API integration.
                      </p>
                    </div>
                    
                    <div style="margin-top: 24px; text-align: center; color: #94a3b8; font-size: 12px;">
                      Powered by <a href="https://superglue.cloud" style="color: #667eea; text-decoration: none;">Superglue</a> — The AI-native integration platform
                    </div>
                  </div>
                \`
              });
            }>>`,
            systemId: "superglue-email",
          },
        },
      ],
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)",
            default: "AAPL",
          },
        },
      },
      instruction:
        "Fetches the current stock quote from Alpha Vantage and sends an email with the stock information to your registered email address.",
    },
  ],
};
