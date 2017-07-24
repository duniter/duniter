const common = require('../../app/common')

export function hashf(str:string) {
  return common.hashf(str).toUpperCase()
}
