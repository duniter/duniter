import {CommonConstants} from "../../../lib/common-libs/constants"

export const CrawlerConstants = {

  PEER_LONG_DOWN: 3600 * 24 * 2, // 48h
  SYNC_LONG_TIMEOUT: 30 * 1000, // 30 seconds
  DEFAULT_TIMEOUT: 10 * 1000, // 10 seconds

  TRANSACTION_VERSION: CommonConstants.TRANSACTION_VERSION,
  FORK_ALLOWED: true,
  MAX_NUMBER_OF_PEERS_FOR_PULLING: 4,
  PULLING_MINIMAL_DELAY: 120,
  CRAWL_BLOCK_CHUNK: 50, // During a crawl, the quantity of blocks to download
  CRAWL_PEERS_COUNT: 4,
  PULLING_INTERVAL_TARGET: 600,
  COUNT_FOR_ENOUGH_PEERS: 4,
  SANDBOX_FIRST_PULL_DELAY: 1000 * 60 * 10, // milliseconds
  SANDBOX_PEERS_COUNT: 2,
  SANDBOX_CHECK_INTERVAL: 48, // Every 4 hours (288 blocks a day / 24 * 4)
  TEST_PEERS_INTERVAL: 10, // In seconds
  SYNC_PEERS_INTERVAL: 3, // Every 3 block average generation time

  DURATIONS: {
    TEN_SECONDS: 10,
    A_MINUTE: 60,
    TEN_MINUTES: 600,
    AN_HOUR: 3600,
    A_DAY: 3600 * 24,
    A_WEEK: 3600 * 24 * 7,
    A_MONTH: (3600 * 24 * 365.25) / 12
  },

  ERRORS: {
    NEWER_PEER_DOCUMENT_AVAILABLE:        { httpCode: 409, uerr: { ucode: 2022, message: "A newer peer document is available" }},
  },

  ERROR: {
    PEER: {
      UNKNOWN_REFERENCE_BLOCK: 'Unknown reference block of peer'
    }
  }
}