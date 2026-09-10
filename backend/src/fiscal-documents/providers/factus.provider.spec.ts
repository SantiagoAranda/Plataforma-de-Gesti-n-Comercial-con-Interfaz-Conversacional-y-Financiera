import { ConfigService } from '@nestjs/config';
import { FactusProvider } from './factus.provider';

describe('FactusProvider', () => {
  const config = {
    get: jest.fn().mockReturnValue('test-master-key'),
  } as unknown as ConfigService;

  it('encrypts credentials without keeping clear text and decrypts them faithfully', () => {
    const provider = new FactusProvider(config);
    const credentials = {
      clientId: 'client',
      clientSecret: 'secret',
      username: 'user@example.com',
      password: 'password',
    };
    const encrypted = provider.encryptCredentials(credentials);
    expect(encrypted).not.toContain(credentials.password);
    expect(provider.decryptCredentials(encrypted)).toEqual(credentials);
  });

  it('normalizes a download response wrapped in data', async () => {
    const provider = new FactusProvider(config);
    jest.spyOn(provider as any, 'token').mockResolvedValue('token');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { pdf_base_64_encoded: 'cGRm' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      provider.download('business-1', 'sandbox', {} as any, 'SETP1', 'pdf'),
    ).resolves.toEqual({
      base64: 'cGRm',
      contentType: 'application/pdf',
      extension: 'pdf',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-sandbox.factus.com.co/v2/bills/SETP1/download-pdf',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    fetchMock.mockRestore();
  });
});
