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

import {AbstractController} from "./AbstractController"
import {ParametersService} from "../parameters"
import {Source} from "../entity/source"
import {HttpUDHistory} from "../dtos";

const _ = require('underscore');

export class UDBinding extends AbstractController {

  async getHistory(req:any): Promise<HttpUDHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    return this.getUDSources(pubkey, (results:any) => results);
  }

  async getHistoryBetweenBlocks(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    const from = await ParametersService.getFromP(req);
    const to = await ParametersService.getToP(req);
    return this.getUDSources(pubkey, (results:any) => {
      results.history.history = _.filter(results.history.history, function(ud:any){ return ud.block_number >= from && ud.block_number <= to; });
      return results;
    })
  }

  async getHistoryBetweenTimes(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    const from = await ParametersService.getFromP(req);
    const to = await ParametersService.getToP(req);
    return this.getUDSources(pubkey, (results:any) => {
      results.history.history = _.filter(results.history.history, function(ud:any){ return ud.time >= from && ud.time <= to; });
      return results;
    });
  }

  private async getUDSources(pubkey:string, filter:any) {
      const history:any = await this.server.dal.getUDHistory(pubkey);
      const result = {
        "currency": this.conf.currency,
        "pubkey": pubkey,
        "history": history
      };
      _.keys(history).map((key:any) => {
        history[key].map((src:any, index:number) => {
          history[key][index] = _.omit(new Source(src).UDjson(), 'currency', 'raw');
          _.extend(history[key][index], { block_number: src && src.block_number, time: src && src.time });
        });
      });
      return filter(result);
  }
}
