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
import { ProxiesConf } from '../../app/lib/proxy';

describe("Proxies Conf", function() {

    // First conf : do not use any sock proxy
    let proxiesConf1 = new ProxiesConf()
    
    // Second conf : use tor only to reach ".onion" endpoints
    let proxiesConf2 = new ProxiesConf()
    proxiesConf2.proxyTorAddress = "127.0.0.1:9050"

    // Third conf : always use tor 
    let proxiesConf3 = new ProxiesConf()
    proxiesConf3.proxyTorAddress = "127.0.0.1:9050"
    proxiesConf3.reachingClearEp = 'tor'

    // Fourth conf : use classical socks proxy
    let proxiesConf4 = new ProxiesConf()
    proxiesConf4.proxySocksAddress = "127.0.0.1:8888"

    // Fifth conf : use classical socks proxy + use tor proxy only to reach ".onion" endpoints
    let proxiesConf5 = new ProxiesConf()
    proxiesConf5.proxySocksAddress = "127.0.0.1:8888"
    proxiesConf5.proxyTorAddress = "127.0.0.1:9050"

    // Sixth conf : always use tor and contact only tor endpoints
    let proxiesConf6 = new ProxiesConf()
    proxiesConf6.proxyTorAddress = "127.0.0.1:9050"
    proxiesConf6.reachingClearEp = 'none'

    // Seventh conf : force duniter to contact endpoint tor (if user redirect the traffic to tor himself)
    let proxiesConf7 = new ProxiesConf()
    proxiesConf7.forceTor = true;

    it('should do not use any sock proxy', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf1), true)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf1), false)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf1), undefined)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf1), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf1), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf1), undefined)
    })

    it('should use tor proxy only to reach ".onion" endpoints', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf2), true)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf2), true)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf2), proxiesConf2.proxyTorAddress)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf2), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf2), proxiesConf2.proxyTorAddress)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf2),  undefined)
    })

    it('should always use tor proxy', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf3), true)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf3), true)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf3), proxiesConf3.proxyTorAddress)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf3), proxiesConf3.proxyTorAddress)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf3), proxiesConf3.proxyTorAddress)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf3), proxiesConf3.proxyTorAddress)
    })

    it('should always use classical socks proxy', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf4), true)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf4), false)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf4), undefined)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf4), proxiesConf4.proxySocksAddress)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf4), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf4), proxiesConf4.proxySocksAddress)
    })

    it('should use tor proxy for ".onion" endpoints and classical socks proxy for everyone else', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf5), true)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf5), true)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf5), proxiesConf5.proxyTorAddress)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf5), proxiesConf5.proxySocksAddress)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf5), proxiesConf5.proxyTorAddress)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf5), proxiesConf5.proxySocksAddress)
    })

    it('should always use tor proxy and contact only tor endpoints', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf6), false)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf6), true)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf6), proxiesConf6.proxyTorAddress)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf6), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf6), proxiesConf6.proxyTorAddress)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf6), undefined)
    })

    it('should never use proxy and contact tor endpoints (user redirect the traffic to tor himself)', () => {
        assert.equal(ProxiesConf.canReachClearEndpoint(proxiesConf7), true)
        assert.equal(ProxiesConf.canReachTorEndpoint(proxiesConf7), true)
        assert.equal(ProxiesConf.httpProxy("3asufnydqmup533h.onion", proxiesConf7), undefined)
        assert.equal(ProxiesConf.httpProxy("domain.tld", proxiesConf7), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf7), undefined)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf7), undefined)
    })
});
