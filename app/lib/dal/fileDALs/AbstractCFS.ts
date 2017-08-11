import {CFSCore} from "./CFSCore";

export class AbstractCFS {

  protected coreFS:CFSCore
  protected dal:any

  constructor(rootPath:string, qioFS:any) {
    this.coreFS = new CFSCore(rootPath, qioFS)
  }
}
