export class CertificationDTO {

  constructor(
    public pubkey: string,
    public to: string,
    public block_number: number,
    public sig: string
  ) {}

  static fromInline(inline:string): CertificationDTO {
    const [pubkey, to, block_number, sig]: string[] = inline.split(':')
    return new CertificationDTO(pubkey, to, parseInt(block_number), sig)
  }
}