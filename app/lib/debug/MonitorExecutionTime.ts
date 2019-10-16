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
import {OtherConstants} from "../other_constants"
import {Underscore} from "../common-libs/underscore"

const monitorings: {
  [k: string]: {
    times: {
      time: number
    }[]
  }
} = {}

process.on('exit', () => {
  let traces: { name: string, times: number, avg: number, total: number }[] = []
  Object
    .keys(monitorings)
    .forEach(k => {
      const m = monitorings[k]
      const total = m.times.reduce((s, t) => s + t.time / 1000, 0)
      const avg = m.times.length ? total / m.times.length : 0
      traces.push({
        name: k,
        times: m.times.length,
        avg,
        total
      })
    })
  traces = Underscore.sortBy(traces, t => t.total)
  traces
    .forEach(t => {
      console.log('%s %s times %sms (average) %sms (total time)',
        (t.name + ':').padEnd(50, ' '),
        String(t.times).padStart(10, ' '),
        t.avg.toFixed(3).padStart(10, ' '),
        t.total.toFixed(0).padStart(10, ' ')
      )
    })
})

export const MonitorExecutionTime = function (idProperty?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (OtherConstants.ENABLE_MONITORING) {
      const original = descriptor.value
      if (original.__proto__.constructor.name === "AsyncFunction") {
        descriptor.value = async function (...args: any[]) {
          const start = getMicrosecondsTime()
          const entities: any[] = await original.apply(this, args)
          const duration = getDurationInMicroSeconds(start)
          const k = target.constructor.name + '.' + propertyKey + (idProperty ? `[${(this as any)[idProperty]}]` : '')
          if (!monitorings[k]) {
            monitorings[k] = {
              times: []
            }
          }
          monitorings[k].times.push({
            time: duration
          })
          return entities
        }
      } else {
        descriptor.value = function (...args: any[]) {
          const start = getMicrosecondsTime()
          const entities: any[] = original.apply(this, args)
          const duration = getDurationInMicroSeconds(start)
          const k = target.constructor.name + '.' + propertyKey + (idProperty ? `[${(this as any)[idProperty]}]` : '')
          if (!monitorings[k]) {
            monitorings[k] = {
              times: []
            }
          }
          monitorings[k].times.push({
            time: duration
          })
          return entities
        }
      }
    }
  }
}