import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {SqliteTable} from "./SqliteTable"
import {SqlNullableFieldDefinition} from "./SqlFieldDefinition"
import {DBPeer} from "../../../db/DBPeer"
import {PeerDAO} from "../abstract/PeerDAO"

export class SqlitePeers extends SqliteTable<DBPeer> implements PeerDAO {

  constructor(getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>) {
    super(
      'peers',
      {
        'version':        new SqlNullableFieldDefinition('INT', false),
        'currency':       new SqlNullableFieldDefinition('VARCHAR', false, 100),
        'status':         new SqlNullableFieldDefinition('VARCHAR', true, 10),
        'statusTS':       new SqlNullableFieldDefinition('INT', false),
        'hash':           new SqlNullableFieldDefinition('VARCHAR', false, 70),
        'first_down':     new SqlNullableFieldDefinition('INT', false),
        'last_try':       new SqlNullableFieldDefinition('INT', true),
        'lastContact':    new SqlNullableFieldDefinition('INT', false),
        'pubkey':         new SqlNullableFieldDefinition('VARCHAR', true, 50),
        'block':          new SqlNullableFieldDefinition('VARCHAR', false, 100),
        'signature':      new SqlNullableFieldDefinition('VARCHAR', false, 100),
        'endpoints':      new SqlNullableFieldDefinition('JSON', true),
        'raw':            new SqlNullableFieldDefinition('TEXT', false),
        'nonWoT':         new SqlNullableFieldDefinition('BOOLEAN', false),
      },
      getSqliteDB
    )
  }

  /**
   * TECHNICAL
   */

  @MonitorExecutionTime()
  async insert(record: DBPeer): Promise<void> {
    await this.insertInTable(this.driver, record)
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBPeer[]): Promise<void> {
    if (records.length) {
      return this.insertBatchInTable(this.driver, records)
    }
  }

  cleanCache(): void {
  }

  async countNonWoTPeers(): Promise<number> {
    return ((await this.driver.sqlRead('SELECT COUNT(*) as _count FROM peers WHERE nonWoT', []))[0] as any)['_count']
  }

  deleteNonWotPeersWhoseLastContactIsAbove(threshold: number): Promise<void> {
    return this.driver.sqlWrite('DELETE FROM peers WHERE (nonWoT OR nonWoT IS NULL) AND lastContact <= ?', [threshold])
  }

  async getPeer(pubkey: string): Promise<DBPeer> {
    return (await this.findEntities('SELECT * FROM peers WHERE pubkey = ?', [pubkey]))[0]
  }

  getPeersWithEndpointsLike(ep: string): Promise<DBPeer[]> {
    return this.findEntities('SELECT * FROM peers WHERE endpoints LIKE ?', [`%${ep}%`])
  }

  listAll(): Promise<DBPeer[]> {
    return this.findEntities('SELECT * FROM peers', [])
  }

  removeAll(): Promise<void> {
    return this.driver.sqlWrite('DELETE FROM peers', [])
  }

  removePeerByPubkey(pubkey: string): Promise<void> {
    return this.driver.sqlWrite('DELETE FROM peers WHERE pubkey = ?', [pubkey])
  }

  async savePeer(peer: DBPeer): Promise<DBPeer> {
    await this.driver.sqlWrite('DELETE FROM peers WHERE pubkey = ?', [peer.pubkey])
    await this.insert(peer)
    return peer
  }

  triggerInit(): void {
  }

  withUPStatus(): Promise<DBPeer[]> {
    return this.findEntities('SELECT * FROM peers WHERE status = ?', ['UP'])
  }
}
