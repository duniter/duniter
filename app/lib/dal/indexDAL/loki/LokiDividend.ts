import {LokiIndex} from "./LokiIndex"
import {DividendDAO, DividendEntry, UDSource} from "../abstract/DividendDAO"
import {IindexEntry, SimpleTxInput, SimpleUdEntryForWallet, SindexEntry} from "../../../indexer"
import {DataErrors} from "../../../common-libs/errors"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {DividendDaoHandler} from "../common/DividendDaoHandler"

export class LokiDividend extends LokiIndex<DividendEntry> implements DividendDAO {

  constructor(loki:any) {
    super(loki, 'dividend', ['pub'])
  }

  @MonitorExecutionTime()
  async createMember(pub: string): Promise<void> {
    const existing = this.collection.find({ pub })[0]
    if (!existing) {
      await this.insert(DividendDaoHandler.getNewDividendEntry(pub))
    } else {
      await this.setMember(true, pub)
    }
  }

  @MonitorExecutionTime()
  async setMember(member: boolean, pub: string) {
    await this.collection
      .chain()
      .find({ pub })
      .update(r => {
        r.member = member
      })
  }

  @MonitorExecutionTime()
  async deleteMember(pub: string): Promise<void> {
    this.collection
      .chain()
      .find({ pub })
      .remove()
  }

  @MonitorExecutionTime()
  async produceDividend(blockNumber: number, dividend: number, unitbase: number, local_iindex: IindexEntry[]): Promise<SimpleUdEntryForWallet[]> {
    const dividends: SimpleUdEntryForWallet[] = []
    // Then produce the UD
    this.collection
      .chain()
      .find({ member: true })
      .update(r => DividendDaoHandler.produceDividend(r, blockNumber, dividend, unitbase, dividends))
    return dividends
  }

  @MonitorExecutionTime()
  async consume(filter: SindexEntry[]): Promise<void> {
    for (const dividendToConsume of filter) {
      this.collection
        .chain()
        // We look at the dividends of this member
        .find({
          pub: dividendToConsume.identifier
        })
        // Then we try to consume the dividend being spent
        .update(m => DividendDaoHandler.consume(m, dividendToConsume))
    }
  }

  @MonitorExecutionTime()
  async getUDSources(pub: string): Promise<UDSource[]> {
    const member = this.collection
      .chain()
      .find({ pub })
      .data()[0]
    if (!member) {
      return []
    }
    return DividendDaoHandler.udSources(member)
  }

  @MonitorExecutionTime()
  async findUdSourceByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SimpleTxInput[]> {
    const member = this.collection.find({ pub: identifier })[0]
    return DividendDaoHandler.getUDSourceByIdPosAmountBase(member, identifier, pos, amount, base)
  }

  @MonitorExecutionTime()
  async getUDSource(identifier: string, pos: number): Promise<SimpleTxInput|null> {
    const member = this.collection.find({ pub: identifier })[0]
    return DividendDaoHandler.getUDSource(member, identifier, pos)
  }

  @MonitorExecutionTime()
  async getWrittenOn(blockstamp: string): Promise<DividendEntry[]> {
    throw Error(DataErrors[DataErrors.DIVIDEND_GET_WRITTEN_ON_SHOULD_NOT_BE_USED_DIVIDEND_DAO])
  }

  @MonitorExecutionTime()
  async getWrittenOnUDs(number: number): Promise<SimpleUdEntryForWallet[]> {
    const res: SimpleUdEntryForWallet[] = []
    this.collection
      .chain()
      .find({ availables: { $contains: number } })
      .data()
      .map(m => DividendDaoHandler.getWrittenOnUDs(m, number, res))
    return res
  }

  @MonitorExecutionTime()
  async removeBlock(blockstamp: string): Promise<void> {
    throw Error(DataErrors[DataErrors.DIVIDEND_REMOVE_BLOCK_SHOULD_NOT_BE_USED_BY_DIVIDEND_DAO])
  }

  /**
   * Remove UD data produced in a block, either UD production or UD consumption.
   * @param {number} number Block number to revert the created UDs.
   * @returns {Promise<{createdUDsDestroyedByRevert: SimpleUdEntryForWallet[]}>}
   */
  @MonitorExecutionTime()
  async revertUDs(number: number): Promise<{
    createdUDsDestroyedByRevert: SimpleUdEntryForWallet[]
    consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[]
  }> {
    const createdUDsDestroyedByRevert: SimpleUdEntryForWallet[] = []
    const consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[] = []
    // Remove produced dividends at this block
    this.collection
      .chain()
      .find({ availables: { $contains: number }})
      .update(m => DividendDaoHandler.removeDividendsProduced(m, number, createdUDsDestroyedByRevert))
    // Unconsumed dividends consumed at this block
    this.collection
      .chain()
      .find({ consumed: { $contains: number }})
      .update(m => DividendDaoHandler.unconsumeDividends(m, number, consumedUDsRecoveredByRevert))
    return {
      createdUDsDestroyedByRevert,
      consumedUDsRecoveredByRevert,
    }
  }

  @MonitorExecutionTime()
  async findForDump(criterion: any): Promise<SindexEntry[]> {
    return DividendDaoHandler.toDump(await this.findRaw(criterion))
  }

  @MonitorExecutionTime()
  async trimConsumedUDs(belowNumber: number): Promise<void> {
    // Remove dividends consumed before `belowNumber`
    this.collection
      .chain()
      .find({})
      .update(m => DividendDaoHandler.trimConsumed(m, belowNumber))
  }

  async listAll(): Promise<DividendEntry[]> {
    return this.collection.find({})
  }
}
