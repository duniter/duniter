const common = require('duniter-common')

export function hashf(str:string) {
  return common.hashf(str).toUpperCase()
}
