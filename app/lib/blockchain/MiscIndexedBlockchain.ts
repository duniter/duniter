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

"use strict"
import {IndexedBlockchain} from "./IndexedBlockchain"
import {SQLIndex} from "./SqlIndex"
import {BlockchainOperator} from "./interfaces/BlockchainOperator"

export class MiscIndexedBlockchain extends IndexedBlockchain {

  constructor(blockchainStorage: BlockchainOperator, mindexDAL:any, iindexDAL:any, sindexDAL:any, cindexDAL:any) {
    super(blockchainStorage, new SQLIndex(null, {
      m_index: { handler: mindexDAL },
      i_index: { handler: iindexDAL },
      s_index: {
        handler: sindexDAL,
        findTrimable: (maxNumber:number) => sindexDAL.query('SELECT * FROM s_index WHERE consumed AND writtenOn < ?', [maxNumber])
      },
      c_index: {
        handler: cindexDAL,
        findTrimable: (maxNumber:number) => cindexDAL.query('SELECT * FROM c_index WHERE expired_on > 0 AND writtenOn < ?', [maxNumber])
      }
    }), 'writtenOn', {
      m_index: {
        pk: ['pub']
      },
      i_index: {
        pk: ['pub']
      },
      s_index: {
        pk: ['identifier', 'pos'],
        remove: 'consumed'
      },
      c_index: {
        pk: ['issuer', 'receiver', 'created_on'],
        remove: 'expired_on'
      }
    })
  }
}
