import {hashf} from "../common"

export class InputDTO {
  constructor(
    public amount: number,
    public base: number,
    public type: string,
    public identifier: string,
    public pos: number,
    public raw: string
  ) {}
}

export class OutputDTO {
  constructor(
    public amount: number,
    public base: number,
    public conditions: string,
    public raw: string
  ) {}
}

export class TransactionDTO {

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
    public comment?: string
  ) {
    // Compute the hash if not given
    if (!hash) {
      this.hash = this.getHash()
    }
  }

  getHash() {
    const raw = TransactionDTO.toRAW(this)
    return hashf(raw)
  }

  getRawTxNoSig() {
    return TransactionDTO.toRAW(this, true)
  }

  inputsAsObjects(): InputDTO[] {
    return this.inputs.map(input => {
      const [amount, base, type, identifier, pos] = input.split(':')
      return new InputDTO(
        parseInt(amount),
        parseInt(base),
        type,
        identifier,
        parseInt(pos),
        input
      )
    })
  }

  outputsAsObjects(): OutputDTO[] {
    return this.outputs.map(output => {
      const [amount, base, conditions] = output.split(':')
      return new OutputDTO(
        parseInt(amount),
        parseInt(base),
        conditions,
        output
      )
    })
  }

  getCompactVersion() {
    let issuers = this.issuers;
    let raw = ["TX", this.version, issuers.length, this.inputs.length, this.unlocks.length, this.outputs.length, this.comment ? 1 : 0, this.locktime || 0].join(':') + '\n';
    raw += this.blockstamp + "\n";
    (issuers || []).forEach((issuer) => {
      raw += issuer + '\n';
    });
    (this.inputs || []).forEach((input) => {
      raw += input + '\n';
    });
    (this.unlocks || []).forEach((input) => {
      raw += input + '\n';
    });
    (this.outputs || []).forEach((output) => {
      raw += output + '\n';
    });
    if (this.comment)
      raw += this.comment + '\n';
    (this.signatures || []).forEach((signature) => {
      raw += signature + '\n'
    })
    return raw
  }

  static fromJSONObject(obj:any) {
    return new TransactionDTO(
      obj.version,
      obj.currency,
      obj.locktime,
      obj.hash,
      obj.blockstamp,
      obj.issuers,
      obj.inputs,
      obj.outputs,
      obj.unlocks,
      obj.signatures,
      obj.comment
    )
  }

  static toRAW(json:TransactionDTO, noSig = false) {
    let raw = ""
    raw += "Version: " + (json.version) + "\n"
    raw += "Type: Transaction\n"
    raw += "Currency: " + json.currency + "\n"
    raw += "Blockstamp: " + json.blockstamp + "\n"
    raw += "Locktime: " + json.locktime + "\n"
    raw += "Issuers:\n";
    (json.issuers || []).forEach((issuer) => {
      raw += issuer + '\n'
    })
    raw += "Inputs:\n";
    (json.inputs || []).forEach((input) => {
      raw += input + '\n'
    })
    raw += "Unlocks:\n";
    (json.unlocks || []).forEach((unlock) => {
      raw += unlock + '\n'
    })
    raw += "Outputs:\n";
    (json.outputs  || []).forEach((output) => {
      raw += output + '\n'
    })
    raw += "Comment: " + (json.comment || "") + "\n";
    if (!noSig) {
      (json.signatures || []).forEach((signature) => {
        raw += signature + '\n'
      })
    }
    return raw
  }
}