
export interface LokiCollection<T> {

  data: T[]

  length(): number

  insert(entity:T): void

  remove(entity:T): void

  find(criterion:{ [t in keyof T|'$or'|'$and']?: any }): T[]

  chain(): LokiChainableFind<T>
}

export interface LokiChainableFind<T> {

  find(criterion:{ [t in keyof T|'$or'|'$and']?: any }): LokiChainableFind<T>

  simplesort(prop:keyof T, desc?:boolean): LokiChainableFind<T>

  remove(): LokiChainableFind<T>

  data(): T[]
}