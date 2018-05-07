const _ = require("underscore")

export const Underscore = {

  filter: <T>(elements:T[], filterFunc: (t:T) => boolean): T[] => {
    return _.filter(elements, filterFunc)
  },

  where: <T>(elements:T[], props: { [k in keyof T]?: T[k] }): T[] => {
    return _.where(elements, props)
  },

  keys: <T>(map:T): (keyof T)[] => {
    return _.keys(map)
  },

  values: <T>(map:{ [k:string]: T }): T[] => {
    return _.values(map)
  },

  pluck: <T, K extends keyof T>(elements:T[], k:K): T[K][] => {
    return _.pluck(elements, k)
  },

  uniq: <T>(elements:T[]): T[] => {
    return _.uniq(elements)
  }
}
