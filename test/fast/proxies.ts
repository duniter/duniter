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
    proxiesConf3.alwaysUseTor = true

    // Fourth cont : use classical socks proxy
    let proxiesConf4 = new ProxiesConf()
    proxiesConf4.proxySocksAddress = "127.0.0.1:8888"

    // Fifth : use classical socks proxy + use tor proxy only to reach ".onion" endpoints
    let proxiesConf5 = new ProxiesConf()
    proxiesConf5.proxySocksAddress = "127.0.0.1:8888"
    proxiesConf5.proxyTorAddress = "127.0.0.1:9050"

    it('should do not use any sock proxy', () => {
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf1) === undefined, true)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf1) === undefined, true)
    })

    it('should use tor proxy only to reach ".onion" endpoints', () => {
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf2) === proxiesConf2.proxyTorAddress, true)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf2) === undefined, true)
    })

    it('should always use tor proxy', () => {
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf3) === proxiesConf3.proxyTorAddress, true)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf3) === proxiesConf3.proxyTorAddress, true)
    })

    it('should always use classical socks proxy', () => {
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf4) === proxiesConf4.proxySocksAddress, true)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf4) === proxiesConf4.proxySocksAddress, true)
    })

    it('should use or tor proxy for ".onion" endpoints and classical socks proxy for everyone else', () => {
        assert.equal(ProxiesConf.wsProxy("ws://3asufnydqmup533h.onion:80", proxiesConf5) === proxiesConf5.proxyTorAddress, true)
        assert.equal(ProxiesConf.wsProxy("ws://domain.tld:20900", proxiesConf5) === proxiesConf5.proxySocksAddress, true)
    })
});
