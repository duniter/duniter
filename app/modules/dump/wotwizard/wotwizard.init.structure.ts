import {Directory} from "../../../lib/system/directory"
import {IdentityDAL} from "../../../lib/dal/sqliteDAL/IdentityDAL"
import {MembershipDAL} from "../../../lib/dal/sqliteDAL/MembershipDAL"
import {CertDAL} from "../../../lib/dal/sqliteDAL/CertDAL"
import {BlockDAL} from "../../../lib/dal/sqliteDAL/BlockDAL"
import {IIndexDAL} from "../../../lib/dal/sqliteDAL/index/IIndexDAL"

export interface WotWizardDAL {
  idtyDao: IdentityDAL
  certDao: CertDAL
  msDao: MembershipDAL
  blockDao: BlockDAL
  iindexDao: IIndexDAL
}

export async function createExportStructure(dbName: string): Promise<WotWizardDAL> {
  const driver = await Directory.getHomeDB(false, dbName)

  // DAOs
  const idtyDao = new IdentityDAL(driver)
  const certDao = new CertDAL(driver)
  const msDao = new MembershipDAL(driver)
  const blockDao = new BlockDAL(driver)
  const iindexDao = new IIndexDAL(driver)

  // Create tables
  await idtyDao.init()
  await certDao.init()
  await msDao.init()
  await blockDao.init()
  await iindexDao.init()

  const data = await blockDao.query('SELECT COUNT(*) as count FROM block')
  const blocksCount = parseInt(String((data[0] as any).count))

  // If first DB initialization
  if (blocksCount === 0) {
    // Manual updates (which are normally present in MetaDAL)
    await idtyDao.exec('ALTER TABLE idty ADD COLUMN expired INTEGER NULL')
    await idtyDao.exec('ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL')
    await idtyDao.exec('ALTER TABLE idty ADD COLUMN removed BOOLEAN NULL DEFAULT 0')
    await certDao.exec('ALTER TABLE cert ADD COLUMN expired INTEGER NULL')
    await msDao.exec('ALTER TABLE membership ADD COLUMN expired INTEGER NULL')
  }

  return {
    idtyDao,
    certDao,
    msDao,
    blockDao,
    iindexDao,
  }
}
