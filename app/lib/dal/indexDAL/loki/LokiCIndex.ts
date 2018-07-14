import {CIndexDAO} from "../abstract/CIndexDAO"
import {CindexEntry, FullCindexEntry, Indexer} from "../../../indexer"
import {CommonConstants} from "../../../common-libs/constants"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"
import {LokiProtocolIndex} from "./LokiProtocolIndex"

export class LokiCIndex extends LokiProtocolIndex<CindexEntry> implements CIndexDAO {

  constructor(loki:any) {
    super(loki, 'cindex', ['issuer', 'receiver'])
  }

  async existsNonReplayableLink(issuer: string, receiver: string): Promise<boolean> {
    return Indexer.DUP_HELPERS.reduce<CindexEntry>(
      this.collection
        .chain()
        .find({
          $and: [
            { issuer },
            { receiver },
          ]
        })
        .simplesort('writtenOn')
        .data()
    ).op === CommonConstants.IDX_CREATE
  }

  async findByIssuerAndChainableOnGt(issuer: string, medianTime: number): Promise<CindexEntry[]> {
    return this.collection
      .chain()
      .find({
        $and: [
          { issuer },
          { chainable_on: { $gt: medianTime } },
        ]
      })
      .simplesort('writtenOn')
      .data()
  }

  async findByIssuerAndReceiver(issuer: string, receiver: string): Promise<CindexEntry[]> {
    return this.collection
      .chain()
      .find({
        $and: [
          { issuer },
          { receiver },
        ]
      })
      .simplesort('writtenOn')
      .data()
  }

  async findByReceiverAndExpiredOn(pub: string, expired_on: number): Promise<CindexEntry[]> {
    return this.collection
      .chain()
      .find({
        $and: [
          { receiver: pub },
          { expired_on },
        ]
      })
      .simplesort('writtenOn')
      .data()
  }

  async findExpired(medianTime: number): Promise<CindexEntry[]> {
    return this.collection
      .chain()
      .find({ expires_on: { $lte: medianTime } })
      .simplesort('writtenOn')
      .data()
      .filter(c => {
        return this.collection
          .find({
            op: CommonConstants.IDX_UPDATE,
            issuer: c.issuer,
            receiver: c.receiver,
            created_on: c.created_on,
          })
          .length === 0
      })
  }

  async reducablesFrom(from: string): Promise<FullCindexEntry[]> {
    const reducables = this.collection
      .chain()
      .find({ issuer: from })
      .simplesort('writtenOn')
      .data()
    return Indexer.DUP_HELPERS.reduceBy(reducables, ['issuer', 'receiver', 'created_on'])
  }

  async getReceiversAbove(minsig: number): Promise<string[]> {
    const reduction = this.collection
      .find({})
      .reduce((map:any, c) => {
        if (!map[c.receiver]) {
          map[c.receiver] = 0
        }
        map[c.receiver]++
        return map
      }, {})
    return Object.keys(reduction)
      .map(receiver => ({ receiver, count: reduction[receiver]}))
      .filter(o => o.count >= minsig)
      .map(o => o.receiver)
  }

  async getValidLinksFrom(issuer: string): Promise<CindexEntry[]> {
    return this.collection
      .find({ issuer })
      .filter(r => this.collection.find({ issuer: r.issuer, receiver: r.receiver, created_on: r.created_on, expired_on: { $gt: 0 } }).length === 0)
  }

  async getValidLinksTo(receiver: string): Promise<CindexEntry[]> {
    return this.collection
      .find({ receiver })
      .filter(r => this.collection.find({ issuer: r.issuer, receiver: r.receiver, created_on: r.created_on, expired_on: { $gt: 0 } }).length === 0)
  }

  @MonitorLokiExecutionTime(true)
  async trimExpiredCerts(belowNumber: number): Promise<void> {
    const expired = this.collection.find({
      $and: [
        { expired_on: { $gt: 0 }},
        { writtenOn: { $lt: belowNumber }},
      ]
    })
    for (const e of expired) {
      this.collection
        .chain()
        .find({
          issuer: e.issuer,
          receiver: e.receiver,
          created_on: e.created_on
        })
        .remove()
    }
  }

  /**
   * For CINDEX, trimming records <=> removing the expired certs
   * @param {number} belowNumber Number below which an expired certification must be removed.
   * @returns {Promise<void>}
   */
  async trimRecords(belowNumber: number): Promise<void> {
    return this.trimExpiredCerts(belowNumber)
  }

  private reduced(issuer:string, receiver:string, created_on:number): FullCindexEntry {
    return Indexer.DUP_HELPERS.reduce(this.reducable(issuer, receiver, created_on))
  }

  private reducable(issuer:string, receiver:string, created_on:number): CindexEntry[] {
    return this.collection.chain()
      .find({ issuer, receiver, created_on })
      .simplesort('writtenOn')
      .data()
  }
}
