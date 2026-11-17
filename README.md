# F&F 운영용 포크

원본 [winor30/mcp-server-datadog](https://github.com/winor30/mcp-server-datadog) (Apache-2.0) 의 F&F 운영 포크다. Orbit(mcp-orch)의 `datadog-mcp` 서버는 npm 게시본(`@winor30/mcp-server-datadog`) 대신 **이 레포의 릴리스 태그**를 설치한다.

- **배포 브랜치**: `release/fnf` (실행에 필요한 `build/` 를 커밋해 둔 브랜치). `main` 은 upstream 추적용이라 `build/` 가 없어 git 으로 설치하면 실행되지 않는다.
- **태그 규칙**: `v<원본 버전>-fnf.<N>` (예: `v1.8.0-fnf.1`). 한 번 올린 태그는 지우거나 옮기지 않는다 (pod 재기동 때 같은 태그를 다시 받는다).
- **v1.8.0-fnf.1 의 기준**: upstream `main` 0fd0fd4. npm 1.8.0 게시본에는 없는 의존성 취약점 수정(MCP SDK 1.32.1 등)이 들어 있다.
- **Orbit 설정**: `"command": "npx"`, `"args": ["-y", "github:fnf-process/mcp-server-datadog#v1.8.0-fnf.1"]` (wrapper 의 `preinstall_mcp_servers.py` 가 `git+https://github.com/...` 로 바꿔 `npm install` 한다). `DATADOG_API_KEY`, `DATADOG_APP_KEY`, `DATADOG_SITE` 는 기존대로 env 로 준다.
- **원본 npm 발행 워크플로는 막아 두었다**: `publish.yml` 은 `v*.*.*` 태그에 반응하므로 `repository_owner == 'winor30'` 가드를 걸었다. 이 포크에서 Release 를 만들거나 npm 발행을 시도하지 않는다.

## 갱신 절차 (upstream 머지 → build → 태그)

```bash
# 1. upstream 을 main 에 반영 (최초 1회: git remote add upstream https://github.com/winor30/mcp-server-datadog.git)
git fetch upstream && git checkout main && git merge upstream/main   # README 충돌 시 이 F&F 블록은 유지

# 2. release/fnf 에 main 을 병합하고 package.json 의 version 을 <원본 버전>-fnf.<N> 으로 올린다
git checkout release/fnf && git merge main
pnpm install --frozen-lockfile --ignore-scripts && pnpm test && pnpm build
git add -A && git commit -m "build: v<원본 버전>-fnf.<N>"

# 3. 태그와 푸시
git tag v<원본 버전>-fnf.<N> && git push origin release/fnf v<원본 버전>-fnf.<N>

# 4. Orbit datadog-mcp 의 args 태그를 바꿔 재배포 (옛 태그는 롤백용으로 남긴다)
```

`release/fnf` 가 `main` 과 다른 점은 세 가지뿐이다: `package.json` 의 `version` 과 `prepare`(husky) 제거, `.gitignore` 끝의 `!build/`, 그리고 `build/`. `prepare` 를 남기면 npm 이 git 설치 때 devDependencies 수백 개를 받아 `husky` 를 돌려 시작이 느려진다.

---

# Datadog MCP Server

> **DISCLAIMER**: This is a community-maintained project and is not officially affiliated with, endorsed by, or supported by Datadog, Inc. This MCP server utilizes the Datadog API but is developed independently as part of the [Model Context Protocol](https://github.com/modelcontextprotocol/servers) ecosystem.

![NPM Version](https://img.shields.io/npm/v/%40winor30%2Fmcp-server-datadog)![Build and Test](https://github.com/winor30/mcp-server-datadog/actions/workflows/ci.yml/badge.svg)[![codecov](https://codecov.io/gh/winor30/mcp-server-datadog/graph/badge.svg?token=BG4ZB74X92)](https://codecov.io/gh/winor30/mcp-server-datadog)[![smithery badge](https://smithery.ai/badge/@winor30/mcp-server-datadog)](https://smithery.ai/server/@winor30/mcp-server-datadog)

MCP server for the Datadog API, enabling incident management and more.

<a href="https://glama.ai/mcp/servers/bu8gtzkwfr">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/bu8gtzkwfr/badge" alt="mcp-server-datadog MCP server" />
</a>

## Features

- **Observability Tools**: Provides a mechanism to leverage key Datadog monitoring features, such as incidents, monitors, logs, dashboards, and metrics, through the MCP server.
- **Extensible Design**: Designed to easily integrate with additional Datadog APIs, allowing for seamless future feature expansion.

## Tools

1. `list_incidents`

   - Retrieve a list of incidents from Datadog.
   - **Inputs**:
     - `filter` (optional string): Filter parameters for incidents (e.g., status, priority).
     - `pagination` (optional object): Pagination details like page size/offset.
   - **Returns**: Array of Datadog incidents and associated metadata.

2. `get_incident`

   - Retrieve detailed information about a specific Datadog incident.
   - **Inputs**:
     - `incident_id` (string): Incident ID to fetch details for.
   - **Returns**: Detailed incident information (title, status, timestamps, etc.).

3. `get_monitors`

   - Fetch the status of Datadog monitors.
   - **Inputs**:
     - `groupStates` (optional array): States to filter (e.g., alert, warn, no data, ok).
     - `name` (optional string): Filter by name.
     - `tags` (optional array): Filter by tags.
   - **Returns**: Monitors data and a summary of their statuses.

4. `get_logs`

   - Search and retrieve logs from Datadog.
   - **Inputs**:
     - `query` (string): Datadog logs query string.
     - `from` (number): Start time in epoch seconds.
     - `to` (number): End time in epoch seconds.
     - `limit` (optional number): Maximum number of logs to return (defaults to 100).
   - **Returns**: Array of matching logs.

5. `list_dashboards`

   - Get a list of dashboards from Datadog.
   - **Inputs**:
     - `name` (optional string): Filter dashboards by name.
     - `tags` (optional array): Filter dashboards by tags.
   - **Returns**: Array of dashboards with URL references.

6. `get_dashboard`

   - Retrieve a specific dashboard from Datadog.
   - **Inputs**:
     - `dashboard_id` (string): ID of the dashboard to fetch.
   - **Returns**: Dashboard details including title, widgets, etc.

7. `query_metrics`

   - Retrieve metrics data from Datadog.
   - **Inputs**:
     - `query` (string): Metrics query string.
     - `from` (number): Start time in epoch seconds.
     - `to` (number): End time in epoch seconds.
   - **Returns**: Metrics data for the queried timeframe.

8. `list_traces`

   - Retrieve a list of APM traces from Datadog.
   - **Inputs**:
     - `query` (string): Datadog APM trace query string.
     - `from` (number): Start time in epoch seconds.
     - `to` (number): End time in epoch seconds.
     - `limit` (optional number): Maximum number of traces to return (defaults to 100).
     - `sort` (optional string): Sort order for traces (defaults to '-timestamp').
     - `service` (optional string): Filter by service name.
     - `operation` (optional string): Filter by operation name.
   - **Returns**: Array of matching traces from Datadog APM.

9. `list_hosts`

   - Get list of hosts from Datadog.
   - **Inputs**:
     - `filter` (optional string): Filter string for search results.
     - `sort_field` (optional string): Field to sort hosts by.
     - `sort_dir` (optional string): Sort direction (asc/desc).
     - `start` (optional number): Starting offset for pagination.
     - `count` (optional number): Max number of hosts to return (max: 1000).
     - `from` (optional number): Search hosts from this UNIX timestamp.
     - `include_muted_hosts_data` (optional boolean): Include muted hosts status and expiry.
     - `include_hosts_metadata` (optional boolean): Include host metadata (version, platform, etc).
   - **Returns**: Array of hosts with details including name, ID, aliases, apps, mute status, and more.

10. `get_active_hosts_count`

    - Get the total number of active hosts in Datadog.
    - **Inputs**:
      - `from` (optional number): Number of seconds from which you want to get total number of active hosts (defaults to 2h).
    - **Returns**: Count of total active and up hosts.

11. `mute_host`

    - Mute a host in Datadog.
    - **Inputs**:
      - `hostname` (string): The name of the host to mute.
      - `message` (optional string): Message to associate with the muting of this host.
      - `end` (optional number): POSIX timestamp for when the mute should end.
      - `override` (optional boolean): If true and the host is already muted, replaces existing end time.
    - **Returns**: Success status and confirmation message.

12. `unmute_host`

    - Unmute a host in Datadog.
    - **Inputs**:
      - `hostname` (string): The name of the host to unmute.
    - **Returns**: Success status and confirmation message.

13. `list_downtimes`

    - List scheduled downtimes from Datadog.
    - **Inputs**:
      - `currentOnly` (optional boolean): Return only currently active downtimes when true.
      - `monitorId` (optional number): Filter by monitor ID.
    - **Returns**: Array of scheduled downtimes with details including scope, monitor information, and schedule.

14. `schedule_downtime`

    - Schedule a downtime in Datadog.
    - **Inputs**:
      - `scope` (string): Scope to apply downtime to (e.g. 'host:my-host').
      - `start` (optional number): UNIX timestamp for the start of the downtime.
      - `end` (optional number): UNIX timestamp for the end of the downtime.
      - `message` (optional string): A message to include with the downtime.
      - `timezone` (optional string): The timezone for the downtime (e.g. 'UTC', 'America/New_York').
      - `monitorId` (optional number): The ID of the monitor to mute.
      - `monitorTags` (optional array): A list of monitor tags for filtering.
      - `recurrence` (optional object): Recurrence settings for the downtime.
        - `type` (string): Recurrence type ('days', 'weeks', 'months', 'years').
        - `period` (number): How often to repeat (must be >= 1).
        - `weekDays` (optional array): Days of the week for weekly recurrence.
        - `until` (optional number): UNIX timestamp for when the recurrence ends.
    - **Returns**: Scheduled downtime details including ID and active status.

15. `cancel_downtime`

    - Cancel a scheduled downtime in Datadog.
    - **Inputs**:
      - `downtimeId` (number): The ID of the downtime to cancel.
    - **Returns**: Confirmation of downtime cancellation.

16. `get_rum_applications`

    - Get all RUM applications in the organization.
    - **Inputs**: None.
    - **Returns**: List of RUM applications.

17. `get_rum_events`

    - Search and retrieve RUM events from Datadog.
    - **Inputs**:
      - `query` (string): Datadog RUM query string.
      - `from` (number): Start time in epoch seconds.
      - `to` (number): End time in epoch seconds.
      - `limit` (optional number): Maximum number of events to return (default: 100).
    - **Returns**: Array of RUM events.

18. `get_rum_grouped_event_count`

    - Search, group and count RUM events by a specified dimension.
    - **Inputs**:
      - `query` (optional string): Additional query filter for RUM search (default: "\*").
      - `from` (number): Start time in epoch seconds.
      - `to` (number): End time in epoch seconds.
      - `groupBy` (optional string): Dimension to group results by (default: "application.name").
    - **Returns**: Grouped event counts.

19. `get_rum_page_performance`

    - Get page (view) performance metrics from RUM data.
    - **Inputs**:
      - `query` (optional string): Additional query filter for RUM search (default: "\*").
      - `from` (number): Start time in epoch seconds.
      - `to` (number): End time in epoch seconds.
      - `metricNames` (array of strings): Array of metric names to retrieve (e.g., 'view.load_time', 'view.first_contentful_paint').
    - **Returns**: Performance metrics including average, min, max, and count for each metric.

20. `get_rum_page_waterfall`

    - Retrieve RUM page (view) waterfall data filtered by application name and session ID.
    - **Inputs**:
      - `applicationName` (string): Application name to filter events.
      - `sessionId` (string): Session ID to filter events.
    - **Returns**: Waterfall data for the specified application and session.

## Setup

### Datadog Credentials

You need valid Datadog API credentials to use this MCP server:

- `DATADOG_API_KEY`: Your Datadog API key
- `DATADOG_APP_KEY`: Your Datadog Application key
- `DATADOG_SITE` (optional): The Datadog site (e.g. `datadoghq.eu`)
- `DATADOG_SUBDOMAIN` (optional): The Datadog subdomain (e.g. `<your-subdomain>.datadoghq.com`)
- `DATADOG_STORAGE_TIER` (optional): Logs storage tier for v2 logs searches. Supported values: `indexes`, `online-archives`, or `flex`.

Export them in your environment before running the server:

```bash
export DATADOG_API_KEY="your_api_key"
export DATADOG_APP_KEY="your_app_key"
export DATADOG_SITE="your_datadog_site" # Optional
export DATADOG_SUBDOMAIN="your_datadog_subdomain" # Optional
export DATADOG_STORAGE_TIER="flex" # Optional: indexes | online-archives | flex
```

## Installation

### Installing via Smithery

To install Datadog MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@winor30/mcp-server-datadog):

```bash
npx -y @smithery/cli install @winor30/mcp-server-datadog --client claude
```

### Manual Installation

```bash
pnpm install
pnpm build
pnpm watch   # for development with auto-rebuild
```

## Usage with Claude Desktop

To use this with Claude Desktop, add the following to your `claude_desktop_config.json`:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

```json
{
  "mcpServers": {
    "datadog": {
      "command": "/path/to/mcp-server-datadog/build/index.js",
      "env": {
        "DATADOG_API_KEY": "<YOUR_API_KEY>",
        "DATADOG_APP_KEY": "<YOUR_APP_KEY>",
        "DATADOG_SITE": "<YOUR_SITE>", // Optional
        "DATADOG_SUBDOMAIN": "<YOUR_SUBDOMAIN>", // Optional
        "DATADOG_STORAGE_TIER": "indexes" // Optional: indexes | online-archives | flex
      }
    }
  }
}
```

Or specify via `npx`:

```json
{
  "mcpServers": {
    "mcp-server-datadog": {
      "command": "npx",
      "args": ["-y", "@winor30/mcp-server-datadog"],
      "env": {
        "DATADOG_API_KEY": "<YOUR_API_KEY>",
        "DATADOG_APP_KEY": "<YOUR_APP_KEY>",
        "DATADOG_SITE": "<YOUR_SITE>", // Optional
        "DATADOG_SUBDOMAIN": "<YOUR_SUBDOMAIN>", // Optional
        "DATADOG_STORAGE_TIER": "indexes" // Optional: indexes | online-archives | flex
      }
    }
  }
}
```

## Debugging

Because MCP servers communicate over standard input/output, debugging can sometimes be tricky. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector). You can run the inspector with:

```bash
npm run inspector
```

The inspector will provide a URL you can open in your browser to see logs and send requests manually.

## Contributing

Contributions are welcome! Feel free to open an issue or a pull request if you have any suggestions, bug reports, or improvements to propose.

## License

This project is licensed under the [Apache License, Version 2.0](./LICENSE).
