import {LokiCollection} from "./LokiTypes"

export interface LokiDAO {

  enableChangesAPI(): void

  disableChangesAPI(): void

  lokiCollection: LokiCollection<any>
}
