import {ConfDTO} from "../lib/dto/ConfDTO";
import {Server} from "../../server";
import {BlockDTO} from "../lib/dto/BlockDTO";
import {TransactionDTO} from "../lib/dto/TransactionDTO"
import {NewLogger} from "../lib/logger";

const logger = NewLogger()

const qfs = require('q-io/fs')

module.exports = {
  duniter: {

    cli: [{
      name: 'crowdf-meter <key> <uuid> [min]',
      desc: 'Display the progress of a crowdfunding gannonce',
      preventIfRunning: true,

      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const m1 = params[0].match(/([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44})/);
        const m2 = params[1].match(/([0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12})/);
        if (!(m1 && m1[1])) {
          //logger.error('Malformed or missing GAnnonce UUID.');
          throw 'Missing or malformed GAnnonce Duniter pubkey.';
        }
        if (!(m2 && m2[1])) {
          //logger.error('Malformed or missing GAnnonce UUID.');
          throw 'Missing or malformed GAnnonce UUID.';
        }
        const key = m1[1];
        const uuid = m2[1];
        const required = params[2];
		let current = await server.dal.getCurrentBlockOrNull()
        const rows = await server.dal.txsDAL.query('SELECT ' +
          'outputs  ' +
          'FROM txs ' +
          'WHERE instr(comment, \'' + uuid + '\') > 0 AND written = 1' +
          '')
        let total = 0;
        for (const row of rows) {
          const dto = TransactionDTO.fromJSONObject(row)
          const outputs = dto.outputsAsObjects();
          for (const o of outputs) {
            if (o.conditions == "SIG("+key+")")
              total += o.amount;
              // TODO: handle o.base !!!
          }
        }
        logger.info('Total: ' + (total / 100.0).toFixed(2))
        if (required)
          logger.info('Done: ' + total / required + '%')
      }
    }]
  }
}

