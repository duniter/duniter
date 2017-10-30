const SocksProxyAgent = require('socks-proxy-agent');

const constants = require('./constants');
const WS2PConstants = require('../modules/ws2p/lib/constants');

const DEFAULT_PROXY_TIMEOUT:number = 30000
const TOR_PROXY_TIMEOUT:number = 60000
const HTTP_ENDPOINT_ONION_REGEX = new RegExp('(?:https?:\/\/)?(?:www)?(\S*?\.onion)(\/[-\w]*)*')
const WS_ENDPOINT_ONION_REGEX = new RegExp('(?:wss?:\/\/)?(?:www)?(\S*?\.onion)(\/[-\w]*)*')

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
  public agent: any
  private url:string

  constructor(proxy:string, type:string = "socks", public timeout:number = DEFAULT_PROXY_TIMEOUT) {
    if (type === "socks") {
        this.agent = SocksProxyAgent("socks://"+proxy)
        this.url = "socks://"+proxy
    }
    else {
        this.url = ""
        this.agent = undefined
    }
    this.timeout = timeout
  }

  getUrl() {
    return this.url;
  }

  static defaultConf():ProxyConf {
    return {
        proxySocksAddress: undefined,
        proxyTorAddress: undefined,
        alwaysUseTor: undefined,
        proxies: undefined
    }
  }

  static canReachTorEndpoint(proxyConf: ProxyConf|undefined):boolean {
    return (proxyConf !== undefined && (proxyConf.alwaysUseTor === true || (proxyConf.proxies !== undefined && proxyConf.proxies.proxyTor !== undefined) ) )
  }

  static createProxies(proxyConf: ProxyConf|undefined) : Proxies|undefined
  {
    if (proxyConf !== undefined) {
      return  {
        proxySocks: (proxyConf.proxySocksAddress !== undefined) ? new Proxy(proxyConf.proxySocksAddress, "socks"):undefined,
        proxyTor: (proxyConf.proxyTorAddress !== undefined) ? new Proxy(proxyConf.proxyTorAddress, "socks", TOR_PROXY_TIMEOUT):undefined
      }
    } else {
        return undefined
    }
  }

  static httpProxy(url:string, proxyConf: ProxyConf|undefined) {
    return Proxy.chooseProxy(url, proxyConf, HTTP_ENDPOINT_ONION_REGEX)
  }

  static wsProxy(address:string, proxyConf: ProxyConf|undefined, mySelf:boolean = false) {
    return Proxy.chooseProxy(address, proxyConf, WS_ENDPOINT_ONION_REGEX, mySelf)
  }

  private static chooseProxy(address:string, proxyConf: ProxyConf|undefined,  onionRegex:RegExp, mySelf:boolean = false): Proxy|undefined {
    if (proxyConf !== undefined) {
        if (proxyConf.proxies === undefined) {
            proxyConf.proxies = Proxy.createProxies(proxyConf)
        }
        if (proxyConf.proxies !== undefined) {
            if ( proxyConf.proxies.proxyTor !== undefined && proxyConf.proxies.proxyTor.agent !== undefined && (proxyConf.alwaysUseTor || address.match(onionRegex)) && !mySelf )
            {
                return proxyConf.proxies.proxyTor
            }
            else if (proxyConf.proxies.proxySocks !== undefined && proxyConf.proxies.proxySocks.agent !== undefined) {
                return proxyConf.proxies.proxySocks
            }
        }
    }
    return undefined
  }
}
