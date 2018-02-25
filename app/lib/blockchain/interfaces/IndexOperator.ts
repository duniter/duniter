"use strict"

export interface IndexOperator {

  initIndexer(pkFields: any): Promise<void>,

  getSubIndexes(): Promise<string[]>,

  findWhere(subIndex: string, criterias: {}): Promise<any[]>,

  findTrimable(subIndex: string, numberField: string, maxNumber: number): Promise<any[]>,

  removeWhere(subIndex: string, criterias: {}): Promise<void>,

  recordIndex(index: any): Promise<void>
}
