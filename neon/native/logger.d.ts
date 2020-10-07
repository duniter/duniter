/* tslint:disable */

export class RustLogger {

    constructor(home: string, level: string);

    changeLevel(level: string): void;
    error(s: string): void;
    warn(s: string): void;
    info(s: string): void;
    debug(s: string): void;
    trace(s: string): void;
}


