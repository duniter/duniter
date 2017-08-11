import {CrawlerConstants} from "./constants"
import {Contacter} from "./contacter"

const DEFAULT_HOST = 'localhost';

export const connect = (peer:any, timeout:number|null = null) => {
  return Promise.resolve(new Contacter(peer.getDns() || peer.getIPv4() || peer.getIPv6() || DEFAULT_HOST, peer.getPort(), {
    timeout: timeout || CrawlerConstants.DEFAULT_TIMEOUT
  }))
}
