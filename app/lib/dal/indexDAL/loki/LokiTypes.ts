
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

  limit(l:number): LokiChainableFind<T>

  update(cb:(t:T) => void): LokiChainableFind<T>

  where(filter:(t:T) => boolean): LokiChainableFind<T>

  remove(): LokiChainableFind<T>

  compoundsort(sort:((string|((string|boolean)[]))[])): LokiChainableFind<T>

  data(): T[]
}