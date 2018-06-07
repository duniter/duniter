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

import {NewLogger} from "../logger"
import {getMicrosecondsTime} from "../../ProcessCpuProfiler"

const theLogger = NewLogger()

export const MonitorLokiExecutionTime = function (dumpFirstParam = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value
    if (original.__proto__.constructor.name === "AsyncFunction") {
      descriptor.value = async function (...args:any[]) {
        const that :any = this
        const now = getMicrosecondsTime()
        const result = await original.apply(this, args)
        if (dumpFirstParam) {
          theLogger.trace('[loki][%s][%s] => %sµs', that.collectionName, propertyKey, (getMicrosecondsTime() - now), args && args[0])
        } else {
          theLogger.trace('[loki][%s][%s] => %sµs', that.collectionName, propertyKey, (getMicrosecondsTime() - now))
        }
        return result
      }
    } else {
      throw Error("Monitoring a Loki synchronous function is not allowed.")
    }
  }
}