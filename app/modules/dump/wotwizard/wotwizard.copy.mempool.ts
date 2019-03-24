import {WotWizardDAL} from "./wotwizard.init.structure"
import {Server} from "../../../../server"
import {DBBlock} from "../../../lib/db/DBBlock"
import {Underscore} from "../../../lib/common-libs/underscore"
import {NewLogger} from "../../../lib/logger"
import {WWBlockAccumulator} from "./hooks/wotwizard.block.insert"

export async function copyMemPool(server: Server, wwDAL: WotWizardDAL, acc: WWBlockAccumulator) {

  const logger = NewLogger()

  const identities = await server.dal.idtyDAL.sqlListAll()

  // Blocks on which are based identities
  const blocks = await Promise.all(identities.map(async idty => returnBlockIfPresentInServerButNotInWW(idty.buid, server, wwDAL)))

  const toPersist: DBBlock[] = Underscore.uniq(blocks.filter(b => b) as DBBlock[], false, b => [b.number, b.hash].join('-'))

  logger.debug('Persisting %s blocks for identities...', toPersist.length)
  acc.accumulate(toPersist)
  await wwDAL.blockDao.insertBatch(toPersist.map(b => { (b as any).legacy = true; return b }))
  await wwDAL.idtyDao.insertBatch(identities)
  await wwDAL.certDao.insertBatch(await server.dal.certDAL.sqlListAll())
  await wwDAL.msDao.insertBatch(await server.dal.msDAL.sqlListAll())
}

/**
 * Returns the server's block of given blockstamp if found in server and not found in WW
 * @param blockstamp
 * @param server
 * @param wwDAL
 */
async function returnBlockIfPresentInServerButNotInWW(blockstamp: string, server: Server, wwDAL: WotWizardDAL) {
  let b = await server.dal.getAbsoluteBlockByBlockstamp(blockstamp)
  if (b) {
    if (!(await wwHasBlock(wwDAL, b))) {
      return b
    }
  }
  return null
}

/**
 * Tells wether given block is found in WW database or not.
 * @param wwDAL
 * @param b
 */
export async function wwHasBlock(wwDAL: WotWizardDAL, b: { number: number, hash: string}) {
  const wwBlock = await wwDAL.blockDao.getAbsoluteBlock(b.number, b.hash)
  return !!wwBlock
}
