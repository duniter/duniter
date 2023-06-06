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

import * as os from "os";
import { Underscore } from "../lib/common-libs/underscore";

const upnp = require("nat-upnp");

export interface UPnPBinding {
  remotehost: string;
  host: string;
  port: number;
}

export class UpnpProvider {
  private currentConfig: UPnPBinding | null;
  private interval: NodeJS.Timer | null;
  private client = upnp.createClient();

  constructor(
    private portStart: number,
    private portEnd: number,
    private identifier: string,
    private upnpInterval = 300,
    private ttl = 600,
    private logger?: any,
    private host = ""
  ) {
    if (!host) {
      this.host = this.getBestHostForUPnP();
    }
  }

  async checkUPnPisAvailable() {
    try {
      await new Promise<void>((resolve, reject) => {
        this.client.externalIp((err: any, res: any) => {
          if (err || !res) {
            reject();
          } else {
            resolve();
          }
        });
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  getCurrentConfig() {
    return this.currentConfig;
  }

  getUpnpDescription() {
    return "duniter:" + this.identifier;
  }

  /**
   * Always open the same port during an execution of Duniter.
   * @returns { host:string, port:number }
   */
  openPort() {
    return new Promise<{ host: string; port: number }>(
      async (resolve: any, reject: any) => {
        if (!this.currentConfig) {
          this.currentConfig = await this.getAvailablePort(this.client);
        }
        this.logger &&
          this.logger.trace(
            "WS2P: mapping external port %s to local %s using UPnP...",
            this.currentConfig.port,
            [this.currentConfig.host, this.currentConfig.port].join(":")
          );
        const client = upnp.createClient();
        client.portMapping(
          {
            public: this.currentConfig.port,
            private: {
              host: this.currentConfig.host,
              port: this.currentConfig.port,
            },
            ttl: this.ttl,
            description: this.getUpnpDescription(),
          },
          (err: any) => {
            client.close();
            if (err) {
              this.logger && this.logger.warn(err);
              return reject(err);
            }
            resolve(this.currentConfig);
          }
        );
      }
    );
  }

  async startRegular() {
    this.stopRegular();
    const available = await this.checkUPnPisAvailable();
    if (available) {
      // Update UPnP IGD every INTERVAL seconds
      this.interval = setInterval(
        () => this.openPort(),
        1000 * this.upnpInterval
      );
      const { host, port } = await this.openPort();
      return { host, port, available };
    }
    return { host: "", port: 0, available: false };
  }

  stopRegular() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  static async getLocalIP(client: any) {
    return await new Promise<string>((resolve: any, reject: any) => {
      client.findGateway((err: any, res: any, localIP: any) => {
        if (err) return reject(err);
        resolve(localIP);
      });
    });
  }

  static async getRemoteIP(client: any): Promise<string> {
    return await new Promise<string>((resolve: any, reject: any) => {
      client.externalIp((err: any, externalIP: string) => {
        if (err) return reject(err);
        resolve(externalIP);
      });
    });
  }

  private async getAvailablePort(client: any) {
    const localIP = this.host || (await UpnpProvider.getLocalIP(client));
    const remoteIP = await UpnpProvider.getRemoteIP(client);
    const mappings: {
      private: {
        host: string;
      };
      public: {
        port: number;
      };
      description: string;
    }[] = await UpnpProvider.getUPnPMappings(client);
    const thisDesc = this.getUpnpDescription();
    const externalPortsUsed = mappings
      .filter((m) => m.description !== thisDesc)
      .map((m) => m.public.port);
    let availablePort = this.portStart;
    while (
      externalPortsUsed.indexOf(availablePort) !== -1 &&
      availablePort <= this.portEnd
    ) {
      availablePort++;
    }
    if (availablePort > this.portEnd) {
      throw "No port available for UPnP";
    }
    return {
      remotehost: remoteIP,
      host: localIP,
      port: availablePort,
    };
  }

  static async getUPnPMappings(client: any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      client.getMappings((err: any, res: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  /**
   * Apparently on computers with both Wi-Fi and Ethernet, UPnP fails to open the port.
   * Giving the priority to Ethernet seems to fix the problem.
   * @param family
   */
  private getBestHostForUPnP(family = "") {
    let netInterfaces = os.networkInterfaces();
    let keys = Underscore.keys(netInterfaces);
    let res = [];
    for (const name of keys) {
      let addresses = netInterfaces[name] || [];
      for (const addr of addresses) {
        if (!family || addr.family == family) {
          res.push({
            name: name,
            value: addr.address,
          });
        }
      }
    }
    const interfacePriorityRegCatcher = [
      /^tun\d+/,
      /^enp\d+s\d+/,
      /^enp\d+s\d+f\d+/,
      /^eth\d+/,
      /^Ethernet/,
      /^wlp\d+s\d+/,
      /^wlan\d+/,
      /^Wi-Fi/,
      /^lo/,
      /^Loopback/,
      /^None/,
    ];
    const best = Underscore.sortBy(res, function (entry: any) {
      for (let i = 0; i < interfacePriorityRegCatcher.length; i++) {
        // `i` is the priority (0 is the better, 1 is the second, ...)
        if (entry.name.match(interfacePriorityRegCatcher[i])) return i;
      }
      return interfacePriorityRegCatcher.length;
    })[0];
    return (best && best.value) || "";
  }
}
