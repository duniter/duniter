const SocksProxyAgent = require('socks-proxy-agent');

const constants = require('./constants');
const WS2PConstants = require('../modules/ws2p/lib/constants');

export interface Proxies {
    proxySocks: Proxy|undefined,
    proxyTor: Proxy|undefined
}

export interface ProxyConf {
    proxySocksAddress: string|undefined,
    proxyTorAddress: string|undefined,
    alwaysUseTor: boolean|undefined,
    proxies: Proxies|undefined
}

export class Proxy {
  private agent: any

  constructor(proxy:string, type:string = "socks") {
    if (type === "socks") {
        this.agent = SocksProxyAgent("socks://"+proxy)
    }
    else {
        this.agent = undefined
    }
  }

  getAgent() {
    return this.agent;
  }

  static defaultConf():ProxyConf {
    return {
        proxySocksAddress: undefined,
        proxyTorAddress: undefined,
        alwaysUseTor: undefined,
        proxies: undefined
    }
  }

  static createProxies(proxyConf: ProxyConf|undefined) : Proxies|undefined
  {
    if (proxyConf !== undefined) {
      return  {
        proxySocks: (proxyConf.proxySocksAddress !== undefined) ? new Proxy(proxyConf.proxySocksAddress, "socks"):undefined,
        proxyTor: (proxyConf.proxyTorAddress !== undefined) ? new Proxy(proxyConf.proxyTorAddress, "socks"):undefined
      }
    } else {
        return undefined
    }
  }

  static httpProxy(url:string, proxyConf: ProxyConf|undefined) {
    return Proxy.chooseProxy(url, proxyConf, constants.ONION_ENDPOINT_REGEX)
  }

  static wsProxy(address:string, proxyConf: ProxyConf|undefined) {
    return Proxy.chooseProxy(address, proxyConf, WS2PConstants.ONION_ENDPOINT_REGEX)
  }

  private static chooseProxy(address:string, proxyConf: ProxyConf|undefined,  onionRegex:RegExp): Proxy|undefined {
    if (proxyConf !== undefined) {
        if (proxyConf.proxies === undefined) {
            proxyConf.proxies = Proxy.createProxies(proxyConf)
        }
        if (proxyConf.proxies !== undefined) {
            if ( proxyConf.proxies.proxyTor !== undefined && proxyConf.proxies.proxyTor.getAgent() !== undefined && (proxyConf.alwaysUseTor || address.match(onionRegex)))
            {
                return proxyConf.proxies.proxyTor
            }
            else if (proxyConf.proxies.proxySocks !== undefined && proxyConf.proxies.proxySocks.getAgent() !== undefined) {
                return proxyConf.proxies.proxyTor
            }
        }
    }
    return undefined
  }
}
