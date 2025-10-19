
<p align="center">
  <img src="https://github.com/user-attachments/assets/be0e65d4-dcd8-4133-9841-b08799e087e7" width="350" alt="superglue_logo_white">
</p>

<h2 align="center">Build production-grade integrations & tools from natural language.</h2>
<div align="center">
  
 [![GitHub](https://img.shields.io/github/license/superglue-ai/superglue?style=flat-square)](https://github.com/superglue-ai/superglue/blob/main/LICENSE)
[![Y Combinator](https://img.shields.io/badge/Y%20Combinator-W25-orange?style=flat-square)](https://www.ycombinator.com/companies/superglue)
[![Client SDK](https://img.shields.io/npm/v/@superglue/client?style=flat-square&logo=npm)](https://www.npmjs.com/package/@superglue/client)
[![Docker](https://img.shields.io/docker/pulls/superglueai/superglue?style=flat-square&logo=Docker)](https://hub.docker.com/r/superglueai/superglue)
[![Weave Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fapp.workweave.ai%2Fapi%2Frepository%2Fbadge%2Forg_0S2o9PLamHvNsTjHbszc38vC%2F914997268&cacheSeconds=3600&labelColor=#EC6341)](https://app.workweave.ai/reports/repository/org_0S2o9PLamHvNsTjHbszc38vC/914997268)

</div>

## choose your mode

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%" valign="top" style="vertical-align: top; height: 250px;">
        <div style="height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <h2>superglue agent mode</h2>
            <p><strong>generate connectors for any API, with OAuth support</strong></p>
          </div>
          <div>
            <a href="[https://docs.klavis.ai/documentation/concepts/strata](https://docs.superglue.cloud/)">
            </a>
          </div>
        </div>
      </td>
      <td align="center" width="50%" valign="top" style="vertical-align: top; height: 250px;">
        <div style="height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <h2>superglue toolkits</h2>
            <p><strong>pre-built and tested tools for your AI agent</strong></p>
          </div>
          <div>
            <a href="[https://docs.klavis.ai/documentation/mcp-server/overview](https://superglue.ai/)">
            </a>
          </div>
        </div>
      </td>
    </tr>
  </table>
</div>

## what is superglue?
- Lightweight proxy: point it at any REST / GraphQL / SQL / postgres / file endpoint.
- LLM‑assisted mapping during config; cached Javascript transforms at runtime (no LLM latency).
- Self‑heals integrations: when the upstream API or schema changes, superglue regenerates the transform automatically, and keeps the integration running.
- Security‑first: zero data stored; run fully on‑prem or use [our hosted version](https://app.superglue.cloud/).

## quick start
### option 1: cloud-hosted [superglue.ai](https://superglue.ai)
### option 2: self-host 
### option 3: SDK
```bash
npm install @superglue/client 
```
```javascript
// Typescript SDK
import { SuperglueClient } from "@superglue/client";

const superglue = new SuperglueClient({
  apiKey: "your_api_key_here", // Get from app.superglue.cloud
  baseUrl: "https://api.superglue.cloud", // Optional, defaults to hosted version
});
```

## what people build with superglue
- Enterprise GPT: offer legacy systems inside your enterprise GPT
- Extend AI assistant/co-pilot: offer more actions than search 
- Ship connectors 10x faster, without the maintenance overhead
- Simple interface for legacy API pipelines
- Transforming SQL queries into Rest API calls

## key features

- **API Proxy**: Configure APIs and intercept responses in real-time with minimal added latency
- **LLM-Powered Data Mapping**: Automatically generate data transformations using large language models 
- **Schema Validation**: Ensure data compliance with your specified schemas
- **File Processing**: Handle various file formats (CSV, JSON, XML) with automatic decompression
- **Flexible Authentication**: Support for various auth methods including header auth, api keys, oauth, and more
- **Smart Pagination**: Handle different pagination styles automatically
- **Caching & Retry Logic**: Built-in caching and configurable retry strategies

## 📖 Documentation

For detailed documentation, visit [docs.superglue.cloud](https://docs.superglue.cloud).

## 🤝 contributing
We love contributions! Feel free to open issues for bugs or feature requests.

[//]: # (To contribute to the docs, check out the /docs folder.)

## license

superglue is GPL licensed. The superglue client SDKs are MIT licensed. See [LICENSE](LICENSE) for details.

## Next Steps

- [Join our Discord](https://discord.gg/vUKnuhHtfW)
- [Read our docs](https://docs.superglue.cloud/)
- [Talk to founders](https://cal.com/superglue/superglue-demo)

Text us! <br>
[![Twitter Adina](https://img.shields.io/twitter/follow/adinagoerres?style=flat-square&logo=X)](https://twitter.com/adinagoerres)
[![Twitter Stefan](https://img.shields.io/twitter/follow/sfaistenauer?style=flat-square&logo=X)](https://twitter.com/sfaistenauer)
[![Twitter](https://img.shields.io/twitter/follow/superglue_d?style=social)](https://twitter.com/superglue_d)

