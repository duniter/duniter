import {CommonConstants} from "./common-libs/constants"

const SocksProxyAgent = require('socks-proxy-agent');

const HOST_ONION_REGEX = new RegExp('(?:www\.)?([0-9a-z]{16}?\.onion)$');
const WS_FULL_ADDRESS_ONION_REGEX =  new RegExp('^(?:wss?:\/\/)(?:www\.)?([0-9a-z]{16}\.onion)(:[0-9]+)?(\/[-\w]*)*');

export class ProxiesConf {
  public proxySocksAddress: string|undefined
  public proxyTorAddress: string|undefined
  public reachingClearEp: string
  public forceTor: boolean

  constructor () {
    this.proxySocksAddress = undefined
    this.proxyTorAddress = undefined
    this.reachingClearEp = 'clear'
    this.forceTor = false
  }

  static canReachClearEndpoint(proxiesConf: ProxiesConf|undefined):boolean {
    return (proxiesConf === undefined || proxiesConf.reachingClearEp !== 'none')
  }

  static canReachTorEndpoint(proxiesConf: ProxiesConf|undefined):boolean {
    return (proxiesConf !== undefined && (proxiesConf.forceTor || proxiesConf.proxyTorAddress !== undefined) )
  }

  static httpProxy(url:string, proxiesConf: ProxiesConf|undefined):string|undefined {
    return ProxiesConf.chooseProxyAgent(url, proxiesConf, HOST_ONION_REGEX)
  }

  static wsProxy(address:string, proxiesConf: ProxiesConf|undefined):string|undefined {
    return ProxiesConf.chooseProxyAgent(address, proxiesConf, WS_FULL_ADDRESS_ONION_REGEX)
  }

  private static chooseProxyAgent(address:string, proxiesConf: ProxiesConf|undefined,  onionRegex:RegExp):string|undefined {
    if (proxiesConf !== undefined) {
      if (address.match(onionRegex)) {
        if (ProxiesConf.canReachTorEndpoint(proxiesConf)) {
          return proxiesConf.proxyTorAddress
        }
      } else {
        if (ProxiesConf.canReachClearEndpoint(proxiesConf)) {
          if (proxiesConf.reachingClearEp == 'tor') {
            return proxiesConf.proxyTorAddress
          } else {
            return proxiesConf.proxySocksAddress
          }
        }
      }
    }
    return undefined
  }
}