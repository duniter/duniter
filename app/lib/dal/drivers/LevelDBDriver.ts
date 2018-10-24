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

import * as levelup from 'levelup'
import {LevelUp} from 'levelup'
import {AbstractLevelDOWN, ErrorCallback} from 'abstract-leveldown'
import * as leveldown from 'leveldown'
import * as memdown from 'memdown'

export const LevelDBDriver = {

  newMemoryInstance: (): Promise<LevelUp> => {
    const impl: any = memdown.default()
    return new Promise((res, rej) => {
      const db: LevelUp = levelup.default(impl, undefined, (err: Error) => {
        if (err) return rej(err)
        res(db)
      })
    })
  },

  newFileInstance: (path: string): Promise<LevelUp> => {
    const impl: any = leveldown.default(path)
    return new Promise((res, rej) => {
      const db: LevelUp = levelup.default(impl, undefined, (err: Error) => {
        if (err) return rej(err)
        res(db)
      })
    })
  }

}
