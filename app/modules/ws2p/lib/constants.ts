import {CommonConstants} from "../../../lib/common-libs/constants"
export const WS2PConstants = {

  WS2P_UPNP_TTL: 600,
  WS2P_PORTS_START: 20900,
  WS2P_PORTS_END: 20999,
  WS2P_UPNP_INTERVAL: 300,

  CONNEXION_TIMEOUT: 15000,
  REQUEST_TIMEOUT: 15000,
  CONNEXION_TOR_TIMEOUT: 30000,
  REQUEST_TOR_TIMEOUT: 30000,
  RECONNEXION_INTERVAL_IN_SEC: 60 * 10, // 10 minutes

  BLOCK_PULLING_INTERVAL: 300 * 2,    // 10 minutes
  DOCPOOL_PULLING_INTERVAL: 3600 * 4, // 4 hours
  SANDBOX_FIRST_PULL_DELAY: 300 * 2,  // 10 minutes after the start

  MAX_LEVEL_1_PEERS: 10,
  MAX_LEVEL_2_PEERS: 10,
  CONNECTIONS_LOW_LEVEL: 3,

  BAN_DURATION_IN_SECONDS: 120,
  BAN_ON_REPEAT_THRESHOLD: 5,
  ERROR_RECALL_DURATION_IN_SECONDS: 60,
  SINGLE_RECORD_PROTECTION_IN_SECONDS: 60,

  HEAD_V0_REGEXP: new RegExp('^WS2P:HEAD:'
    + CommonConstants.FORMATS.PUBKEY + ':'
    + CommonConstants.FORMATS.BLOCKSTAMP
    + '$'),

  HEAD_V1_REGEXP: new RegExp('^WS2P:HEAD:1:'
  + '(' + CommonConstants.FORMATS.PUBKEY + '):'
  + '(' + CommonConstants.FORMATS.BLOCKSTAMP + '):'
  + '(' + CommonConstants.FORMATS.WS2PID + '):'
  + '(' + CommonConstants.FORMATS.SOFTWARE + '):'
  + '(' + CommonConstants.FORMATS.SOFT_VERSION + '):'
  + '(' + CommonConstants.FORMATS.POW_PREFIX + ')'
  + '$'),

  HOST_ONION_REGEX: new RegExp('^(?:www\.)?([0-9a-z]{16}\.onion)$'),
  FULL_ADDRESS_ONION_REGEX: new RegExp('^(?:wss?:\/\/)(?:www\.)?([0-9a-z]{16}\.onion)(:[0-9]+)?(\/[-\w]*)*'),

  HEADS_SPREAD_TIMEOUT: 100 // Wait 100ms before sending a bunch of signed heads
}