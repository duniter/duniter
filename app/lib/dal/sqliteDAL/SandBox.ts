import {DBDocument} from './DocumentDAL';

export class SandBox<T extends DBDocument> {

  maxSize:number
  
  constructor(
    maxSize:number,
    public findElements:() => Promise<T[]>,
    public compareElements:(t1:T, t2:T) => number
  ) {
    this.maxSize = maxSize || 10
  }
  
  async acceptNewSandBoxEntry(element:T, pubkey:string) {
    // Accept any document which has the exception pubkey (= the node pubkey)
    if (element.pubkey === pubkey
      || element.from === pubkey
      || element.issuer === pubkey
      || (element.issuers !== undefined && element.issuers.indexOf(pubkey) !== -1)) {
      return true;
    }
    const elements = await this.findElements()
    if (elements.length < this.maxSize) {
      return true;
    }
    const lowestElement:T = elements[elements.length - 1];
    const comparison = this.compareElements(element, lowestElement)
    return comparison > 0;
  }

  async getSandboxRoom() {
    const elems = await this.findElements()
    return this.maxSize - elems.length;
  }
}
