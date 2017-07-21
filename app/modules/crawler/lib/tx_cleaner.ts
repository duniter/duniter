export const tx_cleaner = (txs:any) =>

  // Remove unused signatories - see https://github.com/duniter/duniter/issues/494
  txs.forEach((tx:any) => {
    if (tx.signatories) {
      delete tx.signatories
    }
    return tx
  })
