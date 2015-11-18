"use strict";

var CURRENCY     = "[a-zA-Z0-9-_ ]+";
var META_TS      = "META:TS:[1-9][0-9]*";
var UDID2        = "udid2;c;([A-Z-]*);([A-Z-]*);(\\d{4}-\\d{2}-\\d{2});(e\\+\\d{2}\\.\\d{2}(\\+|-)\\d{3}\\.\\d{2});(\\d+)(;?)";
var USER_ID      = "[A-Za-z0-9_-]*";
var BASE58       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+";
var PUBKEY       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}";
var TIMESTAMP    = "[1-9][0-9]*";
var POSITIVE_INT = "[1-9][0-9]*";
var INTEGER      = "\\d+";
var FLOAT        = "\\d+\.\\d+";
var BOOLEAN      = "[01]";
var SIGNATURE    = "[A-Za-z0-9+\\/=]{87,88}";
var FINGERPRINT  = "[A-F0-9]{40}";
var COMMENT      = "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]{0,255}";
var BLOCK_REFERENCE = INTEGER + "-" + FINGERPRINT;

module.exports = {
  
  ERROR: {

    PEER: {
      ALREADY_RECORDED: 'A more recent peering document is already recorded.'
    },

    BLOCK: {
      NO_CURRENT_BLOCK: 'No current block'
    }
  },

  DEBUG: {
    LONG_DAL_PROCESS: 50
  },

  SALT: exact(".+"),
  PASSWORD: exact(".*"),

  INTEGER: /^\d+$/,
  TIMESTAMP: exact(TIMESTAMP),
  USER_ID: exact(USER_ID), // Any format, by default
  UDID2_FORMAT: exact(UDID2),
  BASE58: exact(BASE58),
  PUBLIC_KEY: exact(PUBKEY),
  SIG: exact(SIGNATURE),
  BLOCK_REFERENCE: exact(BLOCK_REFERENCE),
  CERT: {
    SELF: {
      UID: exact("UID:" + USER_ID),
      META: exact(META_TS)
    },
    REVOKE: exact("UID:REVOKE"),
    OTHER: {
      META: exact(META_TS),
      INLINE: exact(PUBKEY + ":" + PUBKEY + ":" + INTEGER + ":" + SIGNATURE)
    }
  },
  IDENTITY: {
    INLINE: exact(PUBKEY + ":" + SIGNATURE + ":" + TIMESTAMP + ":" + USER_ID)
  },
  MEMBERSHIP: {
    BLOCK:      find('Block: (' + BLOCK_REFERENCE + ')'),
    VERSION:    find('Version: (1)'),
    CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    MEMBERSHIP: find('Membership: (IN|OUT)'),
    USERID:     find('UserID: (' + USER_ID + ')')
  },
  BLOCK: {
    NONCE:       find("Nonce: (" + INTEGER + ")"),
    VERSION:     find("Version: (1)"),
    TYPE:        find("Type: (Block)"),
    CURRENCY:    find("Currency: (" + CURRENCY + ")"),
    POWMIN:      find("PoWMin: (" + INTEGER + ")"),
    TIME:        find("Time: (" + TIMESTAMP + ")"),
    MEDIAN_TIME: find("MedianTime: (" + TIMESTAMP + ")"),
    PREV_HASH:   find("PreviousHash: (" + FINGERPRINT + ")"),
    PREV_ISSUER: find("PreviousIssuer: (" + PUBKEY + ")"),
    PARAMETERS:  find("Parameters: (" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ")"),
    JOINER:   exact(PUBKEY + ":" + SIGNATURE + ":" + INTEGER + ":" + FINGERPRINT + ":" + POSITIVE_INT + ":" + USER_ID),
    ACTIVE:   exact(PUBKEY + ":" + SIGNATURE + ":" + INTEGER + ":" + FINGERPRINT + ":" + POSITIVE_INT + ":" + USER_ID),
    LEAVER:   exact(PUBKEY + ":" + SIGNATURE + ":" + INTEGER + ":" + FINGERPRINT + ":" + POSITIVE_INT + ":" + USER_ID),
    EXCLUDED: exact(PUBKEY)
  },
  TRANSACTION: {
    HEADER:  exact("TX:" + POSITIVE_INT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + BOOLEAN),
    SENDER:  exact(PUBKEY),
    SOURCE:  exact(INTEGER + ":(T|D):" + POSITIVE_INT + ":" + FINGERPRINT + ":" + POSITIVE_INT),
    TARGET:  exact(PUBKEY + ":" + POSITIVE_INT),
    COMMENT: find("Comment: (" + COMMENT + ")"),
    INLINE_COMMENT: exact(COMMENT)
  },
  PEER: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK: '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'
  },
  STATUS: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK: '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'
  },
  NETWORK: {
    MAX_CONCURRENT_POST: 3,
    DEFAULT_TIMEOUT: 5000,
    SYNC_LONG_TIMEOUT: 30 * 1000, // 30 seconds
    DEFAULT_PORT: 8999,
    PORT: {
      START: 15000
    },
    UPNP: {
      INTERVAL: 300,
      TTL: 600
    },
    SYNC: {
      MAX: 20
    },
    STATUS_INTERVAL: {
      UPDATE: 10, // Every X blocks
      MAX: 20 // MAX Y blocks
    },
    SYNC_BLOCK_INTERVAL: 1 // Every 1 block average generation time
  },
  PROOF_OF_WORK: {
    EVALUATION: 200,
    RELEASE_MEMORY: 10000
  },

  CONTRACT: {
    DEFAULT: {
      C: 0.007376575,
      DT: 30.4375 * 24 * 3600,
      UD0: 100,
      STEPMAX: 3,
      SIGDELAY: 3600 * 24 * 365 * 5,
      SIGVALIDITY: 3600 * 24 * 365,
      MSVALIDITY: 3600 * 24 * 365,
      SIGQTY: 5,
      SIGWOT: 5,
      PERCENTROT: 2 / 3,
      BLOCKSROT: 20,
      POWDELAY: 10,
      AVGGENTIME: 16 * 60,
      DTDIFFEVAL: 10,
      MEDIANTIMEBLOCKS: 20
    }
  },

  BRANCHES: {
    DEFAULT_WINDOW_SIZE: 10,
    SWITCH_ON_BRANCH_AHEAD_BY: 3
  },

  INVALIDATE_CORE_CACHE: true,
  WITH_SIGNATURES_AND_POW: true,

  SAFE_FACTOR: 1.5,
  BLOCKS_COLLECT_THRESHOLD: 30, // Blocks to collect from memory and persist

  setUDID2Format: function () {
    module.exports.USER_ID = module.exports.UDID2_FORMAT;
    module.exports.CERT.SELF.UID = exact("UID:" + UDID2);
    module.exports.IDENTITY.INLINE = exact(PUBKEY + ":" + SIGNATURE + ":" + TIMESTAMP + ":" + UDID2);
  }
};

function exact (regexpContent) {
  return new RegExp("^" + regexpContent + "$");
}

function find (regexpContent) {
  return new RegExp(regexpContent);
}
