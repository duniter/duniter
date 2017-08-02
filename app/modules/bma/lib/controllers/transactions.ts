import {AbstractController} from "./AbstractController";
import {ParametersService} from "../parameters";
import {Source} from "../entity/source";
import {BMAConstants} from "../constants";
import {TransactionDTO} from "../../../../lib/dto/TransactionDTO";

const _                = require('underscore');
const http2raw         = require('../http2raw');

export class TransactionBinding extends AbstractController {

  parseTransaction(req:any) {
    return this.pushEntity(req, http2raw.transaction, (raw:string) => this.server.writeRawTransaction(raw))
  }

  async getSources(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    const sources = await this.server.dal.getAvailableSourcesByPubkey(pubkey);
    const result:any = {
      "currency": this.conf.currency,
      "pubkey": pubkey,
      "sources": []
    };
    sources.forEach(function (src:any) {
      result.sources.push(new Source(src).json());
    });
    return result;
  }

  async getByHash(req:any) {
    const hash = ParametersService.getHash(req);
    const tx = await this.server.dal.getTxByHash(hash);
    if (!tx) {
      throw BMAConstants.ERRORS.TX_NOT_FOUND;
    }
    if (tx.block_number) {
      tx.written_block = tx.block_number
    }
    tx.inputs = tx.inputs.map((i:any) => i.raw || i)
    tx.outputs = tx.outputs.map((o:any) => o.raw || o)
    return tx;
  }

  async getHistory(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    return this.getFilteredHistory(pubkey, (results:any) => results);
  }

  async getHistoryBetweenBlocks(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    const from = await ParametersService.getFromP(req);
    const to = await ParametersService.getToP(req);
    return this.getFilteredHistory(pubkey, (res:any) => {
      const histo = res.history;
      histo.sent =     _.filter(histo.sent, function(tx:any){ return tx && tx.block_number >= from && tx.block_number <= to; });
      histo.received = _.filter(histo.received, function(tx:any){ return tx && tx.block_number >= from && tx.block_number <= to; });
      _.extend(histo, { sending: [], receiving: [] });
      return res;
    });
  }

  async getHistoryBetweenTimes(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    const from = await ParametersService.getFromP(req);
    const to = await ParametersService.getToP(req);
    return this.getFilteredHistory(pubkey, (res:any) => {
      const histo = res.history;
      histo.sent =     _.filter(histo.sent, function(tx:any){ return tx && tx.time >= from && tx.time <= to; });
      histo.received = _.filter(histo.received, function(tx:any){ return tx && tx.time >= from && tx.time <= to; });
      _.extend(histo, { sending: [], receiving: [] });
      return res;
    });
  }

  async getPendingForPubkey(req:any) {
    const pubkey = await ParametersService.getPubkeyP(req);
    return this.getFilteredHistory(pubkey, function(res:any) {
      const histo = res.history;
      _.extend(histo, { sent: [], received: [] });
      return res;
    });
  }

  async getPending() {
    const pending = await this.server.dal.getTransactionsPending();
    const res = {
      "currency": this.conf.currency,
      "pending": pending
    };
    pending.map(function(tx:any, index:number) {
      pending[index] = _.omit(TransactionDTO.fromJSONObject(tx).json(), 'currency', 'raw');
    });
    return res;
  }

  private async getFilteredHistory(pubkey:string, filter:any) {
    let history:any = await this.server.dal.getTransactionsHistory(pubkey);
    let result = {
      "currency": this.conf.currency,
      "pubkey": pubkey,
      "history": history
    };
    _.keys(history).map((key:any) => {
      history[key].map((tx:any, index:number) => {
        history[key][index] = _.omit(TransactionDTO.fromJSONObject(tx).json(), 'currency', 'raw');
        _.extend(history[key][index], {block_number: tx && tx.block_number, time: tx && tx.time});
      });
    });
    return filter(result);
  }
}
