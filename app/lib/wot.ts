const wotb = require('wotb');

export interface WoTBInterface {
  fileInstance: (filepath:string) => any
  memoryInstance: (filepath:string) => any
  setVerbose: (verbose:boolean) => void
}

export const WoTBObject:WoTBInterface = {

  fileInstance: (filepath:string) => wotb.newFileInstance(filepath),
  memoryInstance: () => wotb.newMemoryInstance(),
  setVerbose: wotb.setVerbose
}
