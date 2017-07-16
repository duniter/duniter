import {CFSCore} from "./CFSCore";

export class AbstractCFS {

  protected coreFS:CFSCore
  dal:any

  constructor(rootPath:string, qioFS:any, parentDAL:CFSCore, localDAL:any) {
    this.coreFS = new CFSCore(rootPath, qioFS, parentDAL)
    this.dal = localDAL;
  }
}
