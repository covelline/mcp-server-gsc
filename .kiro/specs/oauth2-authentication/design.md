# 設計ドキュメント：OAuth2認証の実装

## 概要

このドキュメントでは、Google Search Console MCPサーバーの認証方法をサービスアカウントからOAuth2認証に移行するための設計を定義します。OAuth2認証を実装することで、個人のGoogle Search Consoleアカウントを使用してAPIにアクセスできるようになり、セキュリティが向上します。

## アーキテクチャ

システムは以下の主要コンポーネントで構成されます：

1. **コマンドライン インターフェース (CLI)**
   - サブコマンド `setup` を追加して認証フローを開始
   - 環境変数またはコマンドラインパラメーターからの設定読み込み
   - ヘルプとエラーメッセージの表示

2. **OAuth2認証マネージャー**
   - OAuth2認証フローの処理
   - トークンの取得と更新
   - トークンの保存と読み込み

3. **Search Consoleサービス**
   - OAuth2認証を使用したAPIリクエスト
   - 既存のAPIエンドポイントとの統合

4. **MCPサーバー**
   - 既存のMCPサーバー機能との統合
   - OAuth2認証を使用したツールの実行

## コンポーネントとインターフェース

### コマンドライン インターフェース

```typescript
interface CliOptions {
  clientId?: string;
  clientSecret?: string;
  tokenPath?: string;
  command?: 'setup' | 'server';
}

// コマンドライン引数のパース
function parseCliOptions(args: string[]): CliOptions;

// 環境変数からの設定読み込み
function loadEnvConfig(): CliOptions;

// 設定の検証
function validateConfig(config: CliOptions): boolean;
```

### OAuth2認証マネージャー

```typescript
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  tokenPath: string;
}

interface OAuth2Tokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

class OAuth2Manager {
  constructor(config: OAuth2Config);
  
  // 認証フローの開始
  async startAuthFlow(): Promise<void>;
  
  // トークンの保存
  async saveTokens(tokens: OAuth2Tokens): Promise<void>;
  
  // トークンの読み込み
  async loadTokens(): Promise<OAuth2Tokens | null>;
  
  // 認証クライアントの取得
  async getAuthClient(): Promise<OAuth2Client>;
}
```

### Search Consoleサービス

```typescript
class SearchConsoleService {
  constructor(authClient: OAuth2Client);
  
  // WebmastersサービスとSearchConsoleサービスの取得
  private async getWebmasters(): Promise<webmasters_v3.Webmasters>;
  private async getSearchConsole(): Promise<searchconsole_v1.Searchconsole>;
  
  // 既存のAPIメソッド
  async searchAnalytics(siteUrl: string, requestBody: SearchanalyticsQueryRequest);
  async listSites();
  async listSitemaps(requestBody: ListSitemapsRequest);
  async getSitemap(requestBody: GetSitemapRequest);
  async submitSitemap(requestBody: SubmitSitemapRequest);
  async indexInspect(requestBody: IndexInspectRequest);
}
```

## データモデル

### 設定ファイル

OAuth2認証の設定は、JSONファイルとして保存されます：

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

### トークンファイル

OAuth2トークンは、JSONファイルとして保存されます：

```json
{
  "access_token": "ya29.a0AfB_...",
  "refresh_token": "1//0eHt...",
  "scope": "https://www.googleapis.com/auth/webmasters",
  "token_type": "Bearer",
  "expiry_date": 1626948683456
}
```

## エラー処理

以下のエラーシナリオを処理します：

1. **設定エラー**
   - クライアントIDまたはクライアントシークレットが提供されていない
   - トークンパスが無効または書き込み不可

2. **認証エラー**
   - ユーザーが認証を拒否
   - トークンの取得に失敗
   - トークンの更新に失敗

3. **ファイルエラー**
   - トークンファイルの読み込みに失敗
   - トークンファイルの書き込みに失敗

各エラーに対して、明確なエラーメッセージと解決手順を提供します。

## テスト戦略

以下のテストを実施します：

1. **ユニットテスト**
   - OAuth2Managerクラスのメソッドテスト
   - コマンドライン引数のパースと検証のテスト
   - エラー処理のテスト

2. **統合テスト**
   - 認証フローのエンドツーエンドテスト
   - トークンの保存と読み込みのテスト
   - APIリクエストのテスト

3. **手動テスト**
   - 実際のGoogle Search Consoleアカウントを使用した認証テスト
   - エラーシナリオのテスト

## 実装の詳細

### OAuth2認証フロー

1. ユーザーが `setup` サブコマンドを実行
2. システムがブラウザを開き、Google認証ページにリダイレクト
3. ユーザーがGoogleアカウントでログインし、アクセスを許可
4. Googleが認証コードをローカルサーバーにリダイレクト
5. システムが認証コードを使用してアクセストークンとリフレッシュトークンを取得
6. トークンが指定されたパスに保存される

### サーバー起動フロー

1. ユーザーがサーバーを起動
2. システムがトークンファイルを読み込み
3. 必要に応じてトークンを更新
4. OAuth2認証を使用してAPIリクエストを実行

### コマンドライン引数

```
Usage: mcp-server-gsc [options] [command]

Options:
  --client-id <id>        Google OAuth2クライアントID
  --client-secret <secret> Google OAuth2クライアントシークレット
  --token-path <path>     OAuth2トークンの保存パス (デフォルト: ~/.gsc-oauth-token.json)
  -h, --help              ヘルプ情報を表示

Commands:
  setup                   OAuth2認証フローを開始し、トークンを保存
  server                  MCPサーバーを起動 (デフォルトコマンド)
```

## セキュリティ考慮事項

1. **トークンの保存**
   - トークンファイルは適切なパーミッション（600）で保存
   - クライアントシークレットは環境変数として提供することを推奨

2. **スコープの制限**
   - 必要最小限のスコープのみを要求（`https://www.googleapis.com/auth/webmasters`）

3. **トークンの更新**
   - アクセストークンの有効期限が切れた場合、自動的に更新
   - リフレッシュトークンが無効になった場合、再認証を促す