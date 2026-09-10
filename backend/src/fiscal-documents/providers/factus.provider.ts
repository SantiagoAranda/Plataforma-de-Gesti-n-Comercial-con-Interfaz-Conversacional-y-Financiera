import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { ConfigService } from '@nestjs/config';

export type FactusCredentials = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};
export type FactusDownloadedArtifact = {
  base64: string;
  contentType: string;
  extension: 'pdf' | 'xml';
};
type CachedToken = { accessToken: string; expiresAt: number };

@Injectable()
export class FactusProvider {
  private readonly tokens = new Map<string, CachedToken>();
  constructor(private readonly config: ConfigService) {}

  decryptCredentials(ciphertext: string): FactusCredentials {
    const secret = this.config.get<string>('FACTUS_CREDENTIALS_ENCRYPTION_KEY');
    if (!secret)
      throw new Error('FACTUS_CREDENTIALS_ENCRYPTION_KEY no esta configurada');
    const [iv64, tag64, data64] = ciphertext.split('.');
    if (!iv64 || !tag64 || !data64)
      throw new Error('Credenciales Factus cifradas invalidas');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      createHash('sha256').update(secret).digest(),
      Buffer.from(iv64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag64, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data64, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    );
  }

  encryptCredentials(credentials: FactusCredentials) {
    const secret = this.config.get<string>('FACTUS_CREDENTIALS_ENCRYPTION_KEY');
    if (!secret)
      throw new Error('FACTUS_CREDENTIALS_ENCRYPTION_KEY no esta configurada');
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      createHash('sha256').update(secret).digest(),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
  }

  async validateInvoice(
    scope: string,
    environment: string,
    credentials: FactusCredentials,
    payload: unknown,
  ) {
    return this.request(
      scope,
      environment,
      credentials,
      '/v2/bills/validate',
      payload,
    );
  }

  async validateCreditNote(
    scope: string,
    environment: string,
    credentials: FactusCredentials,
    payload: unknown,
  ) {
    return this.request(
      scope,
      environment,
      credentials,
      '/v2/credit-notes/validate',
      payload,
    );
  }

  async download(
    scope: string,
    environment: string,
    credentials: FactusCredentials,
    number: string,
    kind: 'pdf' | 'xml',
    type: 'INVOICE' | 'CREDIT_NOTE' = 'INVOICE',
  ): Promise<FactusDownloadedArtifact> {
    const token = await this.token(scope, environment, credentials);
    const resource = type === 'CREDIT_NOTE' ? 'credit-notes' : 'bills';
    const response = await fetch(
      `${this.baseUrl(environment)}/v2/${resource}/${encodeURIComponent(number)}/download-${kind}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const body = await this.body(response);
    if (!response.ok)
      throw Object.assign(
        new Error(body?.message ?? `Factus ${response.status}`),
        { status: response.status, body },
      );
    const base64 = this.artifactBase64(body, kind);
    if (!base64) {
      throw Object.assign(
        new Error(
          `Factus download-${kind} response does not contain ${kind}_base_64_encoded`,
        ),
        { status: response.status, body },
      );
    }
    return {
      base64,
      contentType: kind === 'pdf' ? 'application/pdf' : 'application/xml',
      extension: kind,
    };
  }

  private async request(
    scope: string,
    environment: string,
    credentials: FactusCredentials,
    path: string,
    payload: unknown,
    retried = false,
  ): Promise<any> {
    const token = await this.token(scope, environment, credentials);
    const response = await fetch(`${this.baseUrl(environment)}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await this.body(response);
    if (response.status === 401 && !retried) {
      this.tokens.delete(scope);
      return this.request(scope, environment, credentials, path, payload, true);
    }
    if (!response.ok)
      throw Object.assign(
        new Error(body?.message ?? `Factus ${response.status}`),
        { status: response.status, body },
      );
    return body;
  }

  private async token(
    scope: string,
    environment: string,
    credentials: FactusCredentials,
  ) {
    const cached = this.tokens.get(scope);
    if (cached && cached.expiresAt > Date.now() + 60_000)
      return cached.accessToken;
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
    });
    const response = await fetch(`${this.baseUrl(environment)}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const body = await this.body(response);
    if (!response.ok || !body?.access_token)
      throw Object.assign(
        new Error(body?.message ?? 'No se pudo autenticar con Factus'),
        { status: response.status, body },
      );
    this.tokens.set(scope, {
      accessToken: body.access_token,
      expiresAt: Date.now() + Number(body.expires_in ?? 600) * 1000,
    });
    return body.access_token as string;
  }

  private baseUrl(environment: string) {
    return environment === 'production'
      ? 'https://api.factus.com.co'
      : 'https://api-sandbox.factus.com.co';
  }
  private artifactBase64(body: unknown, kind: 'pdf' | 'xml') {
    const key = `${kind}_base_64_encoded`;
    const root = body as Record<string, unknown> | null;
    const data = root?.data as Record<string, unknown> | null;
    const nestedData = data?.data as Record<string, unknown> | null;
    const value = root?.[key] ?? data?.[key] ?? nestedData?.[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }
  private async body(response: Response): Promise<any> {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { message: text };
    }
  }
}
