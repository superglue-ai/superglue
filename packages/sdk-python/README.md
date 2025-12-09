# Superglue Python SDK

Auto-generated Python SDK for the Superglue AI API.

## Installation

```bash
pip install superglue-sdk
```

## Usage

```python
from uuid import UUID
from superglue_sdk import SuperglueClient
from superglue_sdk.api.runs import list_runs, get_run, cancel_run, run_tool
from superglue_sdk.models import RunRequest, RunRequestOptions

# Initialize client
client = SuperglueClient(
    base_url="https://api.superglue.ai/v1",
    token="YOUR_API_KEY"
)

# List runs
with client as c:
    runs = list_runs.sync(client=c, limit=10)
    print(f"Found {runs.total} runs")

# Run a tool (sync)
with client as c:
    result = run_tool.sync(
        tool_id="your-tool-id",
        client=c,
        body=RunRequest(
            inputs={"query": "latest AI news"},
            options=RunRequestOptions(async_=False)
        )
    )
    print(result.data)

# Run a tool (async)
with client as c:
    run = run_tool.sync(
        tool_id="your-tool-id",
        client=c,
        body=RunRequest(
            inputs={"query": "latest AI news"},
            options=RunRequestOptions(async_=True)
        )
    )
    
    # Poll until done
    import time
    while run.status == "running":
        time.sleep(1)
        run = get_run.sync(run_id=UUID(run.run_id), client=c)
    
    print(run.data)

# Cancel a run
with client as c:
    cancelled = cancel_run.sync(run_id=UUID("run-id"), client=c)
    print(cancelled.status)
```

## Generation

This SDK is auto-generated from the OpenAPI specification using [openapi-python-client](https://github.com/openapi-generators/openapi-python-client):

```bash
# From project root
./scripts/generate-python-sdk.sh
```

## Publishing to PyPI

```bash
cd packages/sdk-python/superglue_sdk
poetry publish --build
```

## License

FSL-1.1-Apache-2.0 - See [../../LICENSE](../../LICENSE) for details.
