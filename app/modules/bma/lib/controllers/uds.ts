import {AbstractController} from "./AbstractController"
import {ParametersService} from "../parameters"
import {Source} from "../entity/source"

const _ = require('underscore');

export class UDBinding extends AbstractController {

  async getHistory(req:any) {
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
