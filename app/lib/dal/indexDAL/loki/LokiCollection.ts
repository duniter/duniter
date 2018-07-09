import {LokiChainableFind, LokiCollection} from "./LokiTypes"
import {NewLogger} from "../../../logger"
import {getMicrosecondsTime} from "../../../../ProcessCpuProfiler"

const logger = NewLogger()

export class LokiProxyCollection<T> implements LokiCollection<T> {

  constructor(private collection:LokiCollection<T>, private collectionName:string) {
  }

  get data() {
    return this.collection.data
  }

  length(): number {
    return this.collection.data.length
  }

  insert(entity:T) {
    this.collection.insert(entity)
  }

  remove(entity:T) {
    this.collection.remove(entity)
  }

  find(criterion:{ [t in keyof T|'$or'|'$and']?: any }) {
    const now = getMicrosecondsTime()
    const res = this.collection.find(criterion)
    // logger.trace('[loki][%s][find] %sµs', this.collectionName, getDurationInMicroSeconds(now), criterion)
    return res
  }

  chain(): LokiChainableFind<T> {
    return this.collection.chain()
  }

  setChangesApi(enabled: boolean) {
    this.collection.setChangesApi(enabled)
    ;(this.collection as any).disableDeltaChangesApi = true
  }
}
