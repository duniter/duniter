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

import {CommonConstants} from "../../../lib/common-libs/constants"

export const WS2PConstants = {

  NETWORK: {
    INCOMING: {
      DEFAULT: 0,
      TOR: 1
    },
    OUTCOMING: {
      DEFAULT: 0,
      TOR: 1
    },
  },

  WS2P_DEFAULT_API_VERSION:1,
  WS2P_DEFAULT_HEAD_VERSION:1,
  WS2P_API_VERSION: 1,
  WS2P_HEAD_VERSION: 2,

  WS2P_UPNP_TTL: 600,
  WS2P_PORTS_START: 20900,
  WS2P_PORTS_END: 20999,
  WS2P_UPNP_INTERVAL: 300,

  CONNEXION_TIMEOUT: 15000,
  REQUEST_TIMEOUT: 15000,
  CONNEXION_TOR_TIMEOUT: 30000,
  REQUEST_TOR_TIMEOUT: 60000,
  RECONNEXION_INTERVAL_IN_SEC: 60 * 10, // 10 minutes

  BLOCK_PULLING_INTERVAL: 300 * 2,    // 10 minutes
  DOCPOOL_PULLING_INTERVAL: 3600 * 4, // 4 hours
  SANDBOX_FIRST_PULL_DELAY: 300 * 2,  // 10 minutes after the start

  MAX_LEVEL_1_PEERS: 5,
  MAX_LEVEL_2_PEERS: 20,

  CONNECTIONS_PRIORITY: {
    MEMBER_KEY_LEVEL: 1,
    PREFERED_PRIVILEGED_KEY_LEVEL: 2,
    SELF_KEY_LEVEL: 4,
    MAX_PRIORITY_LEVEL: 7,
  },

  BAN_DURATION_IN_SECONDS: 120,
  SYNC_BAN_DURATION_IN_SECONDS: 240,
  BAN_ON_REPEAT_THRESHOLD: 5,
  ERROR_RECALL_DURATION_IN_SECONDS: 60,
  SINGLE_RECORD_PROTECTION_IN_SECONDS: 60,

  HEAD_V0_REGEXP: new RegExp('^WS2P:HEAD:'
    + CommonConstants.FORMATS.PUBKEY + ':'
    + CommonConstants.FORMATS.BLOCKSTAMP
    + '$'),

  HEAD_V1_REGEXP: new RegExp('^WS2P(?:O[CT][SAM]?)?(?:I[CT])?:HEAD:1:'
  + '(' + CommonConstants.FORMATS.PUBKEY + '):'
  + '(' + CommonConstants.FORMATS.BLOCKSTAMP + '):'
  + '(' + CommonConstants.FORMATS.WS2PID + '):'
  + '(' + CommonConstants.FORMATS.SOFTWARE + '):'
  + '(' + CommonConstants.FORMATS.SOFT_VERSION + '):'
  + '(' + CommonConstants.FORMATS.POW_PREFIX + ')'
  + '$'),

  HEAD_V2_REGEXP: new RegExp('^WS2P(?:O[CT][SAM]?)?(?:I[CT])?:HEAD:2:'
  + '(' + CommonConstants.FORMATS.PUBKEY + '):'
  + '(' + CommonConstants.FORMATS.BLOCKSTAMP + '):'
  + '(' + CommonConstants.FORMATS.WS2PID + '):'
  + '(' + CommonConstants.FORMATS.SOFTWARE + '):'
  + '(' + CommonConstants.FORMATS.SOFT_VERSION + '):'
  + '(' + CommonConstants.FORMATS.POW_PREFIX + '):'
  + '(' + CommonConstants.FORMATS.ZERO_OR_POSITIVE_INT + '):'
  + '(' + CommonConstants.FORMATS.ZERO_OR_POSITIVE_INT + ')'
  + '(?::' + CommonConstants.FORMATS.TIMESTAMP + ')?'
  + '$'),
  
  HEAD_SIG_REGEXP: new RegExp(CommonConstants.FORMATS.SIGNATURE),

  HOST_ONION_REGEX: CommonConstants.HOST_ONION_REGEX,
  FULL_ADDRESS_ONION_REGEX: CommonConstants.WS_FULL_ADDRESS_ONION_REGEX,

  INITIAL_CONNECTION_PEERS_BUNDLE_SIZE: 5,

  HEADS_SPREAD_TIMEOUT: 100, // Wait 100ms before sending a bunch of signed heads

  WS2P_SYNC_LIMIT: 15, // Number of concurrent peers for sync
  SYNC_CONNECTION_DURATION_IN_SECONDS: 120, // Duration of the SYNC connection
}