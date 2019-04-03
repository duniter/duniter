import * as fs from "fs"
import {Server} from "../../../../server"
import {createExportStructure} from "./wotwizard.init.structure"
import {WotWizardConstants} from "./wotwizard.constants"
import {addLegacyBlocks} from "./wotwizard.legacy.blocks"
import {addNewBlocks} from "./wotwizard.new.blocks"
import {deleteNonLegacy} from "./wotwizard.delete"
import {copyMemPool} from "./wotwizard.copy.mempool"
import {Directory} from "../../../lib/system/directory"

export async function dumpWotWizard(server: Server) {

  // 1. Create dump structure if it does not exist
  const wwDAL = await createExportStructure(WotWizardConstants.DB_NAME_0)

  // 2. Integrate legacy blocks (= non-forkable)
  await addLegacyBlocks(server, wwDAL)

  // 3. Delete non-legacy data
  await deleteNonLegacy(wwDAL)

  // 4. Integrate new blocks (= forkable)
  await addNewBlocks(server, wwDAL)

  // 5. Copy mempool
  await copyMemPool(server, wwDAL)

  // 6. Close SQL connections
  await Promise.all([
    wwDAL.blockDao,
    wwDAL.iindexDao,
    wwDAL.idtyDao,
    wwDAL.certDao,
    wwDAL.msDao,
  ].map(dao => dao.close()))

  // 7. Copy
  let lastCopyIsOldEnough = false
  const updatingFile = Directory.GET_FILE_PATH(WotWizardConstants.FILE_UPDATING)
  if (fs.existsSync(updatingFile)) {
    const content = parseInt(fs.readFileSync(updatingFile, 'utf8'))
    lastCopyIsOldEnough = Date.now() - content > WotWizardConstants.DELAY_FOR_UPDATING
  } else {
    // Never done
    lastCopyIsOldEnough = true
  }
  if (lastCopyIsOldEnough) {
    fs.copyFileSync(Directory.GET_FILE_PATH(WotWizardConstants.DB_NAME_0), Directory.GET_FILE_PATH(WotWizardConstants.DB_NAME))
    fs.writeFileSync(updatingFile, Date.now())
  }
}
