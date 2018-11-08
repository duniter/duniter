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

"use strict";
import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"
import {CommonConstants} from "../lib/common-libs/constants"
import {Directory} from "../lib/system/directory"
import {Underscore} from "../lib/common-libs/underscore"
import {ProgramOptions} from "../lib/common-libs/programOptions"

module.exports = {
  duniter: {

    cliOptions: [
      { value: '--store-txs', desc: 'Enable full transaction history storage.' },
    ],

    config: {
      onLoading: async (conf:ConfDTO, program: ProgramOptions) => {
        conf.msPeriod = conf.msWindow
        conf.switchOnHeadAdvance = CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS

        // Transactions storage
        if (program.storeTxs) {
          if (!conf.storage) {
            conf.storage = { transactions: true }
          }
          else {
            conf.storage.transactions = true
          }
        }
      },
      beforeSave: async (conf:ConfDTO) => {
        conf.msPeriod = conf.msWindow
        conf.switchOnHeadAdvance = CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
        if (!conf.storage) {
          conf.storage = {
            transactions: false
          }
        }
      }
    },



    cli: [{
      name: 'config',
      desc: 'Register configuration in database',
      // The command does nothing particular, it just stops the process right after configuration phase is over
      onConfiguredExecute: (server:Server, conf:ConfDTO) => Promise.resolve(conf)
    }, {
      name: 'parse-logs',
      desc: 'Extract data from logs.',
      logs: true,
      onConfiguredExecute: async (server:Server, conf:ConfDTO) => {
        const fs = await Directory.getHomeFS(false, Directory.INSTANCE_HOME, false)
        const lines = (await fs.fs.fsReadFile(Directory.INSTANCE_HOMELOG_FILE)).split('\n')
        const aggregates = Underscore.uniq(
          lines
          .map(l => l.match(/: (\[\w+\](\[\w+\])*)/))
          .filter(l => l)
          .map((l:string[]) => l[1])
        )
        console.log(aggregates)
        const results = aggregates.map((a:string) => {
          return {
            name: a,
            time: lines
              .filter(l => l.match(new RegExp(a
                .replace(/\[/g, '\\[')
                .replace(/\]/g, '\\]')
              )))
              .map(l => {
                const m = l.match(/ (\d+)(\.\d+)?(ms|µs)( \d+)?$/)
                if (!m) {
                  throw Error('Wrong match')
                }
                return m
              })
              .map(match => {
                return {
                  qty: parseInt(match[1]),
                  unit: match[3],
                }
              })
              .reduce((sumMicroSeconds, entry) => {
                return sumMicroSeconds + (entry.qty * (entry.unit === 'ms' ? 1000 : 1))
              }, 0) / 1000000
          }
        })
        const root:Tree = {
          name: 'root',
          leaves: {}
        }
        for (const r of results) {
          recursiveReduce(root, r.name, r.time)
        }
        recursiveDump(root)
      }
    }]
  }
}

interface Leaf {
  name:string
  value:number
}

interface Tree {
  name:string
  leaves: { [k:string]: Tree|Leaf }
}

function recursiveReduce(tree:Tree, path:string, duration:number) {
  if (path.match(/\]\[/)) {
    const m = (path.match(/^(\[\w+\])(\[.+)/) as string[])
    const key = m[1]
    if (!tree.leaves[key]) {
      tree.leaves[key] = {
        name: key,
        leaves: {}
      }
    }
    recursiveReduce(tree.leaves[key] as Tree, m[2], duration)
  } else {
    tree.leaves[path] = {
      name: path,
      value: duration
    }
  }
}

function recursiveDump(tree:Tree, level = -1) {
  if (level >= 0) {
    console.log("  ".repeat(level), tree.name)
  }
  for (const k of Object.keys(tree.leaves)) {
    const element = tree.leaves[k]
    if ((<Tree>element).leaves) {
      recursiveDump(<Tree>element, level + 1)
    } else {
      console.log("  ".repeat(level + 1), (<Leaf>element).name, (<Leaf>element).value + 's')
    }
  }
}