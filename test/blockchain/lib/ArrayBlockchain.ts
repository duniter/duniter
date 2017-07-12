import {BlockchainOperator} from "../../../app/lib/blockchain/interfaces/BlockchainOperator"

export class ArrayBlockchain implements BlockchainOperator {

  // The blockchain storage
  private bcArray: any[] = []

  store(b): Promise<any> {
    this.bcArray.push(b)
    return Promise.resolve(b)
  }

  read(i: number): Promise<any> {
    return Promise.resolve(this.bcArray[i])
  }

  head(n: number): Promise<any> {
    const index = Math.max(0, this.bcArray.length - 1 - (n || 0))
    return Promise.resolve(this.bcArray[index])
  }

  height(): Promise<number> {
    return Promise.resolve(this.bcArray.length)
  }

  headRange(m: number): Promise<any[]> {
    const index = Math.max(0, this.bcArray.length - (m || 0))
    return Promise.resolve(this.bcArray.slice(index, this.bcArray.length).reverse())
  }

  revertHead(): Promise<any> {
    const reverted = this.bcArray.pop()
    return Promise.resolve(reverted)
  }
}
