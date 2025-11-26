
<p align="center">
  <img src="https://github.com/user-attachments/assets/be0e65d4-dcd8-4133-9841-b08799e087e7" width="350" alt="superglue_logo_white">
</p>

<h2 align="center">Build production-grade integrations & tools in natural language.</h2>
<div align="center">
  
 [![GitHub](https://img.shields.io/github/license/superglue-ai/superglue?style=flat-square)](https://github.com/superglue-ai/superglue/blob/main/LICENSE)
[![Y Combinator](https://img.shields.io/badge/Y%20Combinator-W25-orange?style=flat-square)](https://www.ycombinator.com/companies/superglue)
[![Client SDK](https://img.shields.io/npm/v/@superglue/client?style=flat-square&logo=npm)](https://www.npmjs.com/package/@superglue/client)
[![Docker](https://img.shields.io/docker/pulls/superglueai/superglue?style=flat-square&logo=Docker)](https://hub.docker.com/r/superglueai/superglue)
[![Weave Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fapp.workweave.ai%2Fapi%2Frepository%2Fbadge%2Forg_0S2o9PLamHvNsTjHbszc38vC%2F914997268&cacheSeconds=3600&labelColor=#EC6341)](https://app.workweave.ai/reports/repository/org_0S2o9PLamHvNsTjHbszc38vC/914997268)

</div>

## What is superglue?
- superglue is an AI-powered tool builder that works with any API, database or file storage server
- Abstracts away authentication, documentation handling and data mapping between systems
- Self‑heals tools: When steps fail due to upstream API changes, superglue can auto-repair failures to keep your tools running

## What people build with superglue
- Lightweight and maintainable data syncing tools across legacy systems
- Migrations of complex SQL procedures to REST API calls in cloud migrations
- Enterprise GPT tools: expose tools that work with custom legacy systems in your enterprise GPT

## Quick Start
### Option 1: Sign up to [superglue](https://app.superglue.cloud) and start building immediately
### Option 2: [Self-host](https://docs.superglue.cloud/getting-started/setup#self-hosted) for maximum control and customization

## Interfaces

You can interact with superglue via three interfaces, regardless of whether you self-host or use the hosted version:

**Web application**
  - The web application is available for self-hosted and superglue-hosted setups
  - If you decide to use a superglue-hosted setup, the web application has features that are not available when self-hosting (e.g. the superglue agent)
  - When doing local development on your self-hosted setup, you can customize the web application to your needs

**superglue SDK**

  - The superglue SDK offers CRUD functionality for all superglue data types and lets you execute tools programmatically
  - For more detailed information on SDK functionality, check our [SDK guide](https://docs.superglue.cloud/sdk/overview)

    Install via npm:
    ```bash
      npm install @superglue/client 
    ```
    
    Client setup:
    ```javascript
      // Typescript SDK
      import { SuperglueClient } from "@superglue/client";

      const superglue = new SuperglueClient({
        apiKey: "your_api_key_here", // Get from app.superglue.cloud
        baseUrl: "https://api.superglue.cloud", // Optional, defaults to hosted version but can be localhost when self-hosting
      });
    ```

**MCP Server**
  - Look at our [MCP Guide](https://docs.superglue.cloud/mcp/using-the-mcp) for full installation instructions
  - The MCP interface gives you discoverability tools and execution capabilities for your pre-built superglue tools
  - The MCP does not support ad-hoc integration creation or tool building
  - Use MCP in production for agentic use cases and internal GPTs to access and execute pre-built tools with full control

## 📖 Documentation

For detailed documentation, visit [docs.superglue.cloud](https://docs.superglue.cloud).

## 🤝 Contributing
We love contributions! Before making contributions, we ask that all users read through our [contribution guide](https://github.com/superglue-ai/superglue/blob/main/CONTRIBUTING.md) and sign the Contributor License Agreement (CLA). When creating new issues or pull requests, please ensure compliance with the contribution guide.

[//]: # (To contribute to the docs, check out the /docs folder.)

## License

superglue is FSL licensed. The superglue client SDKs are MIT licensed. See [LICENSE](LICENSE) for details.

## Next Steps

- [Join our Discord](https://discord.gg/vUKnuhHtfW)
- [Read our docs](https://docs.superglue.cloud/)
- [Talk to us](https://cal.com/superglue/superglue-demo)

Text us! <br>
[![Twitter Adina](https://img.shields.io/twitter/follow/adinagoerres?style=flat-square&logo=X)](https://twitter.com/adinagoerres)
[![Twitter Stefan](https://img.shields.io/twitter/follow/sfaistenauer?style=flat-square&logo=X)](https://twitter.com/sfaistenauer)
[![Twitter](https://img.shields.io/twitter/follow/superglue_d?style=social)](https://twitter.com/superglue_d)

