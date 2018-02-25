
export const randomPick = <T>(elements:T[], max:number) => {
  const chosen:T[] = []
  const nbElements = elements.length
  for (let i = 0; i < Math.min(nbElements, max); i++) {
    const randIndex = Math.max(Math.floor(Math.random() * 10) - (10 - nbElements) - i, 0)
    chosen.push(elements[randIndex])
    elements.splice(randIndex, 1)
  }
  return chosen
}