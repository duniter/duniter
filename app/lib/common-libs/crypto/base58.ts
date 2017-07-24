const bs58 = require('bs58')

export const Base58encode = (bytes:any) => bs58.encode(bytes)

export const Base58decode = (data:any) => new Uint8Array(bs58.decode(data))
