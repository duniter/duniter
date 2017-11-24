import {ConfDTO} from "../lib/dto/ConfDTO";
import {Server} from "../../server";
import {BlockDTO} from "../lib/dto/BlockDTO";
import {NewLogger} from "../lib/logger";

const logger = NewLogger()

const qfs = require('q-io/fs')

module.exports = {
  duniter: {

    cli: [{
      name: 'certif',
      desc: 'Display the current wot\'s certification',
      preventIfRunning: true,

      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        let current = await server.dal.getCurrentBlockOrNull()
        logger.info('Dumping wot...')
        const rows = await server.dal.cindexDAL.query('SELECT ' +
          'i1.uid as uid1, ' +
          'i2.uid as uid2 ' +
          'FROM i_index i1, i_index i2, c_index c ' +
          'WHERE c.issuer = i1.pub AND c.receiver = i2.pub' +
          '')
        for (const row of rows) {
          logger.info('%s -> %s', row.uid1, row.uid2)
        }
      }
    }]
  }
}

