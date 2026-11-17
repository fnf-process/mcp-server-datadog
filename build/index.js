#!/usr/bin/env node

// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// package.json
var version = "1.8.0-fnf.1";

// src/utils/helper.ts
function log(severity, ...args) {
  const msg = `[${severity.toUpperCase()} ${(/* @__PURE__ */ new Date()).toISOString()}] ${args.join(" ")}
`;
  process.stderr.write(msg);
}
function unreachable(value) {
  throw new Error(`Unreachable code: ${value}`);
}

// src/utils/tool.ts
import zodToJsonSchema from "zod-to-json-schema";
function pickRootObjectProperty(fullSchema, schemaName) {
  const definitions = fullSchema.definitions ?? {};
  const root = definitions[schemaName];
  return {
    type: "object",
    properties: root?.properties ?? {},
    required: root?.required ?? []
  };
}
function createToolSchema(schema, name, description) {
  return {
    name,
    description,
    inputSchema: pickRootObjectProperty(
      zodToJsonSchema(schema, { name }),
      name
    )
  };
}

// src/tools/incident/schema.ts
import { z } from "zod";
var ListIncidentsZodSchema = z.object({
  pageSize: z.number().min(1).max(100).default(10),
  pageOffset: z.number().min(0).default(0)
});
var GetIncidentZodSchema = z.object({
  incidentId: z.string().nonempty()
});

// src/tools/incident/tool.ts
var INCIDENT_TOOLS = [
  createToolSchema(
    ListIncidentsZodSchema,
    "list_incidents",
    "Get incidents from Datadog"
  ),
  createToolSchema(
    GetIncidentZodSchema,
    "get_incident",
    "Get an incident from Datadog"
  )
];
var createIncidentToolHandlers = (apiInstance) => {
  return {
    list_incidents: async (request) => {
      const { pageSize, pageOffset } = ListIncidentsZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.listIncidents({
        pageSize,
        pageOffset
      });
      if (response.data == null) {
        throw new Error("No incidents data returned");
      }
      return {
        content: [
          {
            type: "text",
            text: `Listed incidents:
${response.data.map((d) => JSON.stringify(d)).join("\n")}`
          }
        ]
      };
    },
    get_incident: async (request) => {
      const { incidentId } = GetIncidentZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.getIncident({
        incidentId
      });
      if (response.data == null) {
        throw new Error("No incident data returned");
      }
      return {
        content: [
          {
            type: "text",
            text: `Incident: ${JSON.stringify(response.data)}`
          }
        ]
      };
    }
  };
};

// src/tools/metrics/schema.ts
import { z as z2 } from "zod";
var QueryMetricsZodSchema = z2.object({
  from: z2.number().describe(
    "Start of the queried time period, seconds since the Unix epoch."
  ),
  to: z2.number().describe("End of the queried time period, seconds since the Unix epoch."),
  query: z2.string().describe('Datadog metrics query string. e.g. "avg:system.cpu.user{*}')
});

// src/tools/metrics/tool.ts
var METRICS_TOOLS = [
  createToolSchema(
    QueryMetricsZodSchema,
    "query_metrics",
    "Query timeseries points of metrics from Datadog"
  )
];
var createMetricsToolHandlers = (apiInstance) => {
  return {
    query_metrics: async (request) => {
      const { from, to, query } = QueryMetricsZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.queryMetrics({
        from,
        to,
        query
      });
      return {
        content: [
          {
            type: "text",
            text: `Queried metrics data: ${JSON.stringify({ response })}`
          }
        ]
      };
    }
  };
};

// src/tools/logs/schema.ts
import { z as z3 } from "zod";
var GetLogsZodSchema = z3.object({
  query: z3.string().default("").describe("Datadog logs query string"),
  from: z3.number().describe("Start time in epoch seconds"),
  to: z3.number().describe("End time in epoch seconds"),
  limit: z3.number().optional().default(100).describe("Maximum number of logs to return. Default is 100.")
});
var GetAllServicesZodSchema = z3.object({
  query: z3.string().default("*").describe("Optional query filter for log search"),
  from: z3.number().describe("Start time in epoch seconds"),
  to: z3.number().describe("End time in epoch seconds"),
  limit: z3.number().optional().default(1e3).describe("Maximum number of logs to search through. Default is 1000.")
});

// src/tools/logs/tool.ts
var SUPPORTED_STORAGE_TIERS = ["indexes", "online-archives", "flex"];
function getConfiguredStorageTier() {
  const value = process.env.DATADOG_STORAGE_TIER;
  if (!value) {
    return void 0;
  }
  const normalized = value.toLowerCase();
  if (!SUPPORTED_STORAGE_TIERS.includes(normalized)) {
    log(
      "error",
      `Invalid DATADOG_STORAGE_TIER="${value}". Supported values: ${SUPPORTED_STORAGE_TIERS.join(
        ", "
      )}`
    );
    return void 0;
  }
  return normalized;
}
var LOGS_TOOLS = [
  createToolSchema(
    GetLogsZodSchema,
    "get_logs",
    "Search and retrieve logs from Datadog"
  ),
  createToolSchema(
    GetAllServicesZodSchema,
    "get_all_services",
    "Extract all unique service names from logs"
  )
];
var createLogsToolHandlers = (apiInstance) => ({
  get_logs: async (request) => {
    const { query, from, to, limit } = GetLogsZodSchema.parse(
      request.params.arguments
    );
    const configuredStorageTier = getConfiguredStorageTier();
    const filter = {
      query,
      // `from` and `to` are in epoch seconds, but the Datadog API expects milliseconds
      from: `${from * 1e3}`,
      to: `${to * 1e3}`
    };
    if (configuredStorageTier) {
      filter.storageTier = configuredStorageTier;
    }
    const response = await apiInstance.listLogs({
      body: {
        filter,
        page: {
          limit
        },
        sort: "-timestamp"
      }
    });
    if (response.data == null) {
      throw new Error("No logs data returned");
    }
    return {
      content: [
        {
          type: "text",
          text: `Logs data: ${JSON.stringify(response.data)}`
        }
      ]
    };
  },
  get_all_services: async (request) => {
    const { query, from, to, limit } = GetAllServicesZodSchema.parse(
      request.params.arguments
    );
    const configuredStorageTier = getConfiguredStorageTier();
    const filter = {
      query,
      // `from` and `to` are in epoch seconds, but the Datadog API expects milliseconds
      from: `${from * 1e3}`,
      to: `${to * 1e3}`
    };
    if (configuredStorageTier) {
      filter.storageTier = configuredStorageTier;
    }
    const response = await apiInstance.listLogs({
      body: {
        filter,
        page: {
          limit
        },
        sort: "-timestamp"
      }
    });
    if (response.data == null) {
      throw new Error("No logs data returned");
    }
    const services = /* @__PURE__ */ new Set();
    for (const log2 of response.data) {
      if (log2.attributes && log2.attributes.service) {
        services.add(log2.attributes.service);
      }
    }
    return {
      content: [
        {
          type: "text",
          text: `Services: ${JSON.stringify(Array.from(services).sort())}`
        }
      ]
    };
  }
});

// src/tools/monitors/schema.ts
import { z as z4 } from "zod";
var GetMonitorsZodSchema = z4.object({
  groupStates: z4.array(z4.enum(["alert", "warn", "no data", "ok"])).optional().describe("Filter monitors by their states"),
  name: z4.string().optional().describe("Filter monitors by name"),
  tags: z4.array(z4.string()).optional().describe("Filter monitors by tags")
});

// src/tools/monitors/tool.ts
import { UnparsedObject } from "@datadog/datadog-api-client/dist/packages/datadog-api-client-common/util.js";
var MONITORS_TOOLS = [
  createToolSchema(
    GetMonitorsZodSchema,
    "get_monitors",
    "Get monitors status from Datadog"
  )
];
var createMonitorsToolHandlers = (apiInstance) => {
  return {
    get_monitors: async (request) => {
      const { groupStates, name, tags } = GetMonitorsZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.listMonitors({
        groupStates: groupStates?.join(","),
        name,
        tags: tags?.join(",")
      });
      if (response == null) {
        throw new Error("No monitors data returned");
      }
      const monitors = response.map((monitor) => ({
        name: monitor.name || "",
        id: monitor.id || 0,
        status: monitor.overallState || "unknown",
        message: monitor.message,
        tags: monitor.tags || [],
        query: monitor.query || "",
        lastUpdatedTs: monitor.modified ? Math.floor(new Date(monitor.modified).getTime() / 1e3) : void 0
      }));
      const summary = response.reduce(
        (acc, monitor) => {
          const status = monitor.overallState;
          if (status == null || status instanceof UnparsedObject) {
            return acc;
          }
          switch (status) {
            case "Alert":
              acc.alert++;
              break;
            case "Warn":
              acc.warn++;
              break;
            case "No Data":
              acc.noData++;
              break;
            case "OK":
              acc.ok++;
              break;
            case "Ignored":
              acc.ignored++;
              break;
            case "Skipped":
              acc.skipped++;
              break;
            case "Unknown":
              acc.unknown++;
              break;
            default:
              unreachable(status);
          }
          return acc;
        },
        {
          alert: 0,
          warn: 0,
          noData: 0,
          ok: 0,
          ignored: 0,
          skipped: 0,
          unknown: 0
        }
      );
      return {
        content: [
          {
            type: "text",
            text: `Monitors: ${JSON.stringify(monitors)}`
          },
          {
            type: "text",
            text: `Summary of monitors: ${JSON.stringify(summary)}`
          }
        ]
      };
    }
  };
};

// src/tools/dashboards/schema.ts
import { z as z5 } from "zod";
var ListDashboardsZodSchema = z5.object({
  name: z5.string().optional().describe("Filter dashboards by name"),
  tags: z5.array(z5.string()).optional().describe("Filter dashboards by tags")
});
var GetDashboardZodSchema = z5.object({
  dashboardId: z5.string()
});

// src/tools/dashboards/tool.ts
var DASHBOARDS_TOOLS = [
  createToolSchema(
    ListDashboardsZodSchema,
    "list_dashboards",
    "Get list of dashboards from Datadog"
  ),
  createToolSchema(
    GetDashboardZodSchema,
    "get_dashboard",
    "Get a dashboard from Datadog"
  )
];
var createDashboardsToolHandlers = (apiInstance) => {
  return {
    list_dashboards: async (request) => {
      const { name, tags } = ListDashboardsZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.listDashboards({
        filterShared: false
      });
      if (!response.dashboards) {
        throw new Error("No dashboards data returned");
      }
      let filteredDashboards = response.dashboards;
      if (name) {
        const searchTerm = name.toLowerCase();
        filteredDashboards = filteredDashboards.filter(
          (dashboard) => dashboard.title?.toLowerCase().includes(searchTerm)
        );
      }
      if (tags && tags.length > 0) {
        filteredDashboards = filteredDashboards.filter((dashboard) => {
          const dashboardTags = dashboard.description?.split(",") || [];
          return tags.every((tag) => dashboardTags.includes(tag));
        });
      }
      const dashboards = filteredDashboards.map((dashboard) => ({
        ...dashboard,
        url: `https://app.datadoghq.com/dashboard/${dashboard.id}`
      }));
      return {
        content: [
          {
            type: "text",
            text: `Dashboards: ${JSON.stringify(dashboards)}`
          }
        ]
      };
    },
    get_dashboard: async (request) => {
      const { dashboardId } = GetDashboardZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.getDashboard({
        dashboardId
      });
      return {
        content: [
          {
            type: "text",
            text: `Dashboard: ${JSON.stringify(response)}`
          }
        ]
      };
    }
  };
};

// src/tools/traces/schema.ts
import { z as z6 } from "zod";
var ListTracesZodSchema = z6.object({
  query: z6.string().describe("Datadog APM trace query string"),
  from: z6.number().describe("Start time in epoch seconds"),
  to: z6.number().describe("End time in epoch seconds"),
  limit: z6.number().optional().default(100).describe("Maximum number of traces to return"),
  sort: z6.enum(["timestamp", "-timestamp"]).optional().default("-timestamp").describe("Sort order for traces"),
  service: z6.string().optional().describe("Filter by service name"),
  operation: z6.string().optional().describe("Filter by operation name")
});

// src/tools/traces/tool.ts
var TRACES_TOOLS = [
  createToolSchema(
    ListTracesZodSchema,
    "list_traces",
    "Get APM traces from Datadog"
  )
];
var createTracesToolHandlers = (apiInstance) => {
  return {
    list_traces: async (request) => {
      const {
        query,
        from,
        to,
        limit = 100,
        sort = "-timestamp",
        service,
        operation
      } = ListTracesZodSchema.parse(request.params.arguments);
      const response = await apiInstance.listSpans({
        body: {
          data: {
            attributes: {
              filter: {
                query: [
                  query,
                  ...service ? [`service:${service}`] : [],
                  ...operation ? [`operation:${operation}`] : []
                ].join(" "),
                from: new Date(from * 1e3).toISOString(),
                to: new Date(to * 1e3).toISOString()
              },
              sort,
              page: { limit }
            },
            type: "search_request"
          }
        }
      });
      if (!response.data) {
        throw new Error("No traces data returned");
      }
      return {
        content: [
          {
            type: "text",
            text: `Traces: ${JSON.stringify({
              traces: response.data,
              count: response.data.length
            })}`
          }
        ]
      };
    }
  };
};

// src/tools/hosts/schema.ts
import { z as z7 } from "zod";
var MuteHostZodSchema = z7.object({
  hostname: z7.string().describe("The name of the host to mute"),
  message: z7.string().optional().describe("Message to associate with the muting of this host"),
  end: z7.number().int().optional().describe("POSIX timestamp for when the mute should end"),
  override: z7.boolean().optional().default(false).describe(
    "If true and the host is already muted, replaces existing end time"
  )
});
var UnmuteHostZodSchema = z7.object({
  hostname: z7.string().describe("The name of the host to unmute")
});
var GetActiveHostsCountZodSchema = z7.object({
  from: z7.number().int().optional().default(7200).describe(
    "Number of seconds from which you want to get total number of active hosts (defaults to 2h)"
  )
});
var ListHostsZodSchema = z7.object({
  filter: z7.string().optional().describe("Filter string for search results"),
  sort_field: z7.string().optional().describe("Field to sort hosts by"),
  sort_dir: z7.string().optional().describe("Sort direction (asc/desc)"),
  start: z7.number().int().optional().describe("Starting offset for pagination"),
  count: z7.number().int().max(1e3).optional().describe("Max number of hosts to return (max: 1000)"),
  from: z7.number().int().optional().describe("Search hosts from this UNIX timestamp"),
  include_muted_hosts_data: z7.boolean().optional().describe("Include muted hosts status and expiry"),
  include_hosts_metadata: z7.boolean().optional().describe("Include host metadata (version, platform, etc)")
});

// src/tools/hosts/tool.ts
var HOSTS_TOOLS = [
  createToolSchema(MuteHostZodSchema, "mute_host", "Mute a host in Datadog"),
  createToolSchema(
    UnmuteHostZodSchema,
    "unmute_host",
    "Unmute a host in Datadog"
  ),
  createToolSchema(
    ListHostsZodSchema,
    "list_hosts",
    "Get list of hosts from Datadog"
  ),
  createToolSchema(
    GetActiveHostsCountZodSchema,
    "get_active_hosts_count",
    "Get the total number of active hosts in Datadog (defaults to last 5 minutes)"
  )
];
var createHostsToolHandlers = (apiInstance) => {
  return {
    /**
     * Mutes a specified host in Datadog.
     * Silences alerts and notifications for the host until unmuted or until the specified end time.
     */
    mute_host: async (request) => {
      const { hostname, message, end, override } = MuteHostZodSchema.parse(
        request.params.arguments
      );
      await apiInstance.muteHost({
        hostName: hostname,
        body: {
          message,
          end,
          override
        }
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                message: `Host ${hostname} has been muted successfully${message ? ` with message: ${message}` : ""}${end ? ` until ${new Date(end * 1e3).toISOString()}` : ""}`
              },
              null,
              2
            )
          }
        ]
      };
    },
    /**
     * Unmutes a previously muted host in Datadog.
     * Re-enables alerts and notifications for the specified host.
     */
    unmute_host: async (request) => {
      const { hostname } = UnmuteHostZodSchema.parse(request.params.arguments);
      await apiInstance.unmuteHost({
        hostName: hostname
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                message: `Host ${hostname} has been unmuted successfully`
              },
              null,
              2
            )
          }
        ]
      };
    },
    /**
     * Retrieves counts of active and up hosts in Datadog.
     * Provides total counts of hosts that are reporting and operational.
     */
    get_active_hosts_count: async (request) => {
      const { from } = GetActiveHostsCountZodSchema.parse(
        request.params.arguments
      );
      const response = await apiInstance.getHostTotals({
        from
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_active: response.totalActive || 0,
                // Total number of active hosts (UP and reporting) to Datadog
                total_up: response.totalUp || 0
                // Number of hosts that are UP and reporting to Datadog
              },
              null,
              2
            )
          }
        ]
      };
    },
    /**
     * Lists and filters hosts monitored by Datadog.
     * Supports comprehensive querying with filtering, sorting, and pagination.
     * Returns detailed host information including status, metadata, and monitoring data.
     */
    list_hosts: async (request) => {
      const {
        filter,
        sort_field,
        sort_dir,
        start,
        count,
        from,
        include_muted_hosts_data,
        include_hosts_metadata
      } = ListHostsZodSchema.parse(request.params.arguments);
      const response = await apiInstance.listHosts({
        filter,
        sortField: sort_field,
        sortDir: sort_dir,
        start,
        count,
        from,
        includeMutedHostsData: include_muted_hosts_data,
        includeHostsMetadata: include_hosts_metadata
      });
      if (!response.hostList) {
        throw new Error("No hosts data returned");
      }
      const hosts = response.hostList.map((host) => ({
        name: host.name,
        id: host.id,
        aliases: host.aliases,
        apps: host.apps,
        mute: host.isMuted,
        last_reported: host.lastReportedTime,
        meta: host.meta,
        metrics: host.metrics,
        sources: host.sources,
        up: host.up,
        url: `https://app.datadoghq.com/infrastructure?host=${host.name}`
      }));
      return {
        content: [
          {
            type: "text",
            text: `Hosts: ${JSON.stringify(hosts)}`
          }
        ]
      };
    }
  };
};

// src/utils/datadog.ts
import { client } from "@datadog/datadog-api-client";
function createDatadogConfig(config) {
  if (!config.apiKeyAuth || !config.appKeyAuth) {
    throw new Error("Datadog API key and APP key are required");
  }
  const datadogConfig2 = client.createConfiguration({
    authMethods: {
      apiKeyAuth: config.apiKeyAuth,
      appKeyAuth: config.appKeyAuth
    }
  });
  if (config.site != null) {
    datadogConfig2.setServerVariables({
      site: config.site
    });
  }
  if (config.subdomain != null) {
    datadogConfig2.setServerVariables({
      subdomain: config.subdomain
    });
  }
  datadogConfig2.unstableOperations = {
    "v2.listIncidents": true,
    "v2.getIncident": true
  };
  return datadogConfig2;
}

// src/tools/downtimes/schema.ts
import { z as z8 } from "zod";
var ListDowntimesZodSchema = z8.object({
  currentOnly: z8.boolean().optional()
});
var ScheduleDowntimeZodSchema = z8.object({
  scope: z8.string().nonempty(),
  // example: 'host:my-host'
  start: z8.number().optional(),
  // UNIX timestamp
  end: z8.number().optional(),
  // UNIX timestamp
  message: z8.string().optional(),
  timezone: z8.string().optional(),
  // example: 'UTC', 'America/New_York'
  monitorId: z8.number().optional(),
  monitorTags: z8.array(z8.string()).optional(),
  recurrence: z8.object({
    type: z8.enum(["days", "weeks", "months", "years"]),
    period: z8.number().min(1),
    weekDays: z8.array(z8.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).optional(),
    until: z8.number().optional()
    // UNIX timestamp
  }).optional()
});
var CancelDowntimeZodSchema = z8.object({
  downtimeId: z8.number()
});

// src/tools/downtimes/tool.ts
var DOWNTIMES_TOOLS = [
  createToolSchema(
    ListDowntimesZodSchema,
    "list_downtimes",
    "List scheduled downtimes from Datadog"
  ),
  createToolSchema(
    ScheduleDowntimeZodSchema,
    "schedule_downtime",
    "Schedule a downtime in Datadog"
  ),
  createToolSchema(
    CancelDowntimeZodSchema,
    "cancel_downtime",
    "Cancel a scheduled downtime in Datadog"
  )
];
var createDowntimesToolHandlers = (apiInstance) => {
  return {
    list_downtimes: async (request) => {
      const { currentOnly } = ListDowntimesZodSchema.parse(
        request.params.arguments
      );
      const res = await apiInstance.listDowntimes({
        currentOnly
      });
      return {
        content: [
          {
            type: "text",
            text: `Listed downtimes:
${JSON.stringify(res, null, 2)}`
          }
        ]
      };
    },
    schedule_downtime: async (request) => {
      const params = ScheduleDowntimeZodSchema.parse(request.params.arguments);
      const downtimeData = {
        scope: [params.scope],
        start: params.start,
        end: params.end,
        message: params.message,
        timezone: params.timezone,
        monitorId: params.monitorId,
        monitorTags: params.monitorTags
      };
      if (params.recurrence) {
        downtimeData.recurrence = {
          type: params.recurrence.type,
          period: params.recurrence.period,
          weekDays: params.recurrence.weekDays
        };
      }
      const res = await apiInstance.createDowntime({
        body: downtimeData
      });
      return {
        content: [
          {
            type: "text",
            text: `Scheduled downtime: ${JSON.stringify(res, null, 2)}`
          }
        ]
      };
    },
    cancel_downtime: async (request) => {
      const { downtimeId } = CancelDowntimeZodSchema.parse(
        request.params.arguments
      );
      await apiInstance.cancelDowntime({
        downtimeId
      });
      return {
        content: [
          {
            type: "text",
            text: `Cancelled downtime with ID: ${downtimeId}`
          }
        ]
      };
    }
  };
};

// src/tools/rum/schema.ts
import { z as z9 } from "zod";
var GetRumEventsZodSchema = z9.object({
  query: z9.string().default("").describe("Datadog RUM query string"),
  from: z9.number().describe("Start time in epoch seconds"),
  to: z9.number().describe("End time in epoch seconds"),
  limit: z9.number().optional().default(100).describe("Maximum number of events to return. Default is 100.")
});
var GetRumApplicationsZodSchema = z9.object({});
var GetRumGroupedEventCountZodSchema = z9.object({
  query: z9.string().default("*").describe("Optional query filter for RUM search"),
  from: z9.number().describe("Start time in epoch seconds"),
  to: z9.number().describe("End time in epoch seconds"),
  groupBy: z9.string().optional().default("application.name").describe("Dimension to group results by. Default is application.name")
});
var GetRumPagePerformanceZodSchema = z9.object({
  query: z9.string().default("*").describe("Optional query filter for RUM search"),
  from: z9.number().describe("Start time in epoch seconds"),
  to: z9.number().describe("End time in epoch seconds"),
  metricNames: z9.array(z9.string()).default([
    "view.load_time",
    "view.first_contentful_paint",
    "view.largest_contentful_paint"
  ]).describe("Array of metric names to retrieve")
});
var GetRumPageWaterfallZodSchema = z9.object({
  applicationName: z9.string().describe("Application name to filter events"),
  sessionId: z9.string().describe("Session ID to filter events")
});

// src/tools/rum/tool.ts
var RUM_TOOLS = [
  createToolSchema(
    GetRumApplicationsZodSchema,
    "get_rum_applications",
    "Get all RUM applications in the organization"
  ),
  createToolSchema(
    GetRumEventsZodSchema,
    "get_rum_events",
    "Search and retrieve RUM events from Datadog"
  ),
  createToolSchema(
    GetRumGroupedEventCountZodSchema,
    "get_rum_grouped_event_count",
    "Search, group and count RUM events by a specified dimension"
  ),
  createToolSchema(
    GetRumPagePerformanceZodSchema,
    "get_rum_page_performance",
    "Get page (view) performance metrics from RUM data"
  ),
  createToolSchema(
    GetRumPageWaterfallZodSchema,
    "get_rum_page_waterfall",
    "Retrieve RUM page (view) waterfall data filtered by application name and session ID"
  )
];
var createRumToolHandlers = (apiInstance) => ({
  get_rum_applications: async (request) => {
    GetRumApplicationsZodSchema.parse(request.params.arguments);
    const response = await apiInstance.getRUMApplications();
    if (response.data == null) {
      throw new Error("No RUM applications data returned");
    }
    return {
      content: [
        {
          type: "text",
          text: `RUM applications: ${JSON.stringify(response.data)}`
        }
      ]
    };
  },
  get_rum_events: async (request) => {
    const { query, from, to, limit } = GetRumEventsZodSchema.parse(
      request.params.arguments
    );
    const response = await apiInstance.listRUMEvents({
      filterQuery: query,
      filterFrom: new Date(from * 1e3),
      filterTo: new Date(to * 1e3),
      sort: "timestamp",
      pageLimit: limit
    });
    if (response.data == null) {
      throw new Error("No RUM events data returned");
    }
    return {
      content: [
        {
          type: "text",
          text: `RUM events data: ${JSON.stringify(response.data)}`
        }
      ]
    };
  },
  get_rum_grouped_event_count: async (request) => {
    const { query, from, to, groupBy } = GetRumGroupedEventCountZodSchema.parse(
      request.params.arguments
    );
    const response = await apiInstance.listRUMEvents({
      filterQuery: query !== "*" ? query : void 0,
      filterFrom: new Date(from * 1e3),
      filterTo: new Date(to * 1e3),
      sort: "timestamp",
      pageLimit: 2e3
    });
    if (response.data == null) {
      throw new Error("No RUM events data returned");
    }
    const sessions = /* @__PURE__ */ new Map();
    for (const event of response.data) {
      if (!event.attributes?.attributes) {
        continue;
      }
      const groupPath = groupBy.split(".");
      const result = getValueByPath(
        event.attributes.attributes,
        groupPath.map((path) => String(path))
      );
      const groupValue = result.found ? String(result.value) : "unknown";
      if (!sessions.has(groupValue)) {
        sessions.set(groupValue, /* @__PURE__ */ new Set());
      }
      if (event.attributes.attributes.session?.id) {
        sessions.get(groupValue)?.add(event.attributes.attributes.session.id);
      }
    }
    const sessionCounts = Object.fromEntries(
      Array.from(sessions.entries()).map(([key, set]) => [key, set.size])
    );
    return {
      content: [
        {
          type: "text",
          text: `Session counts (grouped by ${groupBy}): ${JSON.stringify(sessionCounts)}`
        }
      ]
    };
  },
  get_rum_page_performance: async (request) => {
    const { query, from, to, metricNames } = GetRumPagePerformanceZodSchema.parse(request.params.arguments);
    const viewQuery = query !== "*" ? `@type:view ${query}` : "@type:view";
    const response = await apiInstance.listRUMEvents({
      filterQuery: viewQuery,
      filterFrom: new Date(from * 1e3),
      filterTo: new Date(to * 1e3),
      sort: "timestamp",
      pageLimit: 2e3
    });
    if (response.data == null) {
      throw new Error("No RUM events data returned");
    }
    const metrics = metricNames.reduce(
      (acc, name) => {
        acc[name] = [];
        return acc;
      },
      {}
    );
    for (const event of response.data) {
      if (!event.attributes?.attributes) {
        continue;
      }
      for (const metricName of metricNames) {
        const metricNameParts = metricName.split(".");
        if (event.attributes.attributes == null) {
          continue;
        }
        const value = metricNameParts.reduce(
          (acc, part) => acc ? acc[part] : void 0,
          event.attributes.attributes
        );
        if (typeof value === "number") {
          metrics[metricName].push(value);
        }
      }
    }
    const results = Object.entries(metrics).reduce(
      (acc, [name, values]) => {
        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0);
          acc[name] = {
            avg: sum / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length
          };
        } else {
          acc[name] = { avg: 0, min: 0, max: 0, count: 0 };
        }
        return acc;
      },
      {}
    );
    return {
      content: [
        {
          type: "text",
          text: `Page performance metrics: ${JSON.stringify(results)}`
        }
      ]
    };
  },
  get_rum_page_waterfall: async (request) => {
    const { applicationName, sessionId } = GetRumPageWaterfallZodSchema.parse(
      request.params.arguments
    );
    const response = await apiInstance.listRUMEvents({
      filterQuery: `@application.name:${applicationName} @session.id:${sessionId}`,
      sort: "timestamp",
      pageLimit: 2e3
    });
    if (response.data == null) {
      throw new Error("No RUM events data returned");
    }
    return {
      content: [
        {
          type: "text",
          text: `Waterfall data: ${JSON.stringify(response.data)}`
        }
      ]
    };
  }
});
var getValueByPath = (obj, path, index = 0) => {
  if (index >= path.length) {
    return { value: obj, found: true };
  }
  const key = path[index];
  const typedObj = obj;
  if (typedObj[key] === void 0) {
    return { value: null, found: false };
  }
  return getValueByPath(
    typedObj[key],
    path,
    index + 1
  );
};

// src/index.ts
import { v2, v1 } from "@datadog/datadog-api-client";
var server = new Server(
  {
    name: "Datadog MCP Server",
    version
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
server.onerror = (error) => {
  log("error", `Server error: ${error.message}`, error.stack);
};
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...INCIDENT_TOOLS,
      ...METRICS_TOOLS,
      ...LOGS_TOOLS,
      ...MONITORS_TOOLS,
      ...DASHBOARDS_TOOLS,
      ...TRACES_TOOLS,
      ...HOSTS_TOOLS,
      ...DOWNTIMES_TOOLS,
      ...RUM_TOOLS
    ]
  };
});
if (!process.env.DATADOG_API_KEY || !process.env.DATADOG_APP_KEY) {
  throw new Error("DATADOG_API_KEY and DATADOG_APP_KEY must be set");
}
var datadogConfig = createDatadogConfig({
  apiKeyAuth: process.env.DATADOG_API_KEY,
  appKeyAuth: process.env.DATADOG_APP_KEY,
  site: process.env.DATADOG_SITE,
  subdomain: process.env.DATADOG_SUBDOMAIN
});
var TOOL_HANDLERS = {
  ...createIncidentToolHandlers(new v2.IncidentsApi(datadogConfig)),
  ...createMetricsToolHandlers(new v1.MetricsApi(datadogConfig)),
  ...createLogsToolHandlers(new v2.LogsApi(datadogConfig)),
  ...createMonitorsToolHandlers(new v1.MonitorsApi(datadogConfig)),
  ...createDashboardsToolHandlers(new v1.DashboardsApi(datadogConfig)),
  ...createTracesToolHandlers(new v2.SpansApi(datadogConfig)),
  ...createHostsToolHandlers(new v1.HostsApi(datadogConfig)),
  ...createDowntimesToolHandlers(new v1.DowntimesApi(datadogConfig)),
  ...createRumToolHandlers(new v2.RUMApi(datadogConfig))
};
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (TOOL_HANDLERS[request.params.name]) {
      return await TOOL_HANDLERS[request.params.name](request);
    }
    throw new Error("Unknown tool");
  } catch (unknownError) {
    const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
    log(
      "error",
      `Request: ${request.params.name}, ${JSON.stringify(request.params.arguments)} failed`,
      error.message,
      error.stack
    );
    throw error;
  }
});
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  log("error", "Server error:", error);
  process.exit(1);
});
