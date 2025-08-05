I want to refactor the entire docs because they are outdated and not up to date with the latest changes. they are also suboptimal in terms of messaging. Here is what we need:
- a lander that explains what superglue is and what it does: superglue uses natural language to integrate and orchestrate APIs so humans can build faster, and agents can reliably execute across apps and data sources. 
- two personas we want to cater to that we want to target and offer specific documentation paths for: 
  - Agent builder & AI App builder
      - superglue is a tool that allows your agent to connect to and orchestrate APIs and data sources / dbs. to do that you can 1. connect superglue via mcp or build a tool using the sdk. To set up we use integrations (that are systems like stripe, hubspot, etc) for which we store credentials and docs in superglue. then we can adhoc build and run workflows on one or multiple apis. that means that we sort of offer a universal mcp tool to access any api or db. 
      - here the differentiation is between agent builder and ai app builder. the agent builder would possibly use us through mcp. the ai app builder needs to write code and therefore needs to use the sdk.
      - the other differentiation is permissioning / storing of credentials. superglue can store the credentials but you can also use your own credentials manager and just send the credentials to superglue at runtime when executing workflows.
      - the process is three-stepped: 1. you build a workflow and 2. you run / test it 3. you save it. mcp combines build and run.
  - Data engineer & API / integration engineer
      - this is a more technical persona. they are not building agents or ai apps but they are building the integrations and data sources.
      - they would use the ui/chat and potentially cursor via mcp. here we need to explain the difference between the ui/chat and the sdk. we have a benchmark where we explain that we are better than just vibe coding via curor: https://superglue.ai/api-ranking/
      - they are building data pipelines and integrations. so basically they can use superglue to build data pipelines and integrations and then either use the ui/chat or the sdk to execute them.

so, we ned a landing page with two mintlify sections / buttons for the two personas. for each we need a 30 second setup guide. i will add videos as well but for now let's focus on the text.
basically we need to answer the question: what is superglue? and what can it do for me? how do i get started? and how do i implement it with my existing tools?

