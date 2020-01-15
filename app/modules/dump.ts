// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {exec} from "child_process"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"
import {moment} from "../lib/common-libs/moment"
import {DBBlock} from "../lib/db/DBBlock"
import {FullIindexEntry, SindexEntry} from "../lib/indexer"
import {BlockDTO} from "../lib/dto/BlockDTO"
import {Underscore} from "../lib/common-libs/underscore"
import {dumpWotWizard} from "./dump/wotwizard/wotwizard.dump"
import {OtherConstants} from "../lib/other_constants"
import {Querable, querablep} from "../lib/common-libs/querable"
import {dumpBlocks, dumpForks} from "./dump/blocks/dump.blocks"
import {newResolveTimeoutPromise} from "../lib/common-libs/timeout-promise"
import {readFileSync} from "fs"
import {IdentityDTO} from "../lib/dto/IdentityDTO"
import {CertificationDTO, ShortCertificationDTO} from "../lib/dto/CertificationDTO"
import {MembershipDTO} from "../lib/dto/MembershipDTO"
import {RevocationDTO, ShortRevocation} from "../lib/dto/RevocationDTO"

const Table = require('cli-table')

module.exports = {
  duniter: {

    service: {
      neutral: (server:Server, conf:ConfDTO) => {
        return {
          startService: () => {
            if (conf.storage && conf.storage.wotwizard) {
              let fifo: Querable<any> = querablep(Promise.resolve())
              server
                .on('bcEvent', (e) => {
                  if ((e.bcEvent === OtherConstants.BC_EVENT.HEAD_CHANGED || e.bcEvent === OtherConstants.BC_EVENT.SWITCHED) && fifo.isFulfilled()) {
                    fifo = querablep(fifo.then(async () => {
                      try {
                        await dumpWotWizard(server)
                      } catch (e) {}
                    }))
                  }
                })
            }
          },
          stopService: () => {
            // Never stops, just wait for blocks
          }
        }
      }
    },

    cli: [{
      name: 'current',
      desc: 'Shows current block\'s blockstamp',
      logs: false,
      preventIfRunning: true,

      onDatabaseExecute: async (server:Server) => {
        const current = await server.dal.getCurrentBlockOrNull()
        if (!current) {
          return console.log('None')
        }
        const blockstamp = `${current.number}-${current.hash}`
        console.log(blockstamp)
        // Save DB
        await server.disconnect();
      }
    }, {
      name: 'trim-indexes',
      desc: 'Force trimming of indexes',
      logs: true,
      preventIfRunning: true,

      onConfiguredExecute: async (server:Server) => {
        await server.dal.init(server.conf)
        await server.BlockchainService.trimIndexes()
        // Save DB
        await server.disconnect();
      }
    }, {
      name: 'dump [what] [name] [cond]',
      desc: 'Dumps data of the blockchain.',
      logs: false,
      preventIfRunning: true,

      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const what: string = params[0] || ''
        const name: string = params[1] || ''
        const cond: string = params[2] || ''

        try {

          switch (what) {

            case 'current':
              await dumpCurrent(server)
              break

            case 'blocks':
              await dumpBlocks(server, name)
              break

            case 'forks':
              await dumpForks(server, name)
              break

            case 'volumes':
              await dumpVolumes(server)
              break

            case 'table':
              await dumpTable(server, name, cond)
              break

            case 'wot':
              await dumpWot(server)
              break

            case 'history':
              await dumpHistory(server, name)
              break

            case 'wotwizard':
              await dumpWotWizard(server)
              break

            default:
              console.error(`Unknown dump ${what}`)
              break
          }
        } catch (e) {
          console.error(e)
        }
        // Save DB
        await server.disconnect();
      }
    }, {
      name: 'search [pattern]',
      desc: 'Dumps data of the blockchain matching given pattern.',
      logs: false,
      preventIfRunning: true,

      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const pattern: string = params[0] || ''

        try {

          const files: string[] = await new Promise<string[]>((res, rej) => exec(`grep -r ${pattern} ${server.home}/${server.conf.currency} -l | grep .json`, (err, stdout) => {
            if (err) return rej(err)
            console.log(stdout)
            res(stdout.split('\n').filter(l => l))
          }))

          const blocks = Underscore.sortBy(await findBlocksMatching(pattern, files), b => b.number)

          const events: { b: BlockDTO, event: (IdentityDTO|ShortCertificationDTO|MembershipDTO|ShortRevocation|{ type: 'exclusion', pub: string }) }[] = []
          for (const b of blocks) {
            b.identities.filter(i => i.includes(pattern)).forEach(i => {
              events.push({ b, event: IdentityDTO.fromInline(i) })
            })
            b.certifications.filter(c => c.includes(pattern)).forEach(c => {
              events.push({ b, event: CertificationDTO.fromInline(c) })
            })
            b.joiners.concat(b.actives).concat(b.leavers).filter(m => m.includes(pattern)).forEach(m => {
              events.push({ b, event: MembershipDTO.fromInline(m) })
            })
            b.revoked.filter(m => m.includes(pattern)).forEach(r => {
              events.push({ b, event: RevocationDTO.fromInline(r) })
            })
            b.excluded.filter(m => m.includes(pattern)).forEach(r => {
              events.push({ b, event: { type: 'exclusion', pub: r } })
            })
          }

          for (const e of events) {
            if ((e.event as IdentityDTO).uid) {
              const date = await getDateForBlock(e.b)
              const idty = e.event as IdentityDTO
              console.log('%s: new identity %s (created on %s)', date, idty.uid, await getDateFor(server, idty.buid as string))
            }
            if ((e.event as { type: 'exclusion', pub: string }).type === 'exclusion') {
              const date = await getDateForBlock(e.b)
              console.log('%s: excluded', date)
            }
          }

          console.log(events.map(e => e.event))

        } catch (e) {
          console.error(e)
        }
        // Save DB
        await server.disconnect();
      }
    }, {
      name: 'dump-ww',
      desc: 'Dumps WotWizard export.',
      logs: true,
      preventIfRunning: true,
      onDatabaseExecute: async (server:Server) => dumpWotWizard(server)
    }]
  }
}

async function findBlocksMatching(pattern: string, files: string[]) {
  const matchingBlocks: BlockDTO[] = []
  for (const f of files) {
    const blocks: any[] = JSON.parse(await readFileSync(f, 'utf8')).blocks
    for (const jsonBlock of blocks) {
      const b = BlockDTO.fromJSONObject(jsonBlock)
      const raw = b.getRawSigned()
      if (raw.includes(pattern)) {
        matchingBlocks.push(b)
      }
    }
  }
  return matchingBlocks
}

async function dumpCurrent(server: Server) {
  const current = await server.dal.getCurrentBlockOrNull()
  if (!current) {
    console.log('')
  }
  else {
    console.log(BlockDTO.fromJSONObject(current).getRawSigned())
  }
}

async function dumpVolumes(server: Server) {
  const nbUdo = await server.dal.dividendDAL.count()
  const nbTxo = await server.dal.sindexDAL.count()
  const iindex = await server.dal.iindexDAL.count()
  const mindex = await server.dal.mindexDAL.count()
  const cindex = await server.dal.cindexDAL.count()

  console.log('Sindex : %s (%s UD, %s TX)', nbTxo + nbUdo, nbUdo, nbTxo)
  console.log('Iindex : %s', iindex)
  console.log('Mindex : %s', mindex)
  console.log('Cindex : %s', cindex)
}

async function dumpTable(server: Server, name: string, condition?: string) {
  const criterion: any = {}
  const filters = condition && condition.split(',') || []
  for (const f of filters) {
    const k = f.split('=')[0]
    const v = f.split('=')[1]
    if (v === 'true' || v === 'false') {
      criterion[k] = v === 'true' ? true : 0
    } else if (v === 'NULL') {
      criterion[k] = null
    } else if (v.match(/^\d+$/)) {
      criterion[k] = parseInt(v)
    } else {
      criterion[k] = v
    }
  }
  let rows: any[]
  switch (name) {
    case 'b_index':
      rows = await server.dal.bindexDAL.findRawWithOrder(criterion, [['number', false]])
      dump(rows, ['version','bsize','hash','issuer','time','number','membersCount','issuersCount','issuersFrame','issuersFrameVar','issuerDiff','avgBlockSize','medianTime','dividend','mass','unitBase','powMin','udTime','udReevalTime','diffNumber','speed','massReeval'])
      break

    /**
     * Dumps issuers visible in current bindex
     */
    case 'issuers':
      rows = await server.dal.bindexDAL.findRawWithOrder(criterion, [['number', false]])
      const identites = await Promise.all(Underscore.uniq(rows.map(b => b.issuer)).map(i => server.dal.iindexDAL.getFullFromPubkey(i)))
      console.log(identites.map(i => i.uid))
      break

    case 'i_index':
      rows = await server.dal.iindexDAL.findRawWithOrder(criterion, [['writtenOn', false], ['wotb_id', false]])
      dump(rows, ['op','uid','pub','hash','sig','created_on','written_on','member','wasMember','kick','wotb_id'])
      break
    case 'm_index':
      rows = await server.dal.mindexDAL.findRawWithOrder(criterion, [['writtenOn', false], ['pub', false]])
      dump(rows, ['op','pub','created_on','written_on','expires_on','expired_on','revokes_on','revoked_on','leaving','revocation','chainable_on'])
      break
    case 'c_index':
      rows = await server.dal.cindexDAL.findRawWithOrder(criterion, [['writtenOn', false], ['issuer', false], ['receiver', false]])
      dump(rows, ['op','issuer','receiver','created_on','written_on','sig','expires_on','expired_on','chainable_on','from_wid','to_wid','replayable_on'])
      break
    case 's_index':
      const rowsTX = await server.dal.sindexDAL.findRawWithOrder(criterion, [['writtenOn', false], ['identifier', false], ['pos', false]])
      const rowsUD = await server.dal.dividendDAL.findForDump(criterion)
      rows = rowsTX.concat(rowsUD)
      sortSindex(rows)
      dump(rows, ['op','tx','identifier','pos','created_on','amount','base','locktime','consumed','conditions', 'writtenOn'])
      break
    default:
      console.error(`Unknown dump table ${name}`)
      break
  }
}

function dump(rows: any[], columns: string[]) {
  // Table columns
  const t = new Table({
    head: columns
  });
  for (const row of rows) {
    t.push(columns.map((c) => {
      if (row[c] === null) {
        return "NULL"
      }
      else if (row[c] === undefined) {
        return 'NULL'
      }
      else if (typeof row[c] === 'boolean') {
        return row[c] ? 1 : 0
      }
      return row[c]
    }));
  }
  try {
    const dumped = t.toString()
    console.log(dumped)
  } catch (e) {
    console.error(e)
  }
}

async function dumpHistory(server: Server, pub: string) {
  const irows = (await server.dal.iindexDAL.findRawWithOrder({ pub }, [['writtenOn', false]])).filter(r => pub ? r.pub === pub : true)
  const mrows = (await server.dal.mindexDAL.findRawWithOrder({ pub }, [['writtenOn', false]])).filter(r => pub ? r.pub === pub : true)
  const crows = (await server.dal.cindexDAL.findRawWithOrder({ pub }, [['writtenOn', false]])).filter(r => pub ? r.issuer === pub || r.receiver === pub: true)
  console.log('----- IDENTITY -----')
  for (const e of irows) {
    const date = await getDateFor(server, e.written_on)
    if (e.uid) {
      console.log('%s: new identity %s (created on %s)', date, e.uid, await getDateFor(server, e.created_on as string))
    } else if (e.member) {
      console.log('%s: comeback', date)
    } else if (e.kick) {
      // console.log('%s: being kicked... (either)', date)
    } else if (e.member === false) {
      console.log('%s: excluded', date)
    } else {
      console.log('Non displayable IINDEX entry')
    }
  }
  console.log('----- MEMBERSHIP -----')
  for (const e of mrows) {
    const date = await getDateFor(server, e.written_on)
    if (e.chainable_on) {
      console.log('%s: join/renew', date)
    } else if (e.expired_on) {
      console.log('%s: expired', date)
    } else if (e.revoked_on) {
      console.log('%s: revoked', date)
    } else {
      console.log('Non displayable MINDEX entry')
    }
  }
  console.log('----- CERTIFICATION -----')
  crows.forEach(crow => {
    console.log(JSON.stringify(crow))
  })
  for (const e of crows) {
    const dateW = await getDateFor(server, e.written_on)
    const dateC = await getDateForBlockNumber(server, e.created_on)
    if (e.receiver === pub) {
      const issuer = await server.dal.getWrittenIdtyByPubkey(e.issuer) as FullIindexEntry
      if (e.op === 'UPDATE') {
        console.log('%s : %s: from %s (update)', dateC, dateW, issuer.uid)
      }
      else {
        console.log('%s : %s: from %s', dateC, dateW, issuer.uid)
      }
    // } else if (e.issuer === pub) {
    //   const receiver = await server.dal.getWrittenIdtyByPubkey(e.receiver) as FullIindexEntry
    //   console.log('%s: to ', date, receiver.uid)
    } else {
      // console.log('Non displayable CINDEX entry')
    }
  }
}

async function dumpWot(server: Server) {
  const data = server.dal.wotb.dumpWoT()
  console.log(data)
  await newResolveTimeoutPromise(1000, null)
}

async function getDateFor(server: Server, blockstamp: string) {
  const b = (await server.dal.getAbsoluteBlockByBlockstamp(blockstamp)) as DBBlock
  const s = "         " + b.number
  const bnumberPadded = s.substr(s.length - 6)
  return formatTimestamp(b.medianTime) + ' (#' + bnumberPadded + ')'
}

async function getDateForBlockNumber(server: Server, number: number) {
  const b = (await server.dal.getBlock(number)) as DBBlock
  const s = "         " + b.number
  const bnumberPadded = s.substr(s.length - 6)
  return formatTimestamp(b.medianTime) + ' (#' + bnumberPadded + ')'
}

async function getDateForBlock(b: BlockDTO) {
  const s = "         " + b.number
  const bnumberPadded = s.substr(s.length - 6)
  return formatTimestamp(b.medianTime) + ' (#' + bnumberPadded + ')'
}

function formatTimestamp(ts: number) {
  return moment(ts * 1000).format('YYYY-MM-DD hh:mm:ss')
}

function sortSindex(rows: SindexEntry[]) {
  // We sort by writtenOn, identifier, pos
  rows.sort((a, b) => {
    if (a.writtenOn === b.writtenOn) {
      if (a.identifier === b.identifier) {
        if (a.pos === b.pos) {
          return a.op === 'CREATE' && b.op === 'UPDATE' ? -1 : (a.op === 'UPDATE' && b.op === 'CREATE' ? 1 : 0)
        } else {
          return a.pos < b.pos ? -1 : 1
        }
      }
      else {
        return a.identifier < b.identifier ? -1 : 1
      }
    }
    else {
      return a.writtenOn < b.writtenOn ? -1 : 1
    }
  })
}