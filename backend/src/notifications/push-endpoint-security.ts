import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export type PublicAddress = { address: string; family: 4 | 6 };
type AddressResolver = (
  hostname: string,
) => Promise<ReadonlyArray<PublicAddress>>;
const DNS_TIMEOUT_MS = 10_000;

const blockedAddresses = new BlockList();

[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) =>
  blockedAddresses.addSubnet(address as string, prefix as number, 'ipv4'),
);

[
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) =>
  blockedAddresses.addSubnet(address as string, prefix as number, 'ipv6'),
);

export function isPublicPushAddress(address: string, family?: number) {
  const normalized = address.toLowerCase();
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mappedIpv4) return isPublicPushAddress(mappedIpv4[1], 4);
  const mappedHexIpv4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
    normalized,
  );
  if (mappedHexIpv4) {
    const upper = Number.parseInt(mappedHexIpv4[1], 16);
    const lower = Number.parseInt(mappedHexIpv4[2], 16);
    return isPublicPushAddress(
      `${upper >> 8}.${upper & 0xff}.${lower >> 8}.${lower & 0xff}`,
      4,
    );
  }

  const detectedFamily = family ?? isIP(address);
  if (detectedFamily === 4) {
    return !blockedAddresses.check(address, 'ipv4');
  }
  if (detectedFamily === 6) {
    return !blockedAddresses.check(address, 'ipv6');
  }
  return false;
}

export async function resolveAndValidatePushEndpoint(
  endpoint: string,
  resolver: AddressResolver = async (hostname) =>
    (await lookup(hostname, {
      all: true,
      verbatim: true,
    })) as PublicAddress[],
  timeoutMs = DNS_TIMEOUT_MS,
): Promise<{ url: URL; addresses: PublicAddress[] }> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('Suscripción Web Push inválida');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    endpoint.length > 4096 ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.local')
  ) {
    throw new BadRequestException('Endpoint Web Push no permitido');
  }

  let resolved: PublicAddress[];
  const hostname =
    url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname;
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    resolved = [
      {
        address: hostname,
        family: literalFamily as 4 | 6,
      },
    ];
  } else {
    let timeout: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('DNS validation timeout')),
          timeoutMs,
        );
      });
      resolved = [
        ...(await Promise.race([resolver(hostname), timeoutPromise])),
      ];
    } catch {
      throw new BadRequestException('No se pudo validar el servicio push');
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (
    resolved.length === 0 ||
    resolved.some(
      ({ address, family }) => !isPublicPushAddress(address, family),
    )
  ) {
    throw new BadRequestException('Endpoint Web Push no permitido');
  }

  return { url, addresses: resolved };
}
