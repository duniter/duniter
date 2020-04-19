import { WotWizardDAL } from "./wotwizard.init.structure";

export async function deleteNonLegacy(wwDAL: WotWizardDAL) {
  await wwDAL.iindexDao.exec("DELETE FROM i_index WHERE NOT legacy");
  await wwDAL.blockDao.exec("DELETE FROM block WHERE NOT legacy");
  await wwDAL.idtyDao.sqlDeleteAll();
  await wwDAL.certDao.sqlDeleteAll();
  await wwDAL.msDao.sqlDeleteAll();
}
