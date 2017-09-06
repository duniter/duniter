import {WS2PConstants} from "./constants"
const upnp = require('nnupnp');
const Q = require('q');

interface UPnPBinding {
  remotehost:string
  host:string
  port:number
}

export class WS2PUpnp {

  private currentConfig:UPnPBinding|null
  private interval:NodeJS.Timer|null
  private client = upnp.createClient()

  constructor(
    private logger:any
  ) {}

  async checkUPnPisAvailable() {
    try {
      await Q.nbind(this.client.externalIp, this.client)()
      return true
    } catch (err) {
      return false
    }
  }

  async getRemoteEndpoint() {
    return !this.currentConfig ? '' : ['WS2P', this.currentConfig.remotehost, this.currentConfig.port].join(' ')
  }

  openPort() {
    return Q.Promise(async (resolve:any, reject:any) => {
      const upnpBinding = await WS2PUpnp.getAvailablePort(this.client)
      this.logger.trace('WS2P: mapping external port %s to local %s using UPnP...', upnpBinding.port, [upnpBinding.host, upnpBinding.port].join(':'))
      const client = upnp.createClient()
      client.portMapping({
        'public': upnpBinding.port,
        'private': upnpBinding.port,
        'ttl': WS2PConstants.WS2P_UPNP_TTL
      }, (err:any) => {
        client.close()
        if (err) {
          this.logger.warn(err)
          return reject(err)
        }
        this.currentConfig = upnpBinding
        resolve(upnpBinding)
      })
    })
  }

  async startRegular() {
    this.stopRegular();
    if (await this.checkUPnPisAvailable()) {
      // Update UPnP IGD every INTERVAL seconds
      this.interval = setInterval(() => this.openPort(), 1000 * WS2PConstants.WS2P_UPNP_INTERVAL)
    }
    return this.openPort()
  }

  stopRegular() {
    if (this.interval) {
      clearInterval(this.interval)
    }
  }

  static async getLocalIP(client:any) {
    return await new Promise<string>((resolve:any, reject:any) => {
      client.findGateway((err:any, res:any, localIP:any) => {
        if (err) return reject(err)
        resolve(localIP)
      })
    })
  }

  static async getRemoteIP(client:any): Promise<string> {
    return await new Promise<string>((resolve:any, reject:any) => {
      client.externalIp((err:any, externalIP:string) => {
        if (err) return reject(err)
        resolve(externalIP)
      })
    })
  }

  static async getAvailablePort(client:any) {
    const localIP = await WS2PUpnp.getLocalIP(client)
    const remoteIP = await WS2PUpnp.getRemoteIP(client)
    const mappings:{
      private: {
        host:string
      }
      public: {
        port:number
      }
    }[] = await WS2PUpnp.getUPnPMappings(client)
    const ipOfPort:string[] = []
    const externalPortsUsed = mappings.map((m) => {
      ipOfPort.push(m.private.host)
      return m.public.port
    })
    let availablePort = WS2PConstants.WS2P_PORTS_START
    while (externalPortsUsed.indexOf(availablePort) !== -1
      && ipOfPort[externalPortsUsed.indexOf(availablePort)] !== localIP
      && availablePort <= WS2PConstants.WS2P_PORTS_END) {
      availablePort++
    }
    if (availablePort > WS2PConstants.WS2P_PORTS_END) {
      throw "No port available for UPnP"
    }
    return {
      remotehost: remoteIP,
      host: localIP,
      port: availablePort
    }
  }

  static async getUPnPMappings(client:any): Promise<any> {
    return new Promise((resolve, reject) => {
      client.getMappings((err:any, res:any) => {
        if (err) {
          reject(err)
        }
        else {
          resolve(res)
        }
      })
    })
  }
}