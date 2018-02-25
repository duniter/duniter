import {AbstractCFS} from "./AbstractCFS"

export class PowDAL extends AbstractCFS {

  private static POW_FILE = "pow.txt"

  constructor(rootPath:string, qioFS:any) {
    super(rootPath, qioFS)
  }

  init() {
    return this.coreFS.remove(PowDAL.POW_FILE, false).catch(() => {})
  }

  async getCurrent() {
    return await this.coreFS.read(PowDAL.POW_FILE);
  }

  async writeCurrent(current:string) {
    await this.coreFS.write(PowDAL.POW_FILE, current, false);
  }
}
