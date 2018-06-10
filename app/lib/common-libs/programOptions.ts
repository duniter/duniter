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

const opts = require('optimist').argv

export interface ProgramOptions {
  mdb?: string
  home?: string
  notrim?: boolean
  nosbx?: boolean
  nopeers?: boolean
  syncTrace?: string
}

export const cliprogram: ProgramOptions = {
  mdb: opts.mdb,
  home: opts.home,
  notrim: opts.notrim,
  nosbx: opts.nosbx,
  nopeers: opts.nopeers,
  syncTrace: opts['sync-trace'],
}
