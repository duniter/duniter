"use strict";
import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {FileDAL} from "../lib/dal/fileDAL"
import {TransactionDTO} from "../lib/dto/TransactionDTO"

const constants       = require('../lib/constants');
const rules           = require('../lib/rules')
const Transaction     = require('../lib/entity/transaction');
const CHECK_PENDING_TRANSACTIONS = true

export class TransactionService {

  conf:ConfDTO
  dal:FileDAL
  logger:any

  setConfDAL(newConf:ConfDTO, newDAL:FileDAL) {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require('../lib/logger').NewLogger(this.dal.profile);
  }

  processTx(txObj:any) {
    return GlobalFifoPromise.pushFIFO(async () => {
      const tx = new Transaction(txObj, this.conf.currency);
      try {
        this.logger.info('⬇ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
        const existing = await this.dal.getTxByHash(tx.hash);
        const current = await this.dal.getCurrentBlockOrNull();
        if (existing) {
          throw constants.ERRORS.TX_ALREADY_PROCESSED;
        }
        // Start checks...
        const transaction = tx.getTransaction();
        const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
        const dto = TransactionDTO.fromJSONObject(tx)
        await rules.HELPERS.checkSingleTransactionLocally(dto)
        await rules.HELPERS.checkTxBlockStamp(transaction, this.dal);
        await rules.HELPERS.checkSingleTransaction(dto, nextBlockWithFakeTimeVariation, this.conf, this.dal, CHECK_PENDING_TRANSACTIONS);
        const server_pubkey = this.conf.pair && this.conf.pair.pub;
        transaction.pubkey = transaction.issuers.indexOf(server_pubkey) !== -1 ? server_pubkey : '';
        if (!(await this.dal.txsDAL.sandbox.acceptNewSandBoxEntry(transaction, server_pubkey))) {
          throw constants.ERRORS.SANDBOX_FOR_TRANSACTION_IS_FULL;
        }
        tx.blockstampTime = transaction.blockstampTime;
        await this.dal.saveTransaction(tx);
        this.logger.info('✔ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
        return tx;
      } catch (e) {
        this.logger.info('✘ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
        throw e;
      }
    })
  }
}
