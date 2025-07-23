import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import { promises as fsPromises } from 'fs';

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  tokenPath: string;
}

export interface OAuth2Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class OAuth2Manager {
  private config: OAuth2Config;
  private client: OAuth2Client;
  private readonly redirectUri = 'http://localhost:8080/oauth/callback';
  private readonly scopes = ['https://www.googleapis.com/auth/webmasters'];

  constructor(config: OAuth2Config) {
    this.config = config;
    this.client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      this.redirectUri
    );
  }

  async startAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      const authUrl = this.client.generateAuthUrl({
        access_type: 'offline',
        scope: this.scopes,
        prompt: 'consent',
      });

      console.log('\nOAuth2認証を開始します。');
      console.log('以下のURLにアクセスして認証を完了してください:');
      console.log(`\n${authUrl}\n`);

      const server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url!, true);
          
          if (parsedUrl.pathname === '/oauth/callback') {
            const code = parsedUrl.query.code as string;
            const error = parsedUrl.query.error as string;

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body>
                    <h1>認証エラー</h1>
                    <p>認証が拒否されました: ${error}</p>
                    <p>このウィンドウを閉じて、再度認証を試してください。</p>
                  </body>
                </html>
              `);
              server.close();
              reject(new Error(`認証が拒否されました: ${error}`));
              return;
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body>
                    <h1>認証エラー</h1>
                    <p>認証コードが見つかりません。</p>
                    <p>このウィンドウを閉じて、再度認証を試してください。</p>
                  </body>
                </html>
              `);
              server.close();
              reject(new Error('認証コードが見つかりません'));
              return;
            }

            try {
              const { tokens } = await this.client.getToken(code);
              await this.saveTokens(tokens as OAuth2Tokens);

              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body>
                    <h1>認証完了</h1>
                    <p>OAuth2認証が正常に完了しました。</p>
                    <p>このウィンドウを閉じて、アプリケーションに戻ってください。</p>
                  </body>
                </html>
              `);
              
              server.close();
              console.log('OAuth2認証が正常に完了しました。');
              console.log(`トークンが保存されました: ${this.config.tokenPath}`);
              resolve();
            } catch (tokenError) {
              res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body>
                    <h1>トークン取得エラー</h1>
                    <p>トークンの取得に失敗しました。</p>
                    <p>このウィンドウを閉じて、再度認証を試してください。</p>
                  </body>
                </html>
              `);
              server.close();
              reject(new Error(`トークンの取得に失敗しました: ${tokenError}`));
            }
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          }
        } catch (serverError) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          console.error('サーバーエラー:', serverError);
          server.close();
          reject(serverError);
        }
      });

      server.listen(8080, () => {
        console.log('認証コールバックを待機中... (ポート 8080)');
      });

      server.on('error', (err) => {
        console.error('サーバーエラー:', err);
        reject(err);
      });
    });
  }

  async saveTokens(tokens: OAuth2Tokens): Promise<void> {
    try {
      const tokenDir = path.dirname(this.config.tokenPath);
      await fsPromises.mkdir(tokenDir, { recursive: true });
      
      await fsPromises.writeFile(
        this.config.tokenPath,
        JSON.stringify(tokens, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      throw new Error(`トークンの保存に失敗しました: ${error}`);
    }
  }

  async loadTokens(): Promise<OAuth2Tokens | null> {
    try {
      if (!fs.existsSync(this.config.tokenPath)) {
        return null;
      }

      const tokenData = await fsPromises.readFile(this.config.tokenPath, 'utf8');
      return JSON.parse(tokenData) as OAuth2Tokens;
    } catch (error) {
      throw new Error(`トークンの読み込みに失敗しました: ${error}`);
    }
  }

  async getAuthClient(): Promise<OAuth2Client> {
    const tokens = await this.loadTokens();
    
    if (!tokens) {
      throw new Error(
        'OAuth2トークンが見つかりません。' +
        '`mcp-server-gsc setup` コマンドを実行して認証を完了してください。'
      );
    }

    this.client.setCredentials(tokens);

    if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
      try {
        const { credentials } = await this.client.refreshAccessToken();
        const refreshedTokens = credentials as OAuth2Tokens;
        await this.saveTokens(refreshedTokens);
        console.log('OAuth2トークンが更新されました。');
      } catch (error) {
        throw new Error(
          'OAuth2トークンの更新に失敗しました。' +
          '`mcp-server-gsc setup` コマンドを実行して再認証してください。' +
          `エラー: ${error}`
        );
      }
    }

    return this.client;
  }
}