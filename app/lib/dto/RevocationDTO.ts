export class RevocationDTO {

  constructor(
    public pubkey: string,
    public sig: string
  ) {}

  static fromInline(inline:string): RevocationDTO {
    const [pubkey, sig] = inline.split(':')
    return new RevocationDTO(pubkey, sig)
  }
}