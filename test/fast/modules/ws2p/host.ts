// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import * as assert from 'assert'
import { WS2PCluster } from '../../../../app/modules/ws2p/lib/WS2PCluster';

describe('WS2P IP functions', () => {
  
  it('should format correctly DNS endpoints', () => {
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80), 'ws://my.host.com:80')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80, null), 'ws://my.host.com:80')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80, undefined), 'ws://my.host.com:80')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 443, null), 'wss://my.host.com:443')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80, '/'), 'ws://my.host.com:80/')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80, ' path'), 'ws://my.host.com:80/path')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80, '/path'), 'ws://my.host.com:80/path')
    assert.equal(WS2PCluster.getFullAddress('my.host.com', 80, '/super/long/path'), 'ws://my.host.com:80/super/long/path')
  })
  
  it('should format correctly IPv4 endpoints', () => {
    assert.equal(WS2PCluster.getFullAddress('192.168.1.1', 80, ''), 'ws://192.168.1.1:80')
    assert.equal(WS2PCluster.getFullAddress('192.168.1.1', 443, ''), 'wss://192.168.1.1:443')
    assert.equal(WS2PCluster.getFullAddress('192.168.1.1', 80, '/'), 'ws://192.168.1.1:80/')
    assert.equal(WS2PCluster.getFullAddress('192.168.1.1', 80, ' path'), 'ws://192.168.1.1:80/path')
    assert.equal(WS2PCluster.getFullAddress('192.168.1.1', 80, '/path'), 'ws://192.168.1.1:80/path')
    assert.equal(WS2PCluster.getFullAddress('192.168.1.1', 80, '/super/long/path'), 'ws://192.168.1.1:80/super/long/path')
  })
  
  it('should format correctly IPv6 endpoints', () => {
    assert.equal(WS2PCluster.getFullAddress('::1', 80, ''), 'ws://[::1]:80')
    assert.equal(WS2PCluster.getFullAddress('::1', 443, ''), 'wss://[::1]:443')
    assert.equal(WS2PCluster.getFullAddress('::1', 80, '/'), 'ws://[::1]:80/')
    assert.equal(WS2PCluster.getFullAddress('::1', 80, ' path'), 'ws://[::1]:80/path')
    assert.equal(WS2PCluster.getFullAddress('::1', 80, '/path'), 'ws://[::1]:80/path')
    assert.equal(WS2PCluster.getFullAddress('::1', 80, '/super/long/path'), 'ws://[::1]:80/super/long/path')
  })
})
