# tech-insights-mcp-actions-backend

Exposes [Backstage Tech Insights](https://backstage.io/docs/features/tech-insights/) as MCP (Model Context Protocol) actions, so AI assistants can query checks, facts, scorecards, and maturity ranks for your entities.

## Prerequisites

- [`@backstage-community/plugin-tech-insights-backend`](https://www.npmjs.com/package/@backstage-community/plugin-tech-insights-backend) must be installed and configured with checks
- [`@backstage/plugin-mcp-actions-backend`](https://www.npmjs.com/package/@backstage/plugin-mcp-actions-backend) must be installed to expose actions via MCP

## Setup

### 1. Install the plugin

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @surajnarwade/plugin-tech-insights-mcp-actions-backend
```

### 2. Register the plugin

Add to `packages/backend/src/index.ts`:

```ts
backend.add(import('@surajnarwade/plugin-tech-insights-mcp-actions-backend'));
```

### 3. Configure plugin sources

Since this is a separate plugin (not built into `tech-insights-backend`), you need to add it to the MCP actions plugin sources in `app-config.yaml`:

```yaml
backend:
  actions:
    pluginSources:
      - 'catalog'
      - 'tech-insights-mcp-actions'
```

> **Note:** If MCP actions were built into `tech-insights-backend` directly, this step wouldn't be needed. The separate plugin approach gives you flexibility to adopt it independently of the upstream tech-insights release cycle.

## Actions

| Action | Description |
|--------|-------------|
| `get-checks` | List all configured tech-insights checks |
| `run-checks` | Run checks for a specific entity |
| `get-entity-insights` | Comprehensive entity report — applicable checks with results, skipped checks with reasons, and latest facts |
| `get-entity-scorecard` | Concise compliance scorecard grouped by category with pass/fail percentages |
| `get-entity-maturity` | Maturity rank (🪨 Stone → 🥉 Bronze → 🥈 Silver → 🥇 Gold) with per-category breakdown |
| `get-fact-schemas` | List available fact schemas and their fields |
| `get-latest-facts` | Get the latest collected facts for an entity |
| `get-facts-range` | Get historical facts within a date range |

## How it works

The plugin registers MCP actions that communicate with the tech-insights and catalog backends via service-to-service auth. Key features:

- **Client-side filter matching** — Replicates the server-side `JsonRulesEngineFactChecker` filter logic to determine which checks apply to an entity. This enables `get-entity-insights` to explain *why* checks were skipped (e.g., "Requires spec.lifecycle to be 'production' but entity has 'deprecated'").

- **Maturity calculation** — Implements the same ranking algorithm as `@backstage-community/plugin-tech-insights-maturity`. Each check has a rank level (Bronze=1, Silver=2, Gold=3). The entity starts at the highest possible rank and drops for each failing check at or below the current rank.

- **Documentation links** — Failing checks include solution hints and links to relevant documentation when configured on the check.

## Example usage

Ask your AI assistant:

- "What's the maturity status of production-service-1?"
- "Show me the scorecard for my-api"
- "Why are checks being skipped for deprecated-service-1?"
- "What facts are collected for my component?"

## Adding new actions

Each action lives in its own file under `src/actions/`. To add a new action:

1. Create `src/actions/createMyNewAction.ts` following the existing pattern
2. Import and call it in `src/actions/index.ts`

## License

MIT
