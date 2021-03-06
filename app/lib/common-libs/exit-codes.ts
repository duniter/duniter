export enum ExitCodes {
  OK = 0,
  UNHANDLED_ERROR = 1,
  UNCAUGHT_EXCEPTION = 2,
  SIGINT = 3,
  DUNITER_NOT_RUNNING = 4,
  SYNC_FAIL = 50,
  FORCE_CLOSE_AFTER_ERROR = 100,
  MINDEX_WRITING_ERROR = 500,
}
