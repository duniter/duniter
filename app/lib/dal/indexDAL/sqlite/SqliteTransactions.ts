import { SQLiteDriver } from "../../drivers/SQLiteDriver";
import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { SqliteTable } from "./SqliteTable";
import {
  SqlNotNullableFieldDefinition,
  SqlNullableFieldDefinition,
} from "./SqlFieldDefinition";
import { DBTx } from "../../../db/DBTx";
import { TxsDAO } from "../abstract/TxsDAO";
import { SandBox } from "../../sqliteDAL/SandBox";
import { TransactionDTO } from "../../../dto/TransactionDTO";

const constants = require("../../../constants");

export class SqliteTransactions extends SqliteTable<DBTx> implements TxsDAO {
  constructor(getSqliteDB: (dbName: string) => Promise<SQLiteDriver>) {
    super(
      "txs",
      {
        hash: new SqlNotNullableFieldDefinition("VARCHAR", true, 70),
        block_number: new SqlNullableFieldDefinition("INT", true),
        locktime: new SqlNullableFieldDefinition("INT", false),
        version: new SqlNullableFieldDefinition("INT", false),
        currency: new SqlNullableFieldDefinition("VARCHAR", false, 10),
        comment: new SqlNullableFieldDefinition("TEXT", false),
        blockstamp: new SqlNullableFieldDefinition("VARCHAR", false, 100),
        blockstampTime: new SqlNullableFieldDefinition("INT", false),
        time: new SqlNullableFieldDefinition("INT", false),
        inputs: new SqlNullableFieldDefinition("JSON", false),
        unlocks: new SqlNullableFieldDefinition("JSON", false),
        outputs: new SqlNullableFieldDefinition("JSON", false),
        issuer: new SqlNullableFieldDefinition("VARCHAR", true, 50), /* computed column - need by getTxHistoryXxx() */
        issuers: new SqlNullableFieldDefinition("JSON", false),
        signatures: new SqlNullableFieldDefinition("JSON", false),
        recipient: new SqlNullableFieldDefinition("VARCHAR", true, 50), /* computed column - need by getTxHistoryXxx() */
        recipients: new SqlNullableFieldDefinition("JSON", false),
        written: new SqlNotNullableFieldDefinition("BOOLEAN", true),
        removed: new SqlNotNullableFieldDefinition("BOOLEAN", true),
        received: new SqlNullableFieldDefinition("BOOLEAN", false),
        output_base: new SqlNullableFieldDefinition("INT", false),
        output_amount: new SqlNullableFieldDefinition("INT", false),
        written_on: new SqlNullableFieldDefinition("VARCHAR", false, 100),
        writtenOn: new SqlNullableFieldDefinition("INT", false),
      },
      getSqliteDB
    );
    this.sandbox = new SandBox(
      constants.SANDBOX_SIZE_TRANSACTIONS,
      () => this.getSandboxTxs(),
      (
        compared: {
          issuers: string[];
          output_base: number;
          output_amount: number;
        },
        reference: {
          issuers: string[];
          output_base: number;
          output_amount: number;
        }
      ) => {
        if (compared.output_base < reference.output_base) {
          return -1;
        } else if (compared.output_base > reference.output_base) {
          return 1;
        } else if (compared.output_amount > reference.output_amount) {
          return -1;
        } else if (compared.output_amount < reference.output_amount) {
          return 1;
        } else {
          return 0;
        }
      }
    );
  }

  /**
   * TECHNICAL
   */

  @MonitorExecutionTime()
  async insert(record: DBTx): Promise<void> {
    this.onBeforeInsert(record);
    await this.insertInTable(this.driver, record);
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBTx[]): Promise<void> {
    if (records.length) {
      records.forEach(r => this.onBeforeInsert(r));
      return this.insertBatchInTable(this.driver, records);
    }
  }

  onBeforeInsert(dbTx: DBTx) {
    // Compute unique issuer/recipient (need to improve tx history)
    dbTx.issuer = (dbTx.issuers.length === 1) ? dbTx.issuers[0] : null;
    const recipients = !dbTx.issuer ? dbTx.recipients : dbTx.recipients.filter(r => r !== dbTx.issuer);
    dbTx.recipient = (recipients.length === 1) ? recipients[0] : null;
  }

  sandbox: SandBox<{
    issuers: string[];
    output_base: number;
    output_amount: number;
  }>;

  async addLinked(
    tx: TransactionDTO,
    block_number: number,
    time: number
  ): Promise<DBTx> {
    const exists = await this.existsByHash(tx.hash);
    const theDBTx = DBTx.fromTransactionDTO(tx);
    theDBTx.written = true;
    theDBTx.block_number = block_number;
    theDBTx.time = time;
    if (!exists) {
      await this.insert(theDBTx);
    } else {
      await this.update(
        this.driver,
        theDBTx,
        ["block_number", "time", "received", "written", "removed", "hash"],
        ["hash"]
      );
    }
    return theDBTx;
  }

  async addPending(dbTx: DBTx): Promise<DBTx> {
    const existing = (
      await this.findEntities("SELECT * FROM txs WHERE hash = ?", [dbTx.hash])
    )[0];
    if (existing) {
      await this.driver.sqlWrite("UPDATE txs SET written = ? WHERE hash = ?", [
        false,
        dbTx.hash,
      ]);
      return existing;
    }
    await this.insert(dbTx);
    return dbTx;
  }

  cleanCache(): void {}

  findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<DBTx[]> {
    throw Error(
      "Should not be used method findRawWithOrder() on SqliteTransactions"
    );
  }

  getAllPending(versionMin: number): Promise<DBTx[]> {
    return this.findEntities("SELECT * FROM txs WHERE NOT written", []);
  }

  async getTxHistoryByPubkey(pubkey: string) {
    return {
      sent: await this.getLinkedWithIssuer(pubkey),
      received: await this.getLinkedWithRecipient(pubkey),
      sending: await this.getPendingWithIssuer(pubkey),
      pending: await this.getPendingWithRecipient(pubkey),
    };
  }

  async getTxHistoryByPubkeyBetweenBlocks(
    pubkey: string,
    from: number,
    to: number
  ): Promise<{ sent: DBTx[]; received: DBTx[] }> {
    return {
      sent: await this.getLinkedWithIssuerByRange('block_number', pubkey, from, to),
      received: await this.getLinkedWithRecipientByRange('block_number', pubkey, from, to),
    };
  }

  async getTxHistoryByPubkeyBetweenTimes(
    pubkey: string,
    from: number,
    to: number
  ): Promise<{ sent: DBTx[]; received: DBTx[] }> {
    return {
      sent: await this.getLinkedWithIssuerByRange('blockstampTime', pubkey, from, to),
      received: await this.getLinkedWithRecipientByRange('blockstampTime', pubkey, from, to)
    };
  }

  async getTxHistoryMempool(
    pubkey: string
  ): Promise<{ sending: DBTx[]; pending: DBTx[] }> {
    return {
      sending: await this.getPendingWithIssuer(pubkey),
      pending: await this.getPendingWithRecipient(pubkey),
    };
  }

  getLinkedWithIssuer(pubkey: string): Promise<DBTx[]> {
    return this.findEntities(`SELECT * FROM txs 
        WHERE written 
        AND (
            issuer = ?
            OR (issuer IS NULL AND issuers LIKE ?)
          )`,
      [pubkey, `%${pubkey}%`]
    );
  }

  getLinkedWithIssuerByRange(rangeFieldName: keyof DBTx, pubkey: string, from: number, to: number): Promise<DBTx[]> {
    return this.findEntities(`SELECT * FROM txs 
        WHERE written 
        AND (
          issuer = ?
          OR (issuer IS NULL AND issuers LIKE ?)            
        )
        AND ${rangeFieldName} >= ? 
        AND ${rangeFieldName} <= ?`,
        [pubkey, `%${pubkey}%`, from, to]
    );
  }

  getLinkedWithRecipient(pubkey: string): Promise<DBTx[]> {
    return this.findEntities(`SELECT * FROM txs 
        WHERE written 
        AND (
            recipient = ?
            OR (recipient IS NULL AND issuer <> ? AND recipients LIKE ? )
        )`,
      [pubkey, pubkey, `%${pubkey}%`]
    );
  }

  getLinkedWithRecipientByRange(rangeColumnName: string, pubkey: string, from: number, to: number): Promise<DBTx[]> {
    return this.findEntities(`SELECT * FROM txs 
        WHERE written 
        AND (
            recipient = ?
            OR (recipient IS NULL AND issuer <> ? AND recipients LIKE ? )            
        )
        AND ${rangeColumnName} >= ? 
        AND ${rangeColumnName} <= ?`,
        [pubkey, pubkey, `%${pubkey}%`, from, to]
    );
  }

  getPendingWithIssuer(pubkey: string): Promise<DBTx[]> {
    return this.findEntities(`SELECT * FROM txs 
        WHERE NOT written
        AND (
            issuer = ? 
            OR (issuer IS NULL AND issuers LIKE ?)
        )`,
      [pubkey, `%${pubkey}%`]
    );
  }

  getPendingWithRecipient(pubkey: string): Promise<DBTx[]> {
    return this.findEntities(`SELECT * FROM txs 
        WHERE NOT written 
        AND (
            recipient = ?
            OR (recipient IS NULL AND issuer <> ? AND recipients LIKE ?)
        ) `,
      [pubkey, pubkey, `%${pubkey}%`]
    );
  }

  async existsByHash(hash: string): Promise<boolean> {
    return (await this.countBy('hash', hash)) > 0;
  }

  async getTX(hash: string): Promise<DBTx> {
    return (
      await this.findEntities("SELECT * FROM txs WHERE hash = ?", [hash])
    )[0];
  }

  getWrittenOn(blockstamp: string): Promise<DBTx[]> {
    return this.findEntities("SELECT * FROM txs WHERE blockstamp = ?", [
      blockstamp,
    ]);
  }

  async removeAll(): Promise<void> {
    await this.driver.sqlWrite("DELETE FROM txs", []);
  }

  removeBlock(blockstamp: string): Promise<void> {
    throw Error(
      "Should not be used method removeBlock() on SqliteTransactions"
    );
  }

  removeTX(hash: string): Promise<void> {
    return this.driver.sqlWrite("DELETE FROM txs WHERE hash = ?", [hash]);
  }

  triggerInit(): void {}

  trimExpiredNonWrittenTxs(limitTime: number): Promise<void> {
    return this.driver.sqlWrite(
      "DELETE FROM txs WHERE NOT written AND blockstampTime <= ?",
      [limitTime]
    );
  }

  /**************************
   * SANDBOX STUFF
   */

  @MonitorExecutionTime()
  async getSandboxTxs() {
    return this.findEntities(
      "SELECT * FROM txs WHERE NOT written AND NOT removed ORDER BY output_base DESC, output_amount DESC",
      []
    );
  }

  getSandboxRoom() {
    return this.sandbox.getSandboxRoom();
  }

  setSandboxSize(maxSize: number) {
    this.sandbox.maxSize = maxSize;
  }
}
