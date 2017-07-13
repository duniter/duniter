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
