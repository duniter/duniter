const SocksProxyAgent = require('socks-proxy-agent');

const HOST_ONION_REGEX = new RegExp('(\S*?\.onion)$');
const WS_ENDPOINT_ONION_REGEX =  new RegExp('(?:wss?:\/\/)?(?:www)?(\S*?\.onion)(\/[-\w]*)*');

export class ProxiesConf {
  public proxySocksAddress: string|undefined
  public proxyTorAddress: string|undefined
  public alwaysUseTor: boolean|undefined

  constructor () {
    this.proxySocksAddress = undefined
    this.proxyTorAddress = undefined
    this.alwaysUseTor = undefined
  }

  static canReachTorEndpoint(proxyConf: ProxiesConf|undefined):boolean {
    return (proxyConf !== undefined && (proxyConf.alwaysUseTor === true || (proxyConf.proxyTorAddress !== undefined) ) )
  }

  static httpProxy(url:string, proxyConf: ProxiesConf|undefined):string|undefined {
    return ProxiesConf.chooseProxyAgent(url, proxyConf, HOST_ONION_REGEX)
  }

  static wsProxy(address:string, proxyConf: ProxiesConf|undefined):string|undefined {
    return ProxiesConf.chooseProxyAgent(address, proxyConf, WS_ENDPOINT_ONION_REGEX)
  }

  private static chooseProxyAgent(address:string, proxyConf: ProxiesConf|undefined,  onionRegex:RegExp):string|undefined {
    if (proxyConf !== undefined) {
      if ( proxyConf.proxyTorAddress !== undefined && (proxyConf.alwaysUseTor || address.match(onionRegex)))
      {
          return proxyConf.proxyTorAddress
      }
      else if (proxyConf.proxySocksAddress !== undefined) {
          return proxyConf.proxySocksAddress
      }
    }
    return undefined
  }
}