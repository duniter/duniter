export const ProverConstants = {

  CORES_MAXIMUM_USE_IN_PARALLEL: 8,

  MINIMAL_ZEROS_TO_SHOW_IN_LOGS: 3,

  POW_MINIMAL_TO_SHOW: 2,
  DEFAULT_CPU: 0.6,
  DEFAULT_PEER_ID: 1,
  MIN_PEER_ID: 1,
  MAX_PEER_ID: 899, // Due to MAX_SAFE_INTEGER = 9007199254740991 (16 digits, and we use 11 digits for the nonce + 2 digits for core number => 3 digits for the peer, must be below 900)

  NONCE_RANGE: 1000 * 1000 * 1000 * 100,

  POW_MAXIMUM_ACCEPTABLE_HANDICAP: 64,
  POW_NB_PAUSES_PER_ROUND: 10,

  // When to trigger the PoW process again if no PoW is triggered for a while. In milliseconds.
  POW_SECURITY_RETRY_DELAY: 10 * 60 * 1000
}
