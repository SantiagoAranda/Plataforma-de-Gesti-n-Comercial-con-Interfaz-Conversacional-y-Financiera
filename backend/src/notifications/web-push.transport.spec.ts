import { EventEmitter } from 'node:events';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import * as webpush from 'web-push';
import { resolveAndValidatePushEndpoint } from './push-endpoint-security';
import { WebPushTransport } from './web-push.transport';

jest.mock('node:https', () => {
  const actual = jest.requireActual('node:https');
  return { ...actual, request: jest.fn() };
});
jest.mock('web-push', () => ({
  generateRequestDetails: jest.fn(),
}));
jest.mock('./push-endpoint-security', () => ({
  resolveAndValidatePushEndpoint: jest.fn(),
}));

describe('WebPushTransport', () => {
  it('preserves generated request details and pins DNS while retaining TLS hostname', async () => {
    const endpoint = 'https://push.example.com/subscription/123';
    const encryptedBody = Buffer.from('encrypted');
    const generatedHeaders = {
      Authorization: 'redacted',
      'Content-Encoding': 'aes128gcm',
      TTL: '300',
      Urgency: 'high',
      Topic: 'short-topic',
    };
    jest.mocked(resolveAndValidatePushEndpoint).mockResolvedValue({
      url: new URL(endpoint),
      addresses: [{ address: '1.1.1.1', family: 4 }],
    });
    jest.mocked(webpush.generateRequestDetails).mockReturnValue({
      endpoint,
      method: 'POST',
      headers: generatedHeaders,
      body: encryptedBody,
    });

    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
    };
    response.statusCode = 201;
    response.headers = { 'content-length': '0' };
    const fakeRequest = new EventEmitter() as EventEmitter & {
      write: jest.Mock;
      end: jest.Mock;
      destroy: jest.Mock;
    };
    fakeRequest.write = jest.fn();
    fakeRequest.destroy = jest.fn((error?: Error) => {
      if (error) fakeRequest.emit('error', error);
    });
    fakeRequest.end = jest.fn(() => response.emit('end'));

    jest.mocked(request).mockImplementation(((_url, _options, callback) => {
      callback(response as never);
      return fakeRequest;
    }) as unknown as typeof request);

    const transport = new WebPushTransport({
      getDetails: () => ({
        subject: 'mailto:soporte@example.com',
        publicKey: 'public',
        privateKey: 'private',
      }),
    } as never);
    await expect(
      transport.send(
        {
          endpoint,
          expirationTime: null,
          keys: { p256dh: 'p256dh', auth: 'auth' },
        },
        JSON.stringify({ title: 'Test' }),
        { TTL: 300, urgency: 'high', topic: 'short-topic' },
      ),
    ).resolves.toEqual({
      statusCode: 201,
      headers: response.headers,
    });

    const [, requestOptions] = jest.mocked(request).mock.calls[0];
    expect(requestOptions).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: generatedHeaders,
        servername: 'push.example.com',
      }),
    );
    expect(fakeRequest.write).toHaveBeenCalledWith(encryptedBody);
    expect(webpush.generateRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint }),
      expect.any(String),
      expect.objectContaining({
        TTL: 300,
        urgency: 'high',
        topic: 'short-topic',
        contentEncoding: 'aes128gcm',
      }),
    );

    const lookup = (
      requestOptions as unknown as {
        agent: { options: { lookup: LookupFunction } };
      }
    ).agent.options.lookup;
    const callback = jest.fn();
    lookup('push.example.com', { family: 4 }, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
  });
});
