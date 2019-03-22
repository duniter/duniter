import {Server} from "../../../../server"
import {createExportStructure} from "./wotwizard.init.structure"
import {WotWizardConstants} from "./wotwizard.constants"
import {addLegacyBlocks} from "./wotwizard.legacy.blocks"
import {addNewBlocks} from "./wotwizard.new.blocks"
import {deleteNonLegacy} from "./wotwizard.delete"
import {copyMemPool} from "./wotwizard.copy.mempool"

export async function dumpWotWizard(server: Server) {

  // 1. Create dump structure if it does not exist
  const wwDAL = await createExportStructure(WotWizardConstants.DB_NAME)

  // 2. Integrate legacy blocks (= non-forkable)
  await addLegacyBlocks(server, wwDAL)

  // 3. Delete non-legacy data
  await deleteNonLegacy(wwDAL)

  // 4. Integrate new blocks (= forkable)
  await addNewBlocks(server, wwDAL)

  // 5. Copy mempool
  await copyMemPool(server, wwDAL)
}
