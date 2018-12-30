
const _underscore_ = require("underscore")

export interface Map<T> {
  [k:string]: T
}

export interface UnderscoreClass<T> {
  filter(filterFunc: (t: T) => boolean): UnderscoreClass<T>
  where(props: { [k in keyof T]?: T[k] }): UnderscoreClass<T>
  sortBy(sortFunc:(element:T) => number): UnderscoreClass<T>
  pluck<K extends keyof T>(k:K): UnderscoreClass<T>
  uniq<K extends keyof T>(isSorted?:boolean, iteratee?:(t:T) => K): UnderscoreClass<T>
  value(): T[]
}

export const Underscore = {

  filter: <T>(elements:T[], filterFunc: (t:T) => boolean): T[] => {
    return _underscore_.filter(elements, filterFunc)
  },

  where: <T>(elements:T[], props: { [k in keyof T]?: T[k] }): T[] => {
    return _underscore_.where(elements, props)
  },

  findWhere: <T>(elements:T[], props: { [k in keyof T]?: T[k] }): T|null => {
    return _underscore_.findWhere(elements, props)
  },

  keys: <T>(map:T): (keyof T)[] => {
    return _underscore_.keys(map)
  },

  values: <T>(map:{ [k:string]: T }): T[] => {
    return _underscore_.values(map)
  },

  pluck: <T, K extends keyof T>(elements:T[], k:K): T[K][] => {
    return _underscore_.pluck(elements, k)
  },

  pick: <T, K extends keyof T>(elements:T, ...k:K[]): T[K][] => {
    return _underscore_.pick(elements, ...k)
  },

  omit: <T, K extends keyof T>(element:T, ...k:K[]): T[K][] => {
    return _underscore_.omit(element, ...k)
  },

  uniq: <T, K>(elements:T[], isSorted:boolean = false, iteratee?:(t:T) => K): T[] => {
    return _underscore_.uniq(elements, isSorted, iteratee)
  },

  clone: <T>(t:T): T => {
    return _underscore_.clone(t)
  },

  mapObject: <T, K extends keyof T, L extends keyof (T[K])>(t:T, cb:(k:K) => (T[K])[L]): Map<T[K][L]> => {
    return _underscore_.mapObject(t, cb)
  },

  mapObjectByProp: <T, K extends keyof T, L extends keyof (T[K])>(t:T, prop:L): Map<T[K][L]> => {
    return _underscore_.mapObject(t, (o:T[K]) => o[prop])
  },

  sortBy: <T, K extends keyof T>(elements:T[], sortFunc:((element:T) => number|string)|K): T[] => {
    return _underscore_.sortBy(elements, sortFunc)
  },

  difference: <T>(array1:T[], array2:T[]): T[] => {
    return _underscore_.difference(array1, array2)
  },

  shuffle: <T>(elements:T[]): T[] => {
    return _underscore_.shuffle(elements)
  },

  extend: <T, U>(t1:T, t2:U): T|U => {
    return _underscore_.extend(t1, t2)
  },

  range: (count:number, end?:number): number[] => {
    return _underscore_.range(count, end)
  },

  chain: <T>(element:T[]): UnderscoreClass<T> => {
    return _underscore_.chain(element)
  },
}
