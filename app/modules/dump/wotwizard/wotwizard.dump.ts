import {Server} from "../../../../server"
import {createExportStructure} from "./wotwizard.init.structure"
import {WotWizardConstants} from "./wotwizard.constants"
import {addLegacyBlocks} from "./wotwizard.legacy.blocks"
import {addNewBlocks} from "./wotwizard.new.blocks"
import {deleteNonLegacy} from "./wotwizard.delete"
import {copyMemPool} from "./wotwizard.copy.mempool"
import {requiredBlocksAccumulator} from "./hooks/wotwizard.block.insert"

export async function dumpWotWizard(server: Server) {

  // 1. Create dump structure if it does not exist
  const wwDAL = await createExportStructure(WotWizardConstants.DB_NAME)

  // Prepare accumulator for blocks with data refering blocks
  const accumulator = requiredBlocksAccumulator(server, wwDAL)

  // 2. Integrate legacy blocks (= non-forkable)
  await addLegacyBlocks(server, wwDAL, accumulator)

  // 3. Delete non-legacy data
  await deleteNonLegacy(wwDAL)

  // 4. Integrate new blocks (= forkable)
  await addNewBlocks(server, wwDAL, accumulator)

  // 5. Copy mempool
  await copyMemPool(server, wwDAL, accumulator)

  // 6. Persist blocks referenced by a wot data (identities, certifications, memberships)
  await accumulator.persist()
}
