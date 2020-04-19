import { WotWizardDAL } from "./wotwizard.init.structure";
import { Server } from "../../../../server";
import { CommonConstants } from "../../../lib/common-libs/constants";
import { NewLogger } from "../../../lib/logger";

export async function addNewBlocks(server: Server, wwDAL: WotWizardDAL) {
  const logger = NewLogger();

  wwDAL.blockDao.cleanCache();

  const currentWW = await wwDAL.blockDao.getCurrent();
  const current = await server.dal.blockDAL.getCurrent();
  const start = (currentWW && currentWW.number + 1) || 0;
  const end = (current && current.number) || -1;

  const blocksSaved: Promise<any>[] = [];

  // We loop to work in flow mode (avoid big memory consumption)
  for (let i = start; i <= end; i += CommonConstants.BLOCKS_IN_MEMORY_MAX) {
    const beginAt = i;
    const endAt = Math.min(end, i + CommonConstants.BLOCKS_IN_MEMORY_MAX) - 1;
    const blocks = await server.dal.getBlocksBetween(beginAt, endAt);
    const forks = await server.dal.getPotentialForkBlocks(beginAt, 0, endAt);
    const all = blocks.concat(forks).map((f) => {
      (f as any).legacy = false;
      return f;
    });
    logger.debug("Saving %s pending blocks...", all.length);
    blocksSaved.push(wwDAL.blockDao.insertBatch(all));
  }

  await Promise.all(blocksSaved);

  const iindexRows = (
    await server.dal.iindexDAL.findRawWithOrder({}, [
      ["writtenOn", false],
      ["wotb_id", false],
    ])
  ).filter((r) => r.writtenOn >= start && r.uid);

  logger.debug("Saving %s iindex rows...", iindexRows.length);
  const legacies = iindexRows.map((f) => {
    (f as any).legacy = false;
    return f;
  });
  await wwDAL.iindexDao.insertBatch(legacies);
}
