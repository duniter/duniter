import {ConfDTO} from "../lib/dto/ConfDTO";
import {Server} from "../../server";
import {BlockDTO} from "../lib/dto/BlockDTO";
import {NewLogger} from "../lib/logger";

const logger = NewLogger()

const qfs = require('q-io/fs')

module.exports = {
  duniter: {

    cli: [{
      name: 'wot',
      desc: 'Display the current wot',
      preventIfRunning: true,

      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        let current = await server.dal.getCurrentBlockOrNull()
        while (current != null) {
          if (current.identities.length > 0
            || current.joiners.length > 0
            || current.actives.length > 0
            || current.leavers.length > 0
            || current.certifications.length > 0
            || current.revoked.length > 0
            || current.excluded.length > 0) {
            // Display the current wot before the
            await displayCurrentWoT(current, server)
          }
          logger.info('Rever block#%s...', current.number)
          await server.BlockchainService.revertCurrentBlock()
          current = await server.dal.getCurrentBlockOrNull()
        }
      }
    }]
  }
}

async function displayCurrentWoT(current:BlockDTO, server:Server) {
  logger.info('Dumping wot...')
  const rows = await server.dal.cindexDAL.query('SELECT ' +
    'i1.wotb_id as wid1, ' +
    'i2.wotb_id as wid2 ' +
    'FROM i_index i1, i_index i2, c_index c ' +
    'WHERE c.issuer = i1.pub AND c.receiver = i2.pub' +
    '')
  // Formatage de la WoT
  const json = JSON.stringify({ links: rows.map((r:any) => { return { from: r.wid1, to: r.wid2 }}) }, null, ' ')
  await qfs.makeTree('./wot_history')
  await qfs.write('./wot_history/' + current.number + '.json', json)
}
