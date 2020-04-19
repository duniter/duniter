import { WotWizardDAL } from "./wotwizard.init.structure";
import { Server } from "../../../../server";
import { CommonConstants } from "../../../lib/common-libs/constants";
import { DBBlock } from "../../../lib/db/DBBlock";
import { NewLogger } from "../../../lib/logger";

export async function addLegacyBlocks(server: Server, wwDAL: WotWizardDAL) {
  const logger = NewLogger();

  const currentWW = await wwDAL.blockDao.getCurrent();
  const current = await server.dal.blockDAL.getCurrent();
  const start = (currentWW && currentWW.number + 1) || 0;
  const end = (current && Math.max(-1, current.number - 100)) || -1;

  let blocksSaved: DBBlock[] = [];
  logger.debug("Reading blocks...");

  // We loop to work in flow mode (avoid big memory consumption)
  for (let i = start; i <= end; i += CommonConstants.BLOCKS_IN_MEMORY_MAX) {
    const blocks = await server.dal.getBlocksBetween(
      i,
      Math.min(end, i + CommonConstants.BLOCKS_IN_MEMORY_MAX) - 1
    );
    const legacies = blocks.map((f) => {
      (f as any).legacy = true;
      return f;
    });
    legacies.forEach((l) => blocksSaved.push(l));
    if (i % 25000 === 0) {
      logger.debug("Saving 25 blocks... (%s yet stored)", i);
      await wwDAL.blockDao.insertBatch(blocksSaved);
      blocksSaved = [];
    }
  }

  logger.debug("Saving blocks...");
  await wwDAL.blockDao.insertBatch(blocksSaved);

  await Promise.all(blocksSaved);

  const iindexRows = (
    await server.dal.iindexDAL.findRawWithOrder({}, [
      ["writtenOn", false],
      ["wotb_id", false],
    ])
  ).filter((r) => r.hash && r.writtenOn >= start && r.writtenOn <= end);

  logger.debug("Saving %s iindex rows...", iindexRows.length);
  const legacies = iindexRows.map((f) => {
    (f as any).legacy = true;
    return f;
  });
  await wwDAL.iindexDao.insertBatch(legacies);
}
