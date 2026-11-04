const test = require('node:test');
const assert = require('node:assert/strict');
const proxyAddress = require('proxy-addr');

test('IPv6 trust subnets cannot implicitly trust arbitrary IPv4 clients', () => {
  assert.equal(proxyAddress.compile('::/1')('192.0.2.12', 0), false);
  assert.equal(proxyAddress.compile('192.0.2.0/24')('192.0.2.12', 0), true);
});

test('direct mode resolves the socket IP and ignores forged forwarding headers', async () => {
  require('ts-node/register/transpile-only');
  const express = require('express');
  const request = require('supertest');
  const {ConfigService} = require('@nestjs/config');
  const {authProxyTrust} = require('../src/auth/auth-rate-limit.guard');
  const app = express();
  app.set('trust proxy', authProxyTrust(new ConfigService({AUTH_RATE_LIMIT_ENABLED:'true', AUTH_CLIENT_IP_MODE:'direct'})));
  app.get('/ip', (req,res) => res.json({ip:req.ip, socket:req.socket.remoteAddress, ips:req.ips}));
  const result = await request(app).get('/ip').set('X-Forwarded-For','198.51.100.44, 203.0.113.7').expect(200);
  assert.equal(result.body.ip, result.body.socket);
  assert.ok(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(result.body.ip));
  assert.deepEqual(result.body.ips, []);
});
