/* tslint:disable */

import { TransactionDTOV10 } from './transaction';

export class Event {
    event: string;
    data: TransactionDTOV10[];
}

export class RustEventEmitter {
    constructor()

    poll(cb: (err: any, event: Event) => void): void
}
