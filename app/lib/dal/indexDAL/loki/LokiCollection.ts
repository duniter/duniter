import {LokiChainableFind, LokiCollection} from "./LokiTypes"
import {NewLogger} from "../../../logger"
import {getMicrosecondsTime} from "../../../../ProcessCpuProfiler"

const logger = NewLogger()

export class LokiProxyCollection<T> implements LokiCollection<T> {

  constructor(public collection:LokiCollection<T>, private collectionName:string) {
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
    // This is a Loki bug: `disableDeltaChangesApi` should be impacted just like `disableChangesApi`:
    ;(this.collection as any).disableDeltaChangesApi = !enabled
  }

  // Returns the real Loki property
  get disableChangesApi() {
    return this.collection.disableChangesApi
  }

  // Returns the real Loki property
  get disableDeltaChangesApi() {
    return this.collection.disableDeltaChangesApi
  }

  get changes() {
    return this.collection.changes
  }

}
