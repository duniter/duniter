export function reduceConcat<T>(cumulated: T[], arr: T[]) {
  return cumulated.concat(arr)
}

export type GroupResult<T> = { [k:string]: T[] }

export function reduceGroupBy<T, K extends keyof T>(arr: T[], k: K): GroupResult<T> {
  return arr.reduce((cumulated: GroupResult<T>, t: T) => {
    const key: string = String(t[k])
    if (!cumulated[key]) {
      cumulated[key] = []
    }
    cumulated[key].push(t)
    return cumulated
  }, {} as GroupResult<T>)
}
