"use strict";
import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {FileDAL} from "../lib/dal/fileDAL"
import {TransactionDTO} from "../lib/dto/TransactionDTO"
import {LOCAL_RULES_HELPERS} from "../lib/rules/local_rules"
import {GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules"
import {DBTx} from "../lib/dal/sqliteDAL/TxsDAL"

const constants       = require('../lib/constants');
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
    return GlobalFifoPromise.pushFIFO<TransactionDTO>(async () => {
      const tx = TransactionDTO.fromJSONObject(txObj, this.conf.currency)
      try {
        this.logger.info('⬇ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
        const existing = await this.dal.getTxByHash(tx.hash);
        const current = await this.dal.getCurrentBlockOrNull();
        if (existing) {
          throw constants.ERRORS.TX_ALREADY_PROCESSED;
        }
        // Start checks...
        const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
        const dto = TransactionDTO.fromJSONObject(tx)
        await LOCAL_RULES_HELPERS.checkSingleTransactionLocally(dto)
        await GLOBAL_RULES_HELPERS.checkTxBlockStamp(tx, this.dal);
        await GLOBAL_RULES_HELPERS.checkSingleTransaction(dto, nextBlockWithFakeTimeVariation, this.conf, this.dal, CHECK_PENDING_TRANSACTIONS);
        const server_pubkey = this.conf.pair && this.conf.pair.pub;
        if (!(await this.dal.txsDAL.sandbox.acceptNewSandBoxEntry({
            pubkey: tx.issuers.indexOf(server_pubkey) !== -1 ? server_pubkey : '',
            output_base: tx.output_base,
            output_amount: tx.output_amount
          }, server_pubkey))) {
          throw constants.ERRORS.SANDBOX_FOR_TRANSACTION_IS_FULL;
        }
        await this.dal.saveTransaction(DBTx.fromTransactionDTO(tx));
        this.logger.info('✔ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
        return tx;
      } catch (e) {
        this.logger.info('✘ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
        throw e;
      }
    })
  }
}
