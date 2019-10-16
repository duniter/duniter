import {Server} from "../../../../server"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {DBBlock} from "../../../lib/db/DBBlock"

export async function dumpForks(server: Server, blocks: string) {
  return dumpBlocks(server, blocks, false)
}

export async function dumpBlocks(server: Server, blocks: string, showMainBcOnly = true) {
  const patterns = blocks.split(',')
  for (const p of patterns) {
    // Single block to dump
    if (p.match(/^\d+$/)) {
      const bNumber = parseInt(p)
      if (showMainBcOnly) {
        dumpBlockIfDefined(await server.dal.getBlock(bNumber))
      } else {
        (await server.dal.getPotentialForkBlocks(bNumber, 0, bNumber)).forEach(dumpBlockIfDefined)
      }
    }
  }
}

export function dumpBlockIfDefined(b: DBBlock|undefined|null) {
  console.log(BlockDTO.fromJSONObject(b).getRawSigned())
}
