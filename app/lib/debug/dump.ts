import {CindexEntry} from "../indexer"

const Table = require('cli-table')

export function dumpBindex(rows: CindexEntry[]) {
  return dump(rows, ['version','bsize','hash','issuer','time','number','membersCount','issuersCount','issuersFrame','issuersFrameVar','issuerDiff','avgBlockSize','medianTime','dividend','mass','unitBase','powMin','udTime','udReevalTime','diffNumber','speed','massReeval'])
}
export function dumpIindex(rows: CindexEntry[]) {
  return dump(rows, ['op','uid','pub','hash','sig','created_on','written_on','member','wasMember','kick','wotb_id'])
}
export function dumpCindex(rows: CindexEntry[]) {
  return dump(rows, ['op','issuer','receiver','created_on','written_on','sig','expires_on','expired_on','chainable_on','from_wid','to_wid','replayable_on'])
}
export function dumpCindexPretty(rows: CindexEntry[], getUid: (pub: string) => Promise<string>) {
  return dumpPretty(rows, ['row','op','issuer','created_on','written_on','expires_on','expired_on','chainable_on','replayable_on'], async (f, v) => {
    if (f === 'issuer') {
      return await getUid(v)
    }
    if (f === 'written_on') {
      return String(v).substr(0, 15)
    }
    return v
  })
}
export function dumpMindex(rows: CindexEntry[]) {
  return dump(rows, ['op','pub','created_on','written_on','expires_on','expired_on','revokes_on','revoked_on','leaving','revocation','chainable_on'])
}
export function dumpSindex(rows: CindexEntry[]) {
  return dump(rows, ['op','tx','identifier','pos','created_on','amount','base','locktime','consumed','conditions', 'writtenOn'])
}

async function dumpPretty(rows: any[], columns: string[], transform: (field: string, value: any) => Promise<string> = (f, v) => Promise.resolve(v)) {
  return dump(rows, columns, transform, {'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': ''})
}

async function dump(rows: any[], columns: string[], transform: (field: string, value: any) => Promise<string> = (f, v) => Promise.resolve(v), chars?: any) {
  // Table columns
  const t = chars ? new Table({ head: columns, chars }) : new Table({ head: columns });
  let i = 0;
  for (const row of rows) {
    t.push(await Promise.all(columns.map(async (c) => {
      if (c === 'row') {
        return i
      }
      else if (row[c] === null) {
        return "NULL"
      }
      else if (row[c] === undefined) {
        return 'NULL'
      }
      else if (typeof row[c] === 'boolean') {
        const v = await transform(c, row[c] ? 1 : 0)
        return v
      }
      const v = await transform(c, row[c])
      return v
    })));
    i++
  }
  try {
    const dumped = t.toString()
    console.log(dumped)
  } catch (e) {
    console.error(e)
  }
}
