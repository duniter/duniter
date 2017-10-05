
export class Package {

  private json:{ version:string }

  private constructor() {
    this.json = require('../../../package.json')
  }

  get version() {
    return this.json.version
  }

  private static instance:Package

  static getInstance() {
    if (!Package.instance) {
      Package.instance = new Package()
    }
    return Package.instance
  }
}