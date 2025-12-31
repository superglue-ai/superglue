# SDK Integration Test

This folder contains integration tests for the published `@superglue/client` npm package against the local Superglue GraphQL server.

## Purpose

Test the published SDK's functionality by running a complete integration workflow:

1. Create a GitHub integration
2. List and verify the integration
3. Modify the integration
4. Build a tool using the integration
5. Execute the tool
6. Verify changes
7. Clean up (delete tool and integration)

This ensures the published SDK works correctly with the current GraphQL API implementation.

## Prerequisites

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required for SDK authentication
AUTH_TOKEN=your_auth_token_here

# Required for GitHub integration tests
GITHUB_API_TOKEN=your_github_token_here

# Optional: GraphQL server endpoint (defaults to http://localhost:3000)
GRAPHQL_ENDPOINT=http://localhost:3000
```

### GitHub API Token

You need a GitHub personal access token with `repo` scope:

1. Go to https://github.com/settings/tokens
2. Generate a new token (classic)
3. Select the `repo` scope
4. Copy the token and add it to your `.env` file

## Usage

From the project root directory:

```bash
npm run test:sdk
```

This command will:

1. Install dependencies in `eval/sdk-test/`
2. Start the Superglue GraphQL server (`packages/core`)
3. Wait for the server to be ready
4. Run the SDK integration tests
5. Stop the server automatically
6. Report test results

## What Gets Tested

### Integration CRUD Operations

- **Create**: Create a GitHub integration with credentials
- **Read**: List integrations and verify existence
- **Update**: Modify integration properties (name, keywords)
- **Delete**: Remove the integration

### Tool Operations

- **Build**: Generate a tool from an instruction using AI
- **Execute**: Run the tool and verify results
- **List**: Retrieve all tools and verify the created tool
- **Delete**: Remove the tool

### Cleanup Verification

- Verify deleted resources no longer appear in list operations

## Test Data

The test creates:

- **Integration ID**: `github-test`
- **Integration Name**: `GitHub` (updated to `GitHub Updated`)
- **Tool**: Dynamically generated based on instruction to list GitHub repositories

## Expected Output

Successful test run:

```
[2024-01-01T00:00:00.000Z] Step 0: Initializing SuperglueClient...
[2024-01-01T00:00:00.100Z] Step 1: Creating GitHub integration...
[2024-01-01T00:00:00.500Z] Step 1: ✓ Created integration: github-test - GitHub
...
[2024-01-01T00:00:10.000Z] Step 10: ✓ Verified tool cleanup

✅ All tests passed successfully!
```

## Troubleshooting

### Server Connection Issues

- Ensure the GraphQL server is accessible at the configured endpoint
- Check that the `AUTH_TOKEN` is valid
- Verify firewall/network settings allow localhost connections

### GitHub API Errors

- Verify `GITHUB_API_TOKEN` is valid and has the `repo` scope
- Check GitHub API rate limits
- Ensure the token hasn't expired

### Test Failures

- Review the step number where the test failed
- Check server logs in `packages/core` for detailed error messages
- Verify all environment variables are correctly set
- Try running with verbose logging enabled

## Development

To modify the tests:

1. Edit `index.ts` to add/modify test steps
2. Update this README if you add new environment variables or change test behavior
3. Run tests locally to verify changes

## Notes

- Tests use only the published `@superglue/client` npm package, not local code
- All resources created during tests are automatically cleaned up
- The test is idempotent and can be run multiple times
