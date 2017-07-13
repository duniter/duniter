import {TransactionDTO} from "../dto/TransactionDTO"

export class DBTransaction extends TransactionDTO {

  constructor(
    public version: number,
    public currency: string,
    public locktime: number,
    public hash: string,
    public blockstamp: string,
    public issuers: string[],
    public inputs: string[],
    public outputs: string[],
    public unlocks: string[],
    public signatures: string[],
    public comment: string,
    public blockstampTime: number,
    public written: boolean,
    public removed: boolean,
    public block_number: number,
    public time: number,
  ) {
    super(
      version,
      currency,
      locktime,
      hash,
      blockstamp,
      issuers,
      inputs,
      outputs,
      unlocks,
      signatures,
      comment
    )
  }

  static fromTransactionDTO(dto:TransactionDTO, blockstampTime:number, written: boolean, removed: boolean, block_number:number, block_medianTime:number) {
    return new DBTransaction(
      dto.version,
      dto.currency,
      dto.locktime,
      dto.hash,
      dto.blockstamp,
      dto.issuers,
      dto.inputs,
      dto.outputs,
      dto.unlocks,
      dto.signatures,
      dto.comment || "",
      blockstampTime,
      written,
      removed,
      block_number,
      block_medianTime
    )
  }
}