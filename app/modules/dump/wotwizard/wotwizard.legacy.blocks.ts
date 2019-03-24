import {WotWizardDAL} from "./wotwizard.init.structure"
import {Server} from "../../../../server"
import {CommonConstants} from "../../../lib/common-libs/constants"
import {DBBlock} from "../../../lib/db/DBBlock"
import {NewLogger} from "../../../lib/logger"
import {WWBlockAccumulator} from "./hooks/wotwizard.block.insert"

export async function addLegacyBlocks(server: Server, wwDAL: WotWizardDAL, acc: WWBlockAccumulator) {

  const logger = NewLogger()

  const currentWW = await wwDAL.blockDao.getCurrent()
  const current = await server.dal.blockDAL.getCurrent()
  const start = currentWW && currentWW.number + 1 || 0
  const end = current && Math.max(-1, current.number - 100) || -1

  const blocksSaved: DBBlock[] = []
  logger.debug('Reading blocks...')

  // We loop taking care of archives structure
  for (let i = start; i <= end; i += CommonConstants.ARCHIVES_BLOCKS_CHUNK) {
    const blocks = await server.dal.getBlocksBetween(i, Math.min(end, i + CommonConstants.ARCHIVES_BLOCKS_CHUNK) - 1)
    const filtered = blocks.filter(b => b.joiners.length
      || b.actives.length
      || b.leavers.length
      || b.revoked.length
      || b.excluded.length
      || b.certifications.length
    )
    if (filtered.length) {
      const legacies = filtered.map(f => { (f as any).legacy = true; return f })
      legacies.forEach(l => blocksSaved.push(l))
      // blocksSaved.push(wwDAL.blockDao.insertBatch(legacies))
    }
  }

  logger.debug('Saving blocks...')
  await wwDAL.blockDao.insertBatch(blocksSaved)
  acc.accumulate(blocksSaved)

  await Promise.all(blocksSaved)

  const iindexRows = (await server.dal.iindexDAL.findRawWithOrder({}, [['writtenOn', false], ['wotb_id', false]]))
    .filter(r => r.hash && r.writtenOn >= start && r.writtenOn <= end)

  logger.debug('Saving %s iindex rows...', iindexRows.length)
  const legacies = iindexRows.map(f => { (f as any).legacy = true; return f })
  await wwDAL.iindexDao.insertBatch(legacies)
}