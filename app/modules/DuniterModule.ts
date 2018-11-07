import {Server} from "../../server"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {ProgramOptions} from "../lib/common-libs/programOptions"
import {ConfDAL} from "../lib/dal/fileDALs/ConfDAL"
import {DuniterService, ReadableDuniterService, Stack, TransformableDuniterService} from "../../index"

export interface DuniterModule {
  name: string
  required: {
    duniter: DuniterDependency
  }
}

export interface DuniterDependency {
  cliOptions?: CliOption[]
  cli?: CliCommand[]
  config?: {
    onLoading: (conf: ConfDTO, program: ProgramOptions, logger:any, confDAL: ConfDAL) => void
    beforeSave: (conf: ConfDTO, program: ProgramOptions, logger:any, confDAL: ConfDAL) => void
  }
  onReset?: {
    data?: (conf: ConfDTO, program: ProgramOptions, logger:any, confDAL: ConfDAL) => void
    config?: (conf: ConfDTO, program: ProgramOptions, logger:any, confDAL: ConfDAL) => void
  }
  wizard?: {
    [k: string]: (conf: ConfDTO, program: ProgramOptions, logger:any) => Promise<void>
  }
  service?: {
    input?: (server: Server, conf: ConfDTO, logger:any) => ReadableDuniterService
    process?: (server: Server, conf: ConfDTO, logger:any) => TransformableDuniterService
    output?: (server: Server, conf: ConfDTO, logger:any) => TransformableDuniterService
    neutral?: (server: Server, conf: ConfDTO, logger:any) => DuniterService
  }
}

export interface CliOption {
  value: string
  desc: string
  parser?: (parameter: string) => any
}

export interface CliCommand {
  name: string
  desc: string
  logs?: boolean
  preventIfRunning?: boolean
  onConfiguredExecute?: (server: Server, conf: ConfDTO, program: ProgramOptions, params: string[], wizardTasks: any, stack: Stack) => Promise<any>
  onDatabaseExecute?: (server: Server, conf: ConfDTO, program: ProgramOptions, params: string[],
                       startServices: () => Promise<void>,
                       stopServices: () => Promise<void>,
                       stack: Stack
  ) => Promise<void>
}
