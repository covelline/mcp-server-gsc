import * as path from 'path';
import * as os from 'os';

export interface CliOptions {
  clientId?: string;
  clientSecret?: string;
  tokenPath?: string;
  command?: 'setup' | 'server';
  help?: boolean;
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--client-id':
        if (i + 1 < args.length) {
          options.clientId = args[++i];
        }
        break;
      case '--client-secret':
        if (i + 1 < args.length) {
          options.clientSecret = args[++i];
        }
        break;
      case '--token-path':
        if (i + 1 < args.length) {
          options.tokenPath = args[++i];
        }
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      case 'setup':
        options.command = 'setup';
        break;
      case 'server':
        options.command = 'server';
        break;
      default:
        if (!arg.startsWith('-') && !options.command) {
          if (arg === 'setup' || arg === 'server') {
            options.command = arg;
          }
        }
        break;
    }
  }

  if (!options.command) {
    options.command = 'server';
  }

  return options;
}

export function loadEnvConfig(): CliOptions {
  return {
    clientId: process.env.GSC_CLIENT_ID,
    clientSecret: process.env.GSC_CLIENT_SECRET,
    tokenPath: process.env.GSC_TOKEN_PATH,
  };
}

export function mergeConfig(cliOptions: CliOptions, envOptions: CliOptions): CliOptions {
  return {
    ...envOptions,
    ...cliOptions,
    tokenPath: cliOptions.tokenPath || envOptions.tokenPath || path.join(os.homedir(), '.gsc-oauth-token.json'),
  };
}

export function validateConfig(config: CliOptions): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.command === 'setup') {
    if (!config.clientId) {
      errors.push('クライアントIDが必要です。--client-id オプションまたは GSC_CLIENT_ID 環境変数を設定してください。');
    }
    if (!config.clientSecret) {
      errors.push('クライアントシークレットが必要です。--client-secret オプションまたは GSC_CLIENT_SECRET 環境変数を設定してください。');
    }
  } else if (config.command === 'server') {
    if (!config.tokenPath) {
      errors.push('トークンパスが必要です。--token-path オプションまたは GSC_TOKEN_PATH 環境変数を設定してください。');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function showHelp(): void {
  console.log(`
Google Search Console MCP Server

使用方法:
  mcp-server-gsc [options] [command]

コマンド:
  setup       OAuth2認証フローを開始し、トークンを保存
  server      MCPサーバーを起動 (デフォルト)

オプション:
  --client-id <id>        Google OAuth2クライアントID
  --client-secret <secret> Google OAuth2クライアントシークレット
  --token-path <path>     OAuth2トークンの保存パス (デフォルト: ~/.gsc-oauth-token.json)
  -h, --help              このヘルプ情報を表示

環境変数:
  GSC_CLIENT_ID           Google OAuth2クライアントID
  GSC_CLIENT_SECRET       Google OAuth2クライアントシークレット
  GSC_TOKEN_PATH          OAuth2トークンの保存パス

使用例:
  # OAuth2認証をセットアップ
  mcp-server-gsc --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET setup

  # 環境変数を使用してセットアップ
  export GSC_CLIENT_ID=your_client_id
  export GSC_CLIENT_SECRET=your_client_secret
  mcp-server-gsc setup

  # MCPサーバーを起動
  mcp-server-gsc --token-path ~/.gsc-oauth-token.json server

詳細な設定方法については、READMEファイルを参照してください。
`);
}

export function showErrors(errors: string[]): void {
  console.error('\n設定エラー:');
  errors.forEach(error => {
    console.error(`  - ${error}`);
  });
  console.error('\n詳しくは --help オプションを参照してください。\n');
}