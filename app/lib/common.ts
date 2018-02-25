import * as crypto from 'crypto'

export const hashf = function hashf(str:string) {
  return crypto
    .createHash("sha256")
    .update(str)
    .digest("hex")
    .toUpperCase()
}
