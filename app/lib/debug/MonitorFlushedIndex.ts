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

import {cliprogram} from "../common-libs/programOptions"
import {IndexBatch} from "../dal/fileDAL"

export const MonitorFlushedIndex = function () {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value
    if (original.__proto__.constructor.name === "AsyncFunction") {
      descriptor.value = async function (...args:any[]) {
        const pub = cliprogram.syncTrace
        if (pub) {
          const batch: IndexBatch = args[0]
          batch.iindex.forEach(e => {
            if (e.pub === pub) {
              console.log(JSON.stringify(e))
            }
          })
          batch.mindex.forEach(e => {
            if (e.pub === pub) {
              console.log(JSON.stringify(e))
            }
          })
          batch.cindex.forEach(e => {
            if (e.issuer === pub || e.receiver === pub) {
              console.log(JSON.stringify(e))
            }
          })
          batch.sindex.forEach(e => {
            if (e.conditions.indexOf(pub || '') !== -1) {
              console.log(JSON.stringify(e))
            }
          })
        }
        return await original.apply(this, args)
      }
    } else {
      throw Error("Monitoring a synchronous function is not allowed.")
    }
  }
}