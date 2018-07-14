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

import {WS2PConstants} from "./constants"
import {ConfDTO} from "../../../lib/dto/ConfDTO"

const upnp = require('nat-upnp');

export interface UPnPBinding {
  remotehost:string
  host:string
  port:number
}

export class WS2PUpnp {

  private currentConfig:UPnPBinding|null
  private interval:NodeJS.Timer|null
  private client = upnp.createClient()

  constructor(private logger:any, private conf:ConfDTO) {}

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

  getUpnpDescription() {
    const uuid = (this.conf.ws2p && this.conf.ws2p.uuid) || "no-uuid-yet"
    const suffix = this.conf.pair.pub.substr(0, 6) + ":" + uuid
    return 'duniter:ws2p:' + suffix
  }

  /**
   * Always open the same port during an execution of Duniter.
   * @returns { host:string, port:number }
   */
  openPort() {
    return new Promise<{ host:string, port:number }>(async (resolve:any, reject:any) => {
      if (!this.currentConfig) {
        this.currentConfig = await this.getAvailablePort(this.client)
      }
      this.logger.trace('WS2P: mapping external port %s to local %s using UPnP...', this.currentConfig.port, [this.currentConfig.host, this.currentConfig.port].join(':'))
      const client = upnp.createClient()
      client.portMapping({
        'public': this.currentConfig.port,
        'private': this.currentConfig.port,
        'ttl': WS2PConstants.WS2P_UPNP_TTL,
        'description': this.getUpnpDescription()
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

  private async getAvailablePort(client:any) {
    const localIP = await WS2PUpnp.getLocalIP(client)
    const remoteIP = await WS2PUpnp.getRemoteIP(client)
    const mappings:{
      private: {
        host:string
      }
      public: {
        port:number
      }
      description:string
    }[] = await WS2PUpnp.getUPnPMappings(client)
    const thisDesc = this.getUpnpDescription()
    const externalPortsUsed = mappings.filter((m) => m.description !== thisDesc).map((m) => m.public.port)
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