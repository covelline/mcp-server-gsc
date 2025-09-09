import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import { promises as fsPromises } from 'fs';

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface OAuth2Tokens {
  access_token?: string;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export class OAuth2Manager {
  private config: OAuth2Config;
  private client: OAuth2Client;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri = 'http://localhost:8080/oauth/callback';
  private readonly scopes = ['https://www.googleapis.com/auth/webmasters'];

  constructor(config: OAuth2Config) {
    this.config = config;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
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
              console.log(`リフレッシュトークンを取得しました: ${tokens.refresh_token}`);
              console.log(`リフレッシュトークンは厳重に管理してください。`);
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

  async loadTokens(): Promise<string | null> {
    return this.config.refreshToken;
  }

  async getAuthClient(): Promise<OAuth2Client> {
    const refreshToken = await this.loadTokens();
    
    if (!refreshToken) {
      throw new Error(
        'OAuth2トークンが見つかりません。' +
        '`mcp-server-gsc setup` コマンドを実行して認証を完了してください。'
      );
    }

    // refresh_tokenのみをsetCredentialsに渡す
    this.client.setCredentials({
      refresh_token: refreshToken
    });

    return this.client;
  }
}