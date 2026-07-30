import { Injectable } from '@nestjs/common';
import { Agent, request } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import type { LookupFunction } from 'node:net';
import * as webpush from 'web-push';
import {
  PublicAddress,
  resolveAndValidatePushEndpoint,
} from './push-endpoint-security';
import { VapidProvider } from './vapid.provider';

const SOCKET_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_PAYLOAD_BYTES = 4 * 1024;

export class WebPushTransportError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly headers?: IncomingHttpHeaders,
  ) {
    super(message);
    this.name = 'WebPushTransportError';
  }
}

@Injectable()
export class WebPushTransport {
  constructor(private readonly vapid: VapidProvider) {}

  async send(
    subscription: webpush.PushSubscription,
    payload: string,
    options: Pick<webpush.RequestOptions, 'TTL' | 'urgency' | 'topic'>,
  ) {
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new WebPushTransportError('Web Push payload too large');
    }

    const vapidDetails = this.vapid.getDetails();
    if (!vapidDetails) {
      throw new WebPushTransportError('Web Push is not configured');
    }

    const validated = await resolveAndValidatePushEndpoint(
      subscription.endpoint,
      undefined,
      TOTAL_TIMEOUT_MS,
    );
    const details = webpush.generateRequestDetails(subscription, payload, {
      ...options,
      contentEncoding: 'aes128gcm',
      vapidDetails,
    });
    const generatedUrl = new URL(details.endpoint);

    if (generatedUrl.href !== validated.url.href || details.method !== 'POST') {
      throw new WebPushTransportError('Unsafe Web Push request details');
    }

    const tlsHostname =
      generatedUrl.hostname.startsWith('[') &&
      generatedUrl.hostname.endsWith(']')
        ? generatedUrl.hostname.slice(1, -1)
        : generatedUrl.hostname;
    const agent = this.createPinnedAgent(tlsHostname, validated.addresses);

    return new Promise<{ statusCode: number; headers: IncomingHttpHeaders }>(
      (resolve, reject) => {
        let settled = false;
        const finish = (
          error?: Error,
          result?: { statusCode: number; headers: IncomingHttpHeaders },
        ) => {
          if (settled) return;
          settled = true;
          clearTimeout(totalTimer);
          agent.destroy();
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new WebPushTransportError('Web Push result unavailable'));
        };

        const totalTimer = setTimeout(
          () => {
            req.destroy(new WebPushTransportError('Web Push total timeout'));
          },
          Math.max(1, deadline - Date.now()),
        );

        const req = request(
          generatedUrl,
          {
            method: details.method,
            headers: details.headers,
            agent,
            servername: tlsHostname,
            timeout: SOCKET_TIMEOUT_MS,
          },
          (response) => {
            let responseBytes = 0;
            response.on('data', (chunk: Buffer) => {
              responseBytes += chunk.length;
              if (responseBytes > MAX_RESPONSE_BYTES) {
                req.destroy(
                  new WebPushTransportError('Web Push response too large'),
                );
              }
            });
            response.on('end', () => {
              const statusCode = response.statusCode ?? 0;
              if (statusCode < 200 || statusCode >= 300) {
                finish(
                  new WebPushTransportError(
                    'Web Push service rejected the request',
                    statusCode,
                    response.headers,
                  ),
                );
                return;
              }
              finish(undefined, { statusCode, headers: response.headers });
            });
          },
        );

        req.on('timeout', () => {
          req.destroy(new WebPushTransportError('Web Push socket timeout'));
        });
        req.on('error', (error) =>
          finish(
            error instanceof WebPushTransportError
              ? error
              : new WebPushTransportError('Web Push network error'),
          ),
        );
        if (details.body) req.write(details.body);
        req.end();
      },
    );
  }

  private createPinnedAgent(hostname: string, addresses: PublicAddress[]) {
    let cursor = 0;
    const secureLookup: LookupFunction = (
      requestedHostname,
      options,
      callback,
    ) => {
      if (requestedHostname !== hostname) {
        const error = new Error(
          'Web Push transport attempted a different hostname',
        ) as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';
        callback(error, '', 4);
        return;
      }

      const requestedFamily =
        typeof options === 'object' && options
          ? Number(options.family ?? 0)
          : 0;
      const eligible = requestedFamily
        ? addresses.filter((item) => item.family === requestedFamily)
        : addresses;
      const chosen = eligible[cursor++ % eligible.length];
      if (!chosen) {
        const error = new Error(
          'No validated address for requested family',
        ) as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';
        callback(error, '', requestedFamily || 4);
        return;
      }
      if (typeof options === 'object' && options?.all) {
        callback(null, [chosen]);
        return;
      }
      callback(null, chosen.address, chosen.family);
    };

    return new Agent({
      keepAlive: false,
      maxSockets: 1,
      servername: hostname,
      lookup: secureLookup,
    });
  }
}
