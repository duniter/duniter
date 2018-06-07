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

import {getDurationInMicroSeconds, getMicrosecondsTime} from "../../ProcessCpuProfiler"
import {NewLogger} from "../logger"

const theLogger = NewLogger()

export const MonitorSQLExecutionTime = function () {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value
    if (original.__proto__.constructor.name === "AsyncFunction") {
      descriptor.value = async function (...args:any[]) {
        const start = getMicrosecondsTime()
        const sql: string = args[0]
        const params: any[] = args[1]
        const entities: any[] = await original.apply(this, args)
        const duration = getDurationInMicroSeconds(start)
        theLogger.trace('[sqlite][query] %s %s %sµs', sql, JSON.stringify(params || []), duration)
        return entities
      }
    } else {
      throw Error("Monitoring an SQL synchronous function is not allowed.")
    }
  }
}