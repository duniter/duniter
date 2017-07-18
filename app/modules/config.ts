"use strict";
import {ConfDTO} from "../lib/dto/ConfDTO"

module.exports = {
  duniter: {
    cli: [{
      name: 'config',
      desc: 'Register configuration in database',
      // The command does nothing particular, it just stops the process right after configuration phase is over
      onConfiguredExecute: (server:any, conf:ConfDTO) => Promise.resolve(conf)
    }]
  }
}
