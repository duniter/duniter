import {WS2PConstants} from "./constants"
const upnp = require('nnupnp');

export interface UPnPBinding {
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
      await new Promise((resolve, reject) => {
        this.client.externalIp((err:any, res:any) => {
          if (err || !res) {
            reject()
          } else {
            resolve()
          }
        })
      })
      return true
    } catch (err) {
      return false
    }
  }

  getCurrentConfig() {
    return this.currentConfig
  }

  /**
   * Always open the same port during an execution of Duniter.
   * @returns { host:string, port:number }
   */
  openPort() {
    return new Promise<{ host:string, port:number }>(async (resolve:any, reject:any) => {
      if (!this.currentConfig) {
        this.currentConfig = await WS2PUpnp.getAvailablePort(this.client)
      }
      this.logger.trace('WS2P: mapping external port %s to local %s using UPnP...', this.currentConfig.port, [this.currentConfig.host, this.currentConfig.port].join(':'))
      const client = upnp.createClient()
      client.portMapping({
        'public': this.currentConfig.port,
        'private': this.currentConfig.port,
        'ttl': WS2PConstants.WS2P_UPNP_TTL,
        'description': 'duniter:ws2p:upnp'
      }, (err:any) => {
        client.close()
        if (err) {
          this.logger.warn(err)
          return reject(err)
        }
        resolve(this.currentConfig)
      })
    })
  }

  async startRegular() {
    this.stopRegular();
    const available = await this.checkUPnPisAvailable()
    if (available) {
      // Update UPnP IGD every INTERVAL seconds
      this.interval = setInterval(() => this.openPort(), 1000 * WS2PConstants.WS2P_UPNP_INTERVAL)
      const { host, port } = await this.openPort()
      return { host, port, available }
    }
    return { host: '', port: 0, available: false }
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
    const externalPortsUsed = mappings.map((m) => {
      return m.public.port
    })
    let availablePort = WS2PConstants.WS2P_PORTS_START
    while (externalPortsUsed.indexOf(availablePort) !== -1
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