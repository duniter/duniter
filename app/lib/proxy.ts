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

import { CommonConstants } from "./common-libs/constants";

const SocksProxyAgent = require("socks-proxy-agent");

export class ProxiesConf {
  public proxySocksAddress: string | undefined;
  public proxyTorAddress: string | undefined;
  public reachingClearEp: string;
  public forceTor: boolean;

  constructor() {
    this.proxySocksAddress = undefined;
    this.proxyTorAddress = undefined;
    this.reachingClearEp = "clear";
    this.forceTor = false;
  }

  static canReachClearEndpoint(proxiesConf: ProxiesConf | undefined): boolean {
    return proxiesConf === undefined || proxiesConf.reachingClearEp !== "none";
  }

  static canReachTorEndpoint(proxiesConf: ProxiesConf | undefined): boolean {
    return (
      proxiesConf !== undefined &&
      (proxiesConf.forceTor || proxiesConf.proxyTorAddress !== undefined)
    );
  }

  static httpProxy(
    url: string,
    proxiesConf: ProxiesConf | undefined
  ): string | undefined {
    return ProxiesConf.chooseProxyAgent(
      url,
      proxiesConf,
      CommonConstants.HOST_ONION_REGEX
    );
  }

  static wsProxy(
    address: string,
    proxiesConf: ProxiesConf | undefined
  ): string | undefined {
    return ProxiesConf.chooseProxyAgent(
      address,
      proxiesConf,
      CommonConstants.WS_FULL_ADDRESS_ONION_REGEX
    );
  }

  private static chooseProxyAgent(
    address: string,
    proxiesConf: ProxiesConf | undefined,
    onionRegex: RegExp
  ): string | undefined {
    if (proxiesConf !== undefined) {
      if (address.match(onionRegex)) {
        if (ProxiesConf.canReachTorEndpoint(proxiesConf)) {
          return proxiesConf.proxyTorAddress;
        }
      } else {
        if (ProxiesConf.canReachClearEndpoint(proxiesConf)) {
          if (proxiesConf.reachingClearEp == "tor") {
            return proxiesConf.proxyTorAddress;
          } else {
            return proxiesConf.proxySocksAddress;
          }
        }
      }
    }
    return undefined;
  }
}
