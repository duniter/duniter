import {AbstractController} from "./AbstractController";
import {ParametersService} from "../parameters";
import {Source} from "../entity/source";
import {BMAConstants} from "../constants";
import {TransactionDTO} from "../../../../lib/dto/TransactionDTO";
import {HttpSources, HttpTransaction, HttpTxHistory, HttpTxOfHistory, HttpTxPending} from "../dtos";
import {DBTx} from "../../../../lib/dal/sqliteDAL/TxsDAL";

const _                = require('underscore');
const http2raw         = require('../http2raw');

export class TransactionBinding extends AbstractController {

  async parseTransaction(req:any): Promise<HttpTransaction> {
    const res = await this.pushEntity(req, http2raw.transaction, (raw:string) => this.server.writeRawTransaction(raw))
    return {
      version: res.version,
      currency: res.currency,
      issuers: res.issuers,
      inputs: res.inputs,
      outputs: res.outputs,
      unlocks: res.unlocks,
      signatures: res.signatures,
      comment: res.comment,
      locktime: res.locktime,
      hash: res.hash,
      written_block: res.blockNumber,
      raw: res.getRaw()
    }
  }

  async getSources(req:any): Promise<HttpSources> {
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

  async getByHash(req:any): Promise<HttpTransaction> {
    const hash = ParametersService.getHash(req);
    const tx:DBTx = await this.server.dal.getTxByHash(hash);
    if (!tx) {
      throw BMAConstants.ERRORS.TX_NOT_FOUND;
    }
    tx.inputs = tx.inputs.map((i:any) => i.raw || i)
    tx.outputs = tx.outputs.map((o:any) => o.raw || o)
    return {
      version: tx.version,
      currency: tx.currency,
      locktime: tx.locktime,
      // blockstamp: tx.blockstamp,
      // blockstampTime: tx.blockstampTime,
      issuers: tx.issuers,
      inputs: tx.inputs,
      outputs: tx.outputs,
      unlocks: tx.unlocks,
      signatures: tx.signatures,
      comment: tx.comment,
      hash: tx.hash,
      // time: tx.time,
      // block_number: tx.block_number,
      written_block: tx.block_number,
      // received: tx.received,
      raw: ""
    }
  }

  async getHistory(req:any): Promise<HttpTxHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    return this.getFilteredHistory(pubkey, (results:any) => results);
  }

  async getHistoryBetweenBlocks(req:any): Promise<HttpTxHistory> {
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

  async getHistoryBetweenTimes(req:any): Promise<HttpTxHistory> {
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

  async getPendingForPubkey(req:any): Promise<HttpTxHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    return this.getFilteredHistory(pubkey, function(res:any) {
      const histo = res.history;
      _.extend(histo, { sent: [], received: [] });
      return res;
    });
  }

  async getPending(): Promise<HttpTxPending> {
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

  private async getFilteredHistory(pubkey:string, filter:any): Promise<HttpTxHistory> {
    let history = await this.server.dal.getTransactionsHistory(pubkey);
    let result = {
      "currency": this.conf.currency,
      "pubkey": pubkey,
      "history": {
        sending: history.sending.map(dbtx2HttpTxOfHistory),
        received: history.received.map(dbtx2HttpTxOfHistory),
        receiving: history.receiving.map(dbtx2HttpTxOfHistory),
        sent: history.sent.map(dbtx2HttpTxOfHistory),
        pending: history.pending.map(dbtx2HttpTxOfHistory)
      }
    }
    return filter(result);
  }
}

function dbtx2HttpTxOfHistory(tx:DBTx): HttpTxOfHistory {
  return {
    version: tx.version,
    locktime: tx.locktime,
    blockstamp: tx.blockstamp,
    blockstampTime: tx.blockstampTime,
    issuers: tx.issuers,
    inputs: tx.inputs,
    outputs: tx.outputs,
    unlocks: tx.unlocks,
    signatures: tx.signatures,
    comment: tx.comment,
    hash: tx.hash,
    time: tx.time,
    block_number: tx.block_number,
    received: tx.received
  }
}
