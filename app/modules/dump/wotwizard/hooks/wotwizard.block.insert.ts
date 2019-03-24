import {Server} from "../../../../../server"
import {WotWizardDAL} from "../wotwizard.init.structure"
import {DBBlock} from "../../../../lib/db/DBBlock"
import {IdentityDTO} from "../../../../lib/dto/IdentityDTO"
import {CertificationDTO} from "../../../../lib/dto/CertificationDTO"
import {MembershipDTO} from "../../../../lib/dto/MembershipDTO"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {wwHasBlock} from "../wotwizard.copy.mempool"
import {filterAsync} from "../../../../lib/common-libs/filter-async"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {NewLogger} from "../../../../lib/logger"

export interface WWBlockAccumulator {
  accumulate(blocks: DBBlock[]): void
  persist(): Promise<void>
}

export function requiredBlocksAccumulator(server: Server, wwDAL: WotWizardDAL): WWBlockAccumulator {

  const logger = NewLogger()
  const blockstamps: { [k: string]: boolean } = {}
  const blockNumbers: { [k: number]: boolean } = {}

  return {
    accumulate(blocks: DBBlock[]) {
      blocks.forEach(b => {
        b.identities.forEach(i => blockstamps[IdentityDTO.fromInline(i).buid] = true)
        b.certifications.forEach(i => blockNumbers[CertificationDTO.fromInline(i).block_number] = true)
        b.joiners
          .concat(b.actives)
          .concat(b.leavers)
          .forEach(i => blockstamps[MembershipDTO.fromInline(i).blockstamp] = true)
      })
    },

    /**
     * Returns the blocks that are not in WW but that requires to be because of inserted blocks containing
     * interesting blockstamps (from identifies, certifications, memberships)
     */
    async persist() {
      const chunkLen = 250
      const numbers = Object.keys(blockNumbers).map(n => parseInt(n))
      const blocksForCertifications: (DBBlock|null)[] = []
      for (let i = 0; i < numbers.length; i += chunkLen) {
        const chunk = numbers.slice(0, chunkLen)
        logger.debug('Chunk %s-%s', i, i + chunkLen)
        ;(await Promise.all(chunk.map(n => server.dal.getBlock(n))))
          .forEach(b => blocksForCertifications.push(b))
      }
      const blocksForBlockstamps: (DBBlock|null)[] = await Promise.all(
        Object
          .keys(blockstamps)
          .map(b => server.dal.getAbsoluteBlockByBlockstamp(b))
      )
      const reducedBlocks: { [k: string]: DBBlock } = blocksForCertifications
        .concat(blocksForBlockstamps)
        .reduce((acc, b) => {
          if (b) {
            acc[BlockDTO.blockstamp(b)] = b
          }
          return acc
        }, {} as { [k: string]: DBBlock })

      const blocksToInsert = await filterAsync(Object.values(reducedBlocks), (b: DBBlock) => wwHasBlock(wwDAL, b).then(b => !b))
      const blocksSorted = Underscore.sortBy(blocksToInsert, b => b.number)
      await wwDAL.blockDao.insertBatch(blocksSorted.map(f => { (f as any).legacy = true; return f }))
    }
  }
}