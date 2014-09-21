
var META_TS      = "META:TS:[1-9][0-9]*";
var UDID2        = "udid2;c;([A-Z-]*);([A-Z-]*);(\\d{4}-\\d{2}-\\d{2});(e\\+\\d{2}\\.\\d{2}(\\+|-)\\d{3}\\.\\d{2});(\\d+)(;?)";
var USER_ID      = "[A-Za-z0-9_-]*";
var BASE58       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+";
var PUBKEY       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}";
var TIMESTAMP    = "[1-9][0-9]*";
var POSITIVE_INT = "[1-9][0-9]*";
var INTEGER      = "\\d+";
var SIGNATURE    = "[A-Za-z0-9+\\/=]{87,88}";
var FINGERPRINT  = "[A-F0-9]{40}";

module.exports = {

  ERROR: {

    PUBKEY: {
      ALREADY_UPDATED: 1
    }
  },

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
    OTHER: {
      META: exact(META_TS),
      INLINE: exact(PUBKEY + ":" + PUBKEY + ":" + TIMESTAMP + ":" + SIGNATURE)
    }
  },
  IDENTITY: {
    INLINE: exact(PUBKEY + ":" + SIGNATURE + ":" + TIMESTAMP + ":" + USER_ID)
  },
  BLOCK: {
    JOINER: exact(PUBKEY + ":" + SIGNATURE + ":" + TIMESTAMP),
    LEAVER: exact(PUBKEY + ":" + SIGNATURE + ":" + TIMESTAMP),
    EXCLUDED: exact(PUBKEY),
  },
  TRANSACTION: {
    HEADER: exact("TX:" + POSITIVE_INT + ":" + POSITIVE_INT + ":" + POSITIVE_INT + ":" + POSITIVE_INT),
    SENDER: exact(PUBKEY),
    SOURCE: exact(INTEGER + ":(T|D|F):" + FINGERPRINT),
    TARGET: exact(PUBKEY + ":" + POSITIVE_INT)
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
