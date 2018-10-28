import {Duplex} from 'stream'
import {
  AccountsGarbagingDAL,
  CindexEntry,
  FullSindexEntry,
  IindexEntry,
  Indexer,
  MindexEntry,
  SimpleUdEntryForWallet,
  SindexEntry
} from "../../../../../lib/indexer"
import {CurrencyConfDTO} from "../../../../../lib/dto/ConfDTO"
import {FileDAL} from "../../../../../lib/dal/fileDAL"
import {DuniterBlockchain} from "../../../../../lib/blockchain/DuniterBlockchain"
import {BlockDTO} from "../../../../../lib/dto/BlockDTO"
import {Underscore} from "../../../../../lib/common-libs/underscore"
import {MonitorExecutionTime} from "../../../../../lib/debug/MonitorExecutionTime"
import {WoTBInstance, WoTBObject} from "../../../../../lib/wot"
import {NewLogger} from "../../../../../lib/logger"
import {CommonConstants} from "../../../../../lib/common-libs/constants"
import {DBBlock} from "../../../../../lib/db/DBBlock"
import {AbstractSynchronizer} from "../AbstractSynchronizer"
import {cliprogram} from "../../../../../lib/common-libs/programOptions"
import {DBHead} from "../../../../../lib/db/DBHead"
import {Watcher} from "../Watcher"
import {LokiDividend} from "../../../../../lib/dal/indexDAL/loki/LokiDividend"
import {DataErrors} from "../../../../../lib/common-libs/errors"
import {ProtocolIndexesStream} from "./ProtocolIndexesStream"

const constants = require('../../constants')
const loki = require('lokijs')

let sync_expires: number[] = []
let sync_bindex: any [] = []
let sync_iindex: any[] = []
let sync_mindex: any[] = []
let sync_cindex: any[] = []
let sync_nextExpiring = 0
let sync_bindexSize = 0

const sync_memoryWallets: any = {}
const sync_memoryDAL:AccountsGarbagingDAL = {
  getWallet: (conditions: string) => Promise.resolve(sync_memoryWallets[conditions] || { conditions, balance: 0 }),
  saveWallet: async (wallet: any) => {
    // Make a copy
    sync_memoryWallets[wallet.conditions] = {
      conditions: wallet.conditions,
      balance: wallet.balance
    }
  },
  sindexDAL: {
    getAvailableForConditions: (conditions:string) => Promise.resolve([])
  }
}

export interface GDataProtocolIndexesStream {
  mindex: MindexEntry[]
  iindex: IindexEntry[]
  sindex: SindexEntry[]
  cindex: CindexEntry[]
}

interface GindexData {
  block: BlockDTO
  head: DBHead
  lindex: GDataProtocolIndexesStream
  gindex: GDataProtocolIndexesStream
}

export class GlobalIndexStream extends Duplex {

  private sync_currConf: CurrencyConfDTO;

  private wotbMem: WoTBInstance = WoTBObject.memoryInstance()

  private mindexLokiInjection: Promise<void>

  private currentChunkNumber = 0
  private numberOfChunksToDownload:number
  private memToCopyDone = false

  private mapInjection: { [k: string]: any } = {}

  constructor(private conf: any,
              private dal:FileDAL,
              private to: number,
              private localNumber:number,
              private syncStrategy: AbstractSynchronizer,
              private watcher:Watcher,
    ) {
    super({ objectMode: true })
    this.wotbMem = dal.wotb
    const nbBlocksToDownload = Math.max(0, to - localNumber)
    this.numberOfChunksToDownload = Math.ceil(nbBlocksToDownload / syncStrategy.chunkSize)

    this.readChunk(this.currentChunkNumber)

    sync_memoryDAL.sindexDAL = {
      getAvailableForConditions: (conditions:string) => this.dal.sindexDAL.getAvailableForConditions(conditions)
    }

    this.mindexLokiInjection = (async () => {
      await this.injectLoki(this.dal, 'dividendDAL', new LokiDividend(new loki())) // TODO
    })()
  }

  private async injectLoki<T, K extends keyof T>(dal: T, f: K, obj: T[K]) {
    this.mapInjection[f] = dal[f]
    dal[f] = obj
    await (obj as any).triggerInit()
  }

  readChunk(i: number) {
  }

  _read(size: number) {
    this.push(null)
  }

  _write(dataArray: ProtocolIndexesStream[]|undefined, encoding: any, callback: (err: any) => void) {

    (async () => {

      await this.mindexLokiInjection

      if (!dataArray) {
        return callback(null)
      }

      await this.transform(dataArray)
      this.watcher.appliedPercent(Math.round(dataArray[0].block.number / 250 / this.numberOfChunksToDownload * 100))
      callback(null)

    })()
  }

  /**
   * Interpretes a chunk of blocks, and return the generated INDEX entries for eventual backup
   * @param {ProtocolIndexesStream[]} dataArray
   * @returns {Promise<GindexData[]>}
   */
  @MonitorExecutionTime()
  private async transform(dataArray:ProtocolIndexesStream[]): Promise<GindexData[]> {

    await this.beforeBlocks(dataArray.map(d => d.block))

    const gindex: GindexData[] = []

    for (const data of dataArray) {

      const block = data.block

      const gData: GindexData = {
        lindex: {
          mindex: data.mindex.slice(),
          iindex: data.iindex.slice(),
          sindex: data.sindex.slice(),
          cindex: data.cindex.slice(),
        },
        gindex: {
          mindex: [],
          iindex: [],
          sindex: [],
          cindex: [],
        },
        block,
        head: null as any,
      }

      // VERY FIRST: parameters, otherwise we compute wrong variables such as UDTime
      if (block.number == 0) {
        this.sync_currConf = BlockDTO.getConf(block)
        await DuniterBlockchain.saveParametersForRoot(block, this.conf, this.dal)
      }

      if (block.number <= this.to - this.conf.forksize || cliprogram.noSources) { // If we require nosources option, this blockchain can't be valid so we don't make checks

        const HEAD = await Indexer.quickCompleteGlobalScope(block, this.sync_currConf, sync_bindex, data.iindex, data.mindex, data.cindex, this.dal)
        sync_bindex.push(HEAD)

        // GINDEX
        gData.head = HEAD

        // Remember expiration dates
        for (const entry of data.cindex) {
          if (entry.expires_on) {
            sync_expires.push(entry.expires_on)
          }
        }
        for (const entry of data.mindex) {
          if (entry.expires_on) {
            sync_expires.push(entry.expires_on)
          }
        }
        for (const entry of data.mindex) {
          if (entry.revokes_on) {
            sync_expires.push(entry.revokes_on)
          }
        }

        if (data.iindex.length) {
          await DuniterBlockchain.createNewcomers(data.iindex, this.dal, NewLogger(), this.wotbMem)
        }

        if ((block.dividend && !cliprogram.noSources)
          || block.joiners.length
          || block.actives.length
          || block.revoked.length
          || block.excluded.length
          || block.certifications.length
          || (block.transactions.length && !cliprogram.noSources)
          || block.medianTime >= sync_nextExpiring) {

          const nextExpiringChanged = block.medianTime >= sync_nextExpiring

          for (let i = 0; i < sync_expires.length; i++) {
            let expire = sync_expires[i];
            if (block.medianTime >= expire) {
              sync_expires.splice(i, 1);
              i--;
            }
          }
          sync_nextExpiring = sync_expires.reduce((max, value) => max ? Math.min(max, value) : value, 9007199254740991); // Far far away date

          if (!cliprogram.noSources) {

            if (data.sindex.length) {
              await this.blockFillTxSourcesConditions(data.sindex)
            }

            // Dividends and account garbaging
            let dividends: SimpleUdEntryForWallet[] = []
            if (HEAD.new_dividend) {
              dividends = await Indexer.ruleIndexGenDividend(HEAD, data.iindex, this.dal)
            } else {
              for (const newcomer of data.iindex) {
                await this.dal.dividendDAL.createMember(newcomer.pub)
              }
            }

            if (block.transactions.length) {
              data.sindex = data.sindex.concat(await Indexer.ruleIndexGarbageSmallAccounts(HEAD, data.sindex, dividends, sync_memoryDAL));
            }

            if (data.sindex.length) {
              gData.gindex.sindex = data.sindex
              await this.flushSindex(data.sindex)
            }
            if (data.sindex.length || dividends.length) {
              await DuniterBlockchain.updateWallets(data.sindex, dividends, sync_memoryDAL, false, block.number)
            }
          }

          if (data.mindex.length || data.iindex.length || data.cindex.length) {
            await this.flushMicIndexes(data.mindex, data.iindex, data.cindex)
          }

          if (nextExpiringChanged) {
            sync_cindex = sync_cindex.concat(await Indexer.ruleIndexGenCertificationExpiry(HEAD, this.dal));
            sync_mindex = sync_mindex.concat(await Indexer.ruleIndexGenMembershipExpiry(HEAD, this.dal));
            sync_iindex = sync_iindex.concat(await Indexer.ruleIndexGenExclusionByMembership(HEAD, sync_mindex, this.dal));
            sync_iindex = sync_iindex.concat(await Indexer.ruleIndexGenExclusionByCertificatons(HEAD, sync_cindex, data.iindex, this.conf, this.dal));
            sync_mindex = sync_mindex.concat(await Indexer.ruleIndexGenImplicitRevocation(HEAD, this.dal));
          }

          if (sync_mindex.length || sync_iindex.length || sync_cindex.length) {
            // Flush the INDEX again (needs to be done *before* the update of wotb links because of block#0)
            await this.dal.flushIndexes({
              mindex: sync_mindex,
              iindex: sync_iindex,
              sindex: [],
              cindex: sync_cindex,
            })
          }

          if (data.cindex.length) {
            await this.updateWotbLinks(data.cindex)
          }
          gData.gindex.iindex = sync_iindex
          gData.gindex.mindex = sync_mindex
          gData.gindex.cindex = sync_cindex
          sync_iindex = [];
          sync_mindex = [];
          sync_cindex = [];

          // TODO GINDEX
          if (block.joiners.length || block.revoked.length || block.excluded.length) {
            await this.updateMembers(block)
          }

        } else {
          // Concat the results to the pending data
          sync_iindex = sync_iindex.concat(data.iindex);
          sync_cindex = sync_cindex.concat(data.cindex);
          sync_mindex = sync_mindex.concat(data.mindex);
          gData.gindex.iindex = data.iindex
          gData.gindex.cindex = data.cindex
          gData.gindex.mindex = data.mindex
        }

        // Trim the bindex
        sync_bindexSize = this.conf.forksize + [
          block.issuersCount,
          block.issuersFrame,
          this.conf.medianTimeBlocks,
          this.conf.dtDiffEval,
          dataArray.length
        ].reduce((max, value) => {
          return Math.max(max, value);
        }, 0);

        if (sync_bindexSize && sync_bindex.length >= 2 * sync_bindexSize) {
          // We trim it, not necessary to store it all (we already store the full blocks)
          sync_bindex.splice(0, sync_bindexSize);
          // TODO GINDEX
          await this.doTrimming()
        }
      } else if (block.number <= this.to) {
        const dto = BlockDTO.fromJSONObject(block)
        await this.finalizeSync(block, dto)
      }

      gindex.push(gData)
    }
    return gindex
  }

  @MonitorExecutionTime()
  private async beforeBlocks(blocks:BlockDTO[]) {
    await this.dal.blockDAL.insertBatch(blocks.map(b => {
      const block = DBBlock.fromBlockDTO(b)
      block.fork = false
      return block
    }))

    // We only keep approx 2 months of blocks in memory, so memory consumption keeps approximately constant during the sync
    await this.dal.blockDAL.trimBlocks(blocks[blocks.length - 1].number - CommonConstants.BLOCKS_IN_MEMORY_MAX)
  }

  @MonitorExecutionTime()
  private async flushSindex(local_sindex: SindexEntry[]) {
    await this.dal.flushIndexes({
      mindex: [],
      iindex: [],
      cindex: [],
      sindex: local_sindex,
    })
  }

  @MonitorExecutionTime()
  private async flushMicIndexes(local_mindex: MindexEntry[], local_iindex: IindexEntry[], local_cindex: CindexEntry[]) {
    // Flush the INDEX (not bindex, which is particular)
    await this.dal.flushIndexes({
      mindex: sync_mindex,
      iindex: sync_iindex,
      sindex: [],
      cindex: sync_cindex,
    })
    sync_iindex = local_iindex
    sync_cindex = local_cindex
    sync_mindex = local_mindex
  }

  @MonitorExecutionTime()
  private async blockFillTxSourcesConditions(local_sindex: any[] | SindexEntry[]) {
    // Fills in correctly the SINDEX
    await Promise.all(Underscore.where(local_sindex, {op: 'UPDATE'}).map(async entry => {
      if (!entry.conditions) {
        if (entry.srcType === 'D') {
          entry.conditions = 'SIG(' + entry.identifier + ')'
        } else {
          const src = (await this.dal.getSource(entry.identifier, entry.pos, false)) as FullSindexEntry
          entry.conditions = src.conditions
        }
      }
    }))
  }

  @MonitorExecutionTime()
  private async updateWotbLinks(links: CindexEntry[]) {
    // --> Update links
    await this.dal.updateWotbLinks(links, this.wotbMem)
  }

  @MonitorExecutionTime()
  private async updateMembers(block: BlockDTO) {
    // Create/Update nodes in wotb
    await DuniterBlockchain.updateMembers(block, this.dal, this.wotbMem)
  }

  @MonitorExecutionTime()
  private async doTrimming() {
    // Process triming & archiving continuously to avoid super long ending of sync
    await this.dal.trimIndexes(sync_bindex[0].number);
  }

  @MonitorExecutionTime()
  private async finalizeSync(block: BlockDTO, dto: BlockDTO) {
    // Save the INDEX
    await this.dal.bindexDAL.insertBatch(sync_bindex);
    await this.dal.flushIndexes({
      mindex: sync_mindex,
      iindex: sync_iindex,
      sindex: [],
      cindex: sync_cindex,
    })

    if (!this.memToCopyDone) {

      // Save the intermediary table of wallets
      const conditions = Underscore.keys(sync_memoryWallets)
      const nonEmptyKeys = Underscore.filter(conditions, (k: any) => sync_memoryWallets[k] && sync_memoryWallets[k].balance > 0)
      const walletsToRecord = nonEmptyKeys.map((k: any) => sync_memoryWallets[k])
      await this.dal.walletDAL.insertBatch(walletsToRecord)
      for (const cond of conditions) {
        delete sync_memoryWallets[cond]
      }

      NewLogger().info('Mem2File [wotb]...')
      // Persist the memory wotb
      this.wotbMem.fileCopy(this.dal.wotb.filePath)
      const that = this
      async function inject<T, K extends keyof T, R, S extends T[K]>(fileDal: T, field: K, getRows: () => Promise<R[]>) {
        const dao = that.mapInjection[field]
        if (dao) {
          NewLogger().info(`Mem2File [${field}]...`)
          const rows = await getRows()
          await (dao as any).insertBatch(rows) // TODO : "any" complicated to remove
          fileDal[field] = dao
        }
        else {
          throw Error(DataErrors[DataErrors.SYNC_FAST_MEM_ERROR_DURING_INJECTION])
        }
      }

      await inject(this.dal, 'dividendDAL',
        () => this.dal.dividendDAL.listAll())

      this.memToCopyDone = true
    }

    if (block.number === 0) {
      await DuniterBlockchain.saveParametersForRoot(block, this.conf, this.dal)
    }

    // Last block: cautious mode to trigger all the INDEX expiry mechanisms
    const { index, HEAD } = await DuniterBlockchain.checkBlock(dto, constants.WITH_SIGNATURES_AND_POW, this.conf, this.dal)
    await DuniterBlockchain.pushTheBlock(dto, index, HEAD, this.conf, this.dal, NewLogger())

    // Clean temporary variables
    sync_bindex = [];
    sync_iindex = [];
    sync_mindex = [];
    sync_cindex = [];
    sync_bindexSize = 0;
    sync_expires = [];
    sync_nextExpiring = 0;
  }

}
