#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
// @ts-ignore
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  GetSitemapSchema,
  IndexInspectSchema,
  ListSitemapsSchema,
  SearchAnalyticsSchema,
  SubmitSitemapSchema,
} from './schemas.js';
import { z } from 'zod';
import { SearchConsoleService } from './search-console.js';
import { OAuth2Manager, OAuth2Config } from './oauth2-manager.js';
import { 
  parseCliOptions, 
  loadEnvConfig, 
  mergeConfig, 
  validateConfig, 
  showHelp, 
  showErrors 
} from './cli.js';

const server = new Server(
  {
    name: 'gsc-mcp-server',
    version: '0.1.1',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  },
);

async function main() {
  const args = process.argv.slice(2);
  const cliOptions = parseCliOptions(args);
  
  if (cliOptions.help) {
    showHelp();
    process.exit(0);
  }

  const envOptions = loadEnvConfig();
  const config = mergeConfig(cliOptions, envOptions);
  const validation = validateConfig(config);

  if (!validation.isValid) {
    showErrors(validation.errors);
    process.exit(1);
  }

  if (config.command === 'setup') {
    try {
      const oauth2Config: OAuth2Config = {
        clientId: config.clientId!,
        clientSecret: config.clientSecret!,
        tokenPath: config.tokenPath!,
      };
      
      const oauth2Manager = new OAuth2Manager(oauth2Config);
      await oauth2Manager.startAuthFlow();
    } catch (error) {
      console.error('OAuth2認証のセットアップに失敗しました:', error);
      process.exit(1);
    }
  } else if (config.command === 'server') {
    try {
      const oauth2Config: OAuth2Config = {
        clientId: config.clientId || '',
        clientSecret: config.clientSecret || '',
        tokenPath: config.tokenPath!,
      };
      
      const oauth2Manager = new OAuth2Manager(oauth2Config);
      const authClient = await oauth2Manager.getAuthClient();
      
      console.error('OAuth2認証を使用してサーバーを起動しています...');
      await runServer(authClient);
    } catch (error) {
      console.error('サーバーの起動に失敗しました:', error);
      console.error('OAuth2認証をセットアップするには、以下のコマンドを実行してください:');
      console.error(`mcp-server-gsc --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET setup`);
      process.exit(1);
    }
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_sites',
        description: 'List all sites in Google Search Console',
        inputSchema: zodToJsonSchema(z.object({})),
      },
      {
        name: 'search_analytics',
        description: 'Get search performance data from Google Search Console',
        inputSchema: zodToJsonSchema(SearchAnalyticsSchema),
      },
      {
        name: 'index_inspect',
        description: 'Inspect a URL to see if it is indexed or can be indexed',
        inputSchema: zodToJsonSchema(IndexInspectSchema),
      },
      {
        name: 'list_sitemaps',
        description: 'List sitemaps for a site in Google Search Console',
        inputSchema: zodToJsonSchema(ListSitemapsSchema),
      },
      {
        name: 'get_sitemap',
        description: 'Get a sitemap for a site in Google Search Console',
        inputSchema: zodToJsonSchema(GetSitemapSchema),
      },
      {
        name: 'submit_sitemap',
        description: 'Submit a sitemap for a site in Google Search Console',
        inputSchema: zodToJsonSchema(SubmitSitemapSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error('Arguments are required');
    }

    const searchConsole = global.searchConsoleService;
    if (!searchConsole) {
      throw new Error('SearchConsoleService is not initialized');
    }

    switch (request.params.name) {
      case 'search_analytics': {
        const args = SearchAnalyticsSchema.parse(request.params.arguments);
        const siteUrl = args.siteUrl;

        // --- 动态构建请求体 ---
        const requestBody: any = {
          startDate: args.startDate,
          endDate: args.endDate,
          dimensions: args.dimensions,
          searchType: args.type,
          aggregationType: args.aggregationType,
          rowLimit: args.rowLimit,
        };

        const filters = [];
        if (args.pageFilter) {
          filters.push({
            dimension: 'page',
            operator: args.filterOperator,
            expression: args.pageFilter,
          });
        }
        if (args.queryFilter) {
          filters.push({
            dimension: 'query',
            operator: args.filterOperator,
            expression: args.queryFilter,
          });
        }
        if (args.countryFilter) {
            filters.push({
              dimension: 'country',
              operator: 'equals', // Country filter only supports 'equals'
              expression: args.countryFilter,
            });
        }
        if (args.deviceFilter) {
            filters.push({
              dimension: 'device',
              operator: 'equals', // Device filter only supports 'equals'
              expression: args.deviceFilter,
            });
        }

        if (filters.length > 0) {
          requestBody.dimensionFilterGroups = [{ filters }];
        }
        // --- 构建结束 ---

        const response = await searchConsole.searchAnalytics(siteUrl, requestBody);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'list_sites': {
        const response = await searchConsole.listSites();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'index_inspect': {
        const args = IndexInspectSchema.parse(request.params.arguments);
        const requestBody = {
          siteUrl: args.siteUrl,
          inspectionUrl: args.inspectionUrl,
          languageCode: args.languageCode,
        };
        const response = await searchConsole.indexInspect(requestBody);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'list_sitemaps': {
        const args = ListSitemapsSchema.parse(request.params.arguments);
        const requestBody = {
          siteUrl: args.siteUrl,
          sitemapIndex: args.sitemapIndex,
        };
        const response = await searchConsole.listSitemaps(requestBody);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'get_sitemap': {
        const args = GetSitemapSchema.parse(request.params.arguments);
        const requestBody = {
          siteUrl: args.siteUrl,
          feedpath: args.feedpath,
        };
        const response = await searchConsole.getSitemap(requestBody);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'submit_sitemap': {
        const args = SubmitSitemapSchema.parse(request.params.arguments);
        const requestBody = {
          siteUrl: args.siteUrl,
          feedpath: args.feedpath,
        };
        const response = await searchConsole.submitSitemap(requestBody);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      );
    }
    throw error;
  }
});

declare global {
  var searchConsoleService: SearchConsoleService;
}

async function runServer(authClient: any) {
  global.searchConsoleService = new SearchConsoleService(authClient);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Google Search Console MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});