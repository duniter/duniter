"use strict";

var CURRENCY     = "[a-zA-Z0-9-_ ]+";
var UDID2        = "udid2;c;([A-Z-]*);([A-Z-]*);(\\d{4}-\\d{2}-\\d{2});(e\\+\\d{2}\\.\\d{2}(\\+|-)\\d{3}\\.\\d{2});(\\d+)(;?)";
var USER_ID      = "[A-Za-z0-9_-]*";
var BASE58       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+";
var PUBKEY       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}";
var TIMESTAMP    = "[1-9][0-9]*";
var POSITIVE_INT = "[1-9][0-9]*";
var DIVIDEND     = "[1-9][0-9]{0,5}";
var ZERO_OR_POSITIVE_INT = "0|[1-9][0-9]*";
var INTEGER      = "(0|[1-9]\\d*)";
var FLOAT        = "\\d+\.\\d+";
var BOOLEAN      = "[01]";
var SIGNATURE    = "[A-Za-z0-9+\\/=]{87,88}";
var FINGERPRINT  = "[A-F0-9]{64}";
var COMMENT      = "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]{0,255}";
var UNLOCK       = "(SIG\\(" + INTEGER + "\\)|XHX\\(" + INTEGER + "\\))";
var CONDITIONS   = "(&&|\\|\\|| |[()]|(SIG\\([0-9a-zA-Z]{44,45}\\)|(XHX\\([A-F0-9]{64}\\))))*";
//var CONDITIONS   = "(&&|\|\|| |[()]|(SIG\\(\\da-zA-Z\\))|(XHX\\(" + FINGERPRINT + "\\)))*";
var BLOCK_UID    = INTEGER + "-" + FINGERPRINT;
var META_TS      = "META:TS:" + BLOCK_UID;

var IPV4_REGEXP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
var IPV6_REGEXP = /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/;

module.exports = {
  
  ERROR: {

    PEER: {
      ALREADY_RECORDED: 'A more recent peering document is already recorded.',
      UNKNOWN_REFERENCE_BLOCK: 'Unknown reference block of peer'
    },

    BLOCK: {
      NO_CURRENT_BLOCK: 'No current block'
    }
  },

  ERRORS: {

    // Technical errors
    UNKNOWN:                              { httpCode: 500, uerr: { ucode: 1001, message: "An unknown error occured" }},
    UNHANDLED:                            { httpCode: 500, uerr: { ucode: 1002, message: "An unhandled error occured" }},
    SIGNATURE_DOES_NOT_MATCH:             { httpCode: 400, uerr: { ucode: 1003, message: "Signature does not match" }},
    ALREADY_UP_TO_DATE:                   { httpCode: 400, uerr: { ucode: 1004, message: "Already up-to-date" }},
    WRONG_DOCUMENT:                       { httpCode: 400, uerr: { ucode: 1005, message: "Document has unkown fields or wrong line ending format" }},

    HTTP_PARAM_PUBKEY_REQUIRED:           { httpCode: 400, uerr: { ucode: 1101, message: "Parameter `pubkey` is required" }},
    HTTP_PARAM_IDENTITY_REQUIRED:         { httpCode: 400, uerr: { ucode: 1102, message: "Parameter `identity` is required" }},
    HTTP_PARAM_PEER_REQUIRED:             { httpCode: 400, uerr: { ucode: 1103, message: "Requires a peer" }},
    HTTP_PARAM_BLOCK_REQUIRED:            { httpCode: 400, uerr: { ucode: 1104, message: "Requires a block" }},
    HTTP_PARAM_MEMBERSHIP_REQUIRED:       { httpCode: 400, uerr: { ucode: 1105, message: "Requires a membership" }},
    HTTP_PARAM_TX_REQUIRED:               { httpCode: 400, uerr: { ucode: 1106, message: "Requires a transaction" }},
    HTTP_PARAM_SIG_REQUIRED:              { httpCode: 400, uerr: { ucode: 1107, message: "Parameter `sig` is required" }},
    HTTP_PARAM_CERT_REQUIRED:             { httpCode: 400, uerr: { ucode: 1108, message: "Parameter `cert` is required" }},
    HTTP_PARAM_REVOCATION_REQUIRED:       { httpCode: 400, uerr: { ucode: 1109, message: "Parameter `revocation` is required" }},

    // Business errors
    NO_MATCHING_IDENTITY:                 { httpCode: 404, uerr: { ucode: 2001, message: "No matching identity" }},
    UID_ALREADY_USED:                     { httpCode: 400, uerr: { ucode: 2002, message: "UID already used in the blockchain" }},
    PUBKEY_ALREADY_USED:                  { httpCode: 400, uerr: { ucode: 2003, message: "Pubkey already used in the blockchain" }},
    NO_MEMBER_MATCHING_PUB_OR_UID:        { httpCode: 404, uerr: { ucode: 2004, message: "No member matching this pubkey or uid" }},
    SELF_PEER_NOT_FOUND:                  { httpCode: 404, uerr: { ucode: 2005, message: "Self peering was not found" }},
    WRONG_SIGNATURE_MEMBERSHIP:           { httpCode: 400, uerr: { ucode: 2006, message: "wrong signature for membership" }},
    ALREADY_RECEIVED_MEMBERSHIP:          { httpCode: 400, uerr: { ucode: 2007, message: "Already received membership" }},
    MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE: { httpCode: 400, uerr: { ucode: 2008, message: "A non-member cannot leave" }},
    NOT_A_MEMBER:                         { httpCode: 400, uerr: { ucode: 2009, message: "Not a member" }},
    NO_CURRENT_BLOCK:                     { httpCode: 404, uerr: { ucode: 2010, message: "No current block" }},
    BLOCK_NOT_FOUND:                      { httpCode: 404, uerr: { ucode: 2011, message: "Block not found" }},
    PEER_NOT_FOUND:                       { httpCode: 404, uerr: { ucode: 2012, message: "Peer not found" }},
    WRONG_UNLOCKER:                       { httpCode: 400, uerr: { ucode: 2013, message: "Wrong unlocker in transaction" }},
    LOCKTIME_PREVENT:                     { httpCode: 400, uerr: { ucode: 2014, message: "Locktime not elapsed yet" }},
    SOURCE_ALREADY_CONSUMED:              { httpCode: 400, uerr: { ucode: 2015, message: "Source already consumed" }},
    WRONG_AMOUNTS:                        { httpCode: 400, uerr: { ucode: 2016, message: "Sum of inputs must equal sum of outputs" }},
    WRONG_OUTPUT_BASE:                    { httpCode: 400, uerr: { ucode: 2017, message: "Wrong unit base for outputs" }}
  },

  DEBUG: {
    LONG_DAL_PROCESS: 50
  },

  IPV4_REGEXP: IPV4_REGEXP,
  IPV6_REGEXP: IPV6_REGEXP,

  SALT: exact(".+"),
  PASSWORD: exact(".*"),

  INTEGER: /^\d+$/,
  FINGERPRINT: exact(FINGERPRINT),
  TIMESTAMP: exact(TIMESTAMP),
  USER_ID: exact(USER_ID), // Any format, by default
  UDID2_FORMAT: exact(UDID2),
  BASE58: exact(BASE58),
  PUBLIC_KEY: exact(PUBKEY),
  SIG: exact(SIGNATURE),
  BLOCK_UID: exact(BLOCK_UID),

  DOCUMENTS_VERSION_REGEXP: /^2$/,
  DOCUMENTS_VERSION: 2,

  REVOCATION_FACTOR: 2, // This is protocol fixed value
  NB_DIGITS_UD: 6,      // This is protocol fixed value
  FIRST_UNIT_BASE: 0,

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
    INLINE: exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + USER_ID),
    IDTY_TYPE:      find('Type: (Identity)'),
    IDTY_UID:       find('UniqueID: (' + USER_ID + ')')
  },
  DOCUMENTS: {
    DOC_VERSION:    find('Version: (2)'),
    DOC_CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    DOC_ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    TIMESTAMP:      find('Timestamp: (' + BLOCK_UID + ')')
  },
  CERTIFICATION: {
    CERT_TYPE:      find('Type: (Certification)'),
    IDTY_ISSUER:    find('IdtyIssuer: (' + PUBKEY + ')'),
    IDTY_UID:       find('IdtyUniqueID: (' + USER_ID + ')'),
    IDTY_TIMESTAMP: find('IdtyTimestamp: (' + BLOCK_UID + ')'),
    IDTY_SIG:       find('IdtySignature: (' + SIGNATURE + ')'),
    CERT_TIMESTAMP: find('CertTimestamp: (' + BLOCK_UID + ')')
  },
  REVOCATION: {
    REVOC_TYPE:      find('Type: (Certification)'),
    IDTY_ISSUER:     find('IdtyIssuer: (' + PUBKEY + ')'),
    IDTY_UID:        find('IdtyUniqueID: (' + USER_ID + ')'),
    IDTY_TIMESTAMP:  find('IdtyTimestamp: (' + BLOCK_UID + ')'),
    IDTY_SIG:        find('IdtySignature: (' + SIGNATURE + ')')
  },
  MEMBERSHIP: {
    BLOCK:      find('Block: (' + BLOCK_UID + ')'),
    VERSION:    find('Version: (2)'),
    CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    MEMBERSHIP: find('Membership: (IN|OUT)'),
    USERID:     find('UserID: (' + USER_ID + ')'),
    CERTTS:     find('CertTS: (' + BLOCK_UID + ')')
  },
  BLOCK: {
    NONCE:       find("Nonce: (" + ZERO_OR_POSITIVE_INT + ")"),
    VERSION:     find("Version: (2)"),
    TYPE:        find("Type: (Block)"),
    CURRENCY:    find("Currency: (" + CURRENCY + ")"),
    BNUMBER:     find("Number: (" + ZERO_OR_POSITIVE_INT + ")"),
    POWMIN:      find("PoWMin: (" + ZERO_OR_POSITIVE_INT + ")"),
    TIME:        find("Time: (" + TIMESTAMP + ")"),
    MEDIAN_TIME: find("MedianTime: (" + TIMESTAMP + ")"),
    UD:          find("UniversalDividend: (" + DIVIDEND + ")"),
    UNIT_BASE:   find("UnitBase: (" + INTEGER + ")"),
    PREV_HASH:   find("PreviousHash: (" + FINGERPRINT + ")"),
    PREV_ISSUER: find("PreviousIssuer: (" + PUBKEY + ")"),
    MEMBERS_COUNT:find("MembersCount: (" + ZERO_OR_POSITIVE_INT + ")"),
    BLOCK_ISSUER:find('Issuer: (' + PUBKEY + ')'),
    PARAMETERS:  find("Parameters: (" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ")"),
    JOINER:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    ACTIVE:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    LEAVER:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    REVOCATION: exact(PUBKEY + ":" + SIGNATURE),
    EXCLUDED: exact(PUBKEY),
    INNER_HASH: find("InnerHash: (" + FINGERPRINT + ")")
  },
  TRANSACTION: {
    HEADER:  exact("TX:" + POSITIVE_INT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + BOOLEAN + ":" + INTEGER),
    SENDER:  exact(PUBKEY),
    SOURCE:  exact("(T:" + FINGERPRINT + ":" + INTEGER + "|D:" + PUBKEY + ":" + POSITIVE_INT + ")"),
    UNLOCK:  exact(INTEGER + ":" + UNLOCK + "( (" + UNLOCK + "))*"),
    TARGET:  exact(POSITIVE_INT + ":" + INTEGER + ":" + CONDITIONS),
    COMMENT: find("Comment: (" + COMMENT + ")"),
    LOCKTIME:find("Locktime: (" + INTEGER + ")"),
    INLINE_COMMENT: exact(COMMENT)
  },
  PEER: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
  },
  STATUS: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
  },
  NETWORK: {
    MAX_NON_MEMBERS_TO_FORWARD_TO: 3,
    MAX_MEMBERS_TO_FORWARD_TO: 5,
    COUNT_FOR_ENOUGH_PEERS: 4,
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
      UPDATE: 6, // Every X blocks
      MAX: 20 // MAX Y blocks
    },
    SYNC_PEERS_INTERVAL: 3, // Every 3 block average generation time
    SYNC_BLOCK_INTERVAL: 1, // Every 1 block average generation time
    TEST_PEERS_INTERVAL: 10 // In seconds
  },
  PROOF_OF_WORK: {
    EVALUATION: 200,
    RELEASE_MEMORY: 10000,
    UPPER_BOUND: {
      LEVEL_0: '9A-F',
      LEVEL_1: '7',
      LEVEL_2: '3',
      LEVEL_3: '1'
    }
  },

  DURATIONS: {
    TEN_SECONDS: 10,
    A_MINUTE: 60,
    TEN_MINUTES: 600,
    AN_HOUR: 3600,
    A_DAY: 3600 * 24,
    A_WEEK: 3600 * 24 * 7,
    A_MONTH: (3600 * 24 * 365.25) / 12
  },

  CONTRACT: {
    DEFAULT: {
      C: 0.007376575,
      DT: 30.4375 * 24 * 3600,
      UD0: 100,
      STEPMAX: 3,
      SIGDELAY: 3600 * 24 * 365 * 5,
      SIGPERIOD: 0, // Instant
      SIGSTOCK: 40,
      SIGWINDOW: 3600, // 2h
      SIGVALIDITY: 3600 * 24 * 365,
      MSVALIDITY: 3600 * 24 * 365,
      SIGQTY: 5,
      X_PERCENT: 0.9,
      PERCENTROT: 2 / 3,
      BLOCKSROT: 20,
      POWDELAY: 10,
      AVGGENTIME: 16 * 60,
      DTDIFFEVAL: 10,
      MEDIANTIMEBLOCKS: 20
    },

    DSEN_P: 1.2 // dSen proportional factor
  },

  BRANCHES: {
    DEFAULT_WINDOW_SIZE: 100,
    SWITCH_ON_BRANCH_AHEAD_BY: 3
  },

  INVALIDATE_CORE_CACHE: true,
  WITH_SIGNATURES_AND_POW: true,

  MEMORY_CLEAN_INTERVAL: 60 * 60, // hourly
  SAFE_FACTOR: 3,
  BLOCKS_COLLECT_THRESHOLD: 30 // Blocks to collect from memory and persist
};

function exact (regexpContent) {
  return new RegExp("^" + regexpContent + "$");
}

function find (regexpContent) {
  return new RegExp(regexpContent);
}
