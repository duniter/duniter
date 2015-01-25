
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

module.exports = {
  
  ERROR: {

    PUBKEY: {
      ALREADY_UPDATED: 1
    },
    PEER: {
      ALREADY_RECORDED: 'Peer document is older than currently recorded'
    }
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
    BLOCK: exact(INTEGER + "-" + FINGERPRINT)
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
    EXCLUDED: exact(PUBKEY),
  },
  TRANSACTION: {
    HEADER:  exact("TX:" + POSITIVE_INT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + BOOLEAN),
    SENDER:  exact(PUBKEY),
    SOURCE:  exact(INTEGER + ":(T|D):" + POSITIVE_INT + ":" + FINGERPRINT + ":" + POSITIVE_INT),
    TARGET:  exact(PUBKEY + ":" + POSITIVE_INT),
    COMMENT: find("Comment: (" + COMMENT + ")"),
    INLINE_COMMENT: exact(COMMENT),
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
    PORT: {
      START: 15000
    },
    UPNP: {
      INTERVAL: 150,
      TTL: 300
    },
    SYNC: {
      MAX: 20
    }
  },

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
