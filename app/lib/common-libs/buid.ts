"use strict";
const BLOCK_UID = /^(0|[1-9]\d{0,18})-[A-F0-9]{64}$/;

const buidFunctions:any = function(number:number, hash:string) {
  if (arguments.length === 2) {
    return [number, hash].join('-');
  }
  if (arguments[0]) {
    return [arguments[0].number, arguments[0].hash].join('-');
  }
  return '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
}

buidFunctions.fromTS = (line:string) => {
  const match = line.match(/TS:(.*)/)
  return (match && match[1]) || ""
}
buidFunctions.fromIdty = (idty:any) => {
  return buidFunctions(idty.ts_number, idty.ts_hash)
}

export const Buid = {

  format: {

    isBuid: (value:any) => {
      return (typeof value === 'string') && value.match(BLOCK_UID) ? true : false;
    },

    buid: buidFunctions
  },

  getBlockstamp: (block:{ number:number, hash:string }) => {
    return [block.number, block.hash].join('-')
  }
};
