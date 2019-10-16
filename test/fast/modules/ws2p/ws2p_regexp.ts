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

import * as assert from 'assert'
import { WS2PConstants } from '../../../../app/modules/ws2p/lib/constants';

describe('WS2P Regexp', () => {
  
  it('should match correctly HEADv0 regexps', () => {
    assert.deepEqual('WRONG_VALUE'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual('WS2P'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957#00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957-'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:00-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual(
      Array.from('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:0-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V0_REGEXP) || { length: 0 }),
      [
        'WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:0-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E',
        '0'
      ]
    )
    assert.deepEqual(
      Array.from('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V0_REGEXP) || { length: 0 }),
      ['WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E', '63957']
    )
  })
  
  it('should match correctly HEADv1 regexps', () => {
    assert.deepEqual('WRONG_VALUE'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual('WS2P'.match(WS2PConstants.HEAD_V0_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957#00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V1_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957-'.match(WS2PConstants.HEAD_V1_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:00-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V1_REGEXP), null)
    assert.deepEqual('WS2P:HEAD:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:0-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E'.match(WS2PConstants.HEAD_V1_REGEXP), null)
    assert.deepEqual(
      Array.from('WS2P:HEAD:1:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E:abcdef01:duniter:1.6.8:899'.match(WS2PConstants.HEAD_V1_REGEXP) || { length: 0 }),
      [
        'WS2P:HEAD:1:3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj:63957-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E:abcdef01:duniter:1.6.8:899',
        '3dnbnYY9i2bHMQUGyFp5GVvJ2wBkVpus31cDJA5cfRpj',
        '63957-00003DC30A5218974ED1BBA3DD8593F43A2C7CDD3EBD17B785FD5191DBB1657E',
        '63957',
        'abcdef01',
        'duniter',
        '1.6.8',
        '899',
        '899'
      ]
    )
  })
})
