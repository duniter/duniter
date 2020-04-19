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

import { BMAConstants } from "./constants";
import { ConfDTO } from "../../../lib/dto/ConfDTO";

const upnp = require("nat-upnp");
const Q = require("q");

export const Upnp = async function (
  localPort: number,
  remotePort: number,
  logger: any,
  conf: ConfDTO
) {
  "use strict";

  logger.info("UPnP: configuring...");
  const api = new UpnpApi(localPort, remotePort, logger, conf);
  try {
    await api.openPort();
  } catch (e) {
    const client = upnp.createClient();
    try {
      await Q.nbind(client.externalIp, client)();
    } catch (err) {
      if (err && err.message == "timeout") {
        throw 'No UPnP gateway found: your node won\'t be reachable from the Internet. Use --noupnp option to avoid this message.';
      }
      throw err;
    } finally {
      client.close();
    }
  }
  return api;
};

export class UpnpApi {
  private interval: NodeJS.Timer | null;

  constructor(
    private localPort: number,
    private remotePort: number,
    private logger: any,
    private conf: ConfDTO
  ) {}

  openPort() {
    "use strict";
    return Q.Promise((resolve: any, reject: any) => {
      const suffix = this.conf.pair.pub.substr(0, 6);
      this.logger.trace(
        "UPnP: mapping external port %s to local %s...",
        this.remotePort,
        this.localPort
      );
      const client = upnp.createClient();
      client.portMapping(
        {
          public: this.remotePort,
          private: this.localPort,
          ttl: BMAConstants.UPNP_TTL,
          description: "duniter:bma:" + suffix,
        },
        (err: any) => {
          client.close();
          if (err) {
            this.logger.warn(err);
            return reject(err);
          }
          resolve();
        }
      );
    });
  }

  async findGateway() {
    try {
      const client = upnp.createClient();
      const res = await Q.nbind(client.findGateway, client)();
      const desc = res && res[0] && res[0].description;
      if (desc) {
        const match = desc.match(/(\d+.\d+.\d+.\d+):/);
        if (match) {
          return match[1];
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  startRegular() {
    this.stopRegular();
    // Update UPnP IGD every INTERVAL seconds
    this.interval = setInterval(
      () => this.openPort(),
      1000 * BMAConstants.UPNP_INTERVAL
    );
  }

  stopRegular() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}
