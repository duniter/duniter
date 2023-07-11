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

import { AbstractController } from "./AbstractController";
import { ParametersService } from "../parameters";
import { BMAConstants } from "../constants";
import { TransactionDTO } from "../../../../lib/dto/TransactionDTO";
import {
  HttpSources,
  HttpTransaction,
  HttpTransactionPending,
  HttpTxHistory,
  HttpTxOfHistory,
  HttpTxPending,
} from "../dtos";
import { DBTx } from "../../../../lib/db/DBTx";

const http2raw = require("../http2raw");

export class TransactionBinding extends AbstractController {
  get medianTimeOffset(): number {
    return (this.conf.avgGenTime * this.conf.medianTimeBlocks) / 2;
  }

  async parseTransaction(req: any): Promise<HttpTransactionPending> {
    const res = await this.pushEntity(
      req,
      http2raw.transaction,
      (raw: string) => this.server.writeRawTransaction(raw)
    );
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
    };
  }

  async getSources(req: any): Promise<HttpSources> {
    const pubkey = await ParametersService.getPubkeyP(req);
    const sources = await this.server.dal.getAvailableSourcesByPubkey(pubkey);
    return {
      currency: this.conf.currency,
      pubkey,
      sources,
    };
  }

  async getByHash(req: any): Promise<HttpTransaction> {
    const hash = ParametersService.getHash(req);
    const tx: DBTx = await this.server.dal.getTxByHash(hash);
    if (!tx) {
      throw BMAConstants.ERRORS.TX_NOT_FOUND;
    }
    tx.inputs = tx.inputs.map((i: any) => i.raw || i);
    tx.outputs = tx.outputs.map((o: any) => o.raw || o);
    return {
      version: tx.version,
      currency: tx.currency,
      locktime: tx.locktime,
      issuers: tx.issuers,
      inputs: tx.inputs,
      outputs: tx.outputs,
      unlocks: tx.unlocks,
      signatures: tx.signatures,
      comment: tx.comment,
      hash: tx.hash,
      written_block: tx.block_number,
      writtenTime: tx.time,
      raw: "",
    };
  }

  async getHistory(req: any): Promise<HttpTxHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    const history = await this.server.dal.getTxHistoryByPubkey(pubkey);
    return this.toHttpTxHistory(pubkey, history);
  }

  async getHistoryBetweenBlocks(req: any): Promise<HttpTxHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    const from = await ParametersService.getFromP(req);
    const to = await ParametersService.getToP(req);

    const history = await this.server.dal.getTxHistoryByPubkeyBetweenBlocks(
      pubkey,
      +from,
      +to
    );
    return this.toHttpTxHistory(pubkey, history);
  }

  async getHistoryBetweenTimes(req: any): Promise<HttpTxHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    const from = await ParametersService.getFromP(req);
    const to = await ParametersService.getToP(req);
    const medianTimeOffset = this.medianTimeOffset || 0; // Need to convert time into medianTime, because GVA module use median_time
    const history = await this.server.dal.getTxHistoryByPubkeyBetweenTimes(
      pubkey,
      +from - medianTimeOffset,
      +to - medianTimeOffset
    );
    return this.toHttpTxHistory(pubkey, history);
  }

  async getPendingByPubkey(req: any): Promise<HttpTxHistory> {
    const pubkey = await ParametersService.getPubkeyP(req);
    const history = await this.server.dal.getTxHistoryMempool(pubkey);
    return this.toHttpTxHistory(pubkey, history);
  }

  async getPending(): Promise<HttpTxPending> {
    const pending = await this.server.dal.getTransactionsPending();
    return {
      currency: this.conf.currency,
      pending: pending.map((t) => {
        const tx = TransactionDTO.fromJSONObject(t);
        return {
          version: tx.version,
          currency: tx.currency,
          issuers: tx.issuers,
          inputs: tx.inputs,
          unlocks: tx.unlocks,
          outputs: tx.outputs,
          comment: tx.comment,
          locktime: tx.locktime,
          blockstamp: tx.blockstamp,
          blockstampTime: tx.blockstampTime,
          signatures: tx.signatures,
          hash: tx.hash,
        };
      }),
    };
  }

  private async toHttpTxHistory(
    pubkey: string,
    dbTxHistory: {
      sent?: DBTx[];
      received?: DBTx[];
      receiving?: DBTx[];
      sending?: DBTx[];
      pending?: DBTx[];
    }
  ): Promise<HttpTxHistory> {
    return {
      currency: this.conf.currency,
      pubkey: pubkey,
      history: {
        sending: dbTxHistory.sending?.map(dbtx2HttpTxOfHistory) || [],
        received: dbTxHistory.received?.map(dbtx2HttpTxOfHistory) || [],
        receiving: dbTxHistory.receiving?.map(dbtx2HttpTxOfHistory) || [],
        sent: dbTxHistory.sent?.map(dbtx2HttpTxOfHistory) || [],
        pending: dbTxHistory.pending?.map(dbtx2HttpTxOfHistory) || [],
      },
    };
  }
}

function dbtx2HttpTxOfHistory(tx: DBTx): HttpTxOfHistory {
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
    time: tx.time || tx.received,
    block_number: tx.block_number,
  };
}
