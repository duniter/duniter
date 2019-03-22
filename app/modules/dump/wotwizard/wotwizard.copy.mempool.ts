import {WotWizardDAL} from "./wotwizard.init.structure"
import {Server} from "../../../../server"
import {DBBlock} from "../../../lib/db/DBBlock"
import {Underscore} from "../../../lib/common-libs/underscore"
import {NewLogger} from "../../../lib/logger"

export async function copyMemPool(server: Server, wwDAL: WotWizardDAL) {

  const logger = NewLogger()

  const identities = await server.dal.idtyDAL.sqlListAll()

  // Blocks on which are based identities
  const blocks = await Promise.all(identities.map(async idty => {
    let b = await server.dal.getAbsoluteBlockByBlockstamp(idty.buid)
    if (b) {
      const b2 = await wwDAL.blockDao.getAbsoluteBlock(b.number, b.hash)
      if (!b2) {
        return b
      }
    }
    return null
  }))


  const toPersist: DBBlock[] = Underscore.uniq(blocks.filter(b => b) as DBBlock[], false, b => [b.number, b.hash].join('-'))

  logger.debug('Persisting %s blocks for identities...', toPersist.length)
  await wwDAL.blockDao.insertBatch(toPersist.map(b => { (b as any).legacy = true; return b }))
  await wwDAL.idtyDao.insertBatch(identities)
  await wwDAL.certDao.insertBatch(await server.dal.certDAL.sqlListAll())
  await wwDAL.msDao.insertBatch(await server.dal.msDAL.sqlListAll())
}