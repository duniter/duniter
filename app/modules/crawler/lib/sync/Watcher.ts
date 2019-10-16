import * as events from "events"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {P2pCandidate} from "./p2p/p2p-candidate"

const multimeter   = require('multimeter')

export interface Watcher {
  writeStatus(str: string): void
  downloadPercent(pct?: number): number
  storagePercent(pct?: number): number
  appliedPercent(pct?: number): number
  sbxPercent(pct?: number): number
  peersPercent(pct?: number): number
  end(): void

  reserveNodes(nodesAvailable: P2pCandidate[]): void

  unableToDownloadChunk(chunkIndex: number): void

  gettingChunk(chunkIndex: number, candidates: P2pCandidate[]): void

  gotChunk(chunkIndex: number, node: P2pCandidate): void

  failToGetChunk(chunkIndex: number, node: P2pCandidate): void

  wantToDownload(chunkIndex: number): void

  addWrongChunkFailure(chunkIndex: number, lastSupplier: P2pCandidate): void

  wantToLoad(chunkIndex: number): void

  beforeReadyNodes(p2pCandidates: P2pCandidate[]): void

  syncFailNoNodeFound(): void

  syncFailCannotConnectToRemote(): void
}

export type EventName = 'downloadChange'|'storageChange'|'appliedChange'|'sbxChange'|'peersChange'
  | 'addWrongChunkFailure'
  | 'failToGetChunk'
  | 'gettingChunk'
  | 'gotChunk'
  | 'reserveNodes'
  | 'unableToDownloadChunk'
  | 'wantToDownload'
  | 'wantToLoad'
  | 'beforeReadyNodes'
  | 'syncFailNoNodeFound'
  | 'syncFailCannotConnectToRemote'

export class EventWatcher extends events.EventEmitter implements Watcher {

  constructor(private innerWatcher:Watcher) {
    super()
  }

  writeStatus(str: string): void {
    this.innerWatcher.writeStatus(str)
  }

  downloadPercent(pct?: number): number {
    return this.change('downloadChange', (pct) => this.innerWatcher.downloadPercent(pct), pct)
  }

  storagePercent(pct?: number): number {
    return this.change('storageChange', (pct) => this.innerWatcher.storagePercent(pct), pct)
  }

  appliedPercent(pct?: number): number {
    return this.change('appliedChange', (pct) => this.innerWatcher.appliedPercent(pct), pct)
  }

  sbxPercent(pct?: number): number {
    return this.change('sbxChange', (pct) => this.innerWatcher.sbxPercent(pct), pct)
  }

  peersPercent(pct?: number): number {
    return this.change('peersChange', (pct) => this.innerWatcher.peersPercent(pct), pct)
  }

  change(changeName: EventName, method: (pct?: number) => number, pct?: number) {
    if (pct !== undefined && method() < pct) {
      this.emit(changeName, pct || 0)
    }
    return method(pct)
  }

  end(): void {
    this.innerWatcher.end()
  }

  onEvent(e: EventName, cb: (pct: number) => void) {
    this.on(e, cb)
  }

  getStats() {
    return {
      download: this.downloadPercent(),
      saved: this.storagePercent(),
      applied: this.appliedPercent(),
      sandbox: this.sbxPercent(),
      peersSync: this.peersPercent(),
    }
  }

  /************* P2P DOWNLOAD EVENTS ****************/

  addWrongChunkFailure(chunkIndex: number, lastSupplier: P2pCandidate): void {
    this.emit('addWrongChunkFailure', { chunkIndex, node: lastSupplier })
  }

  failToGetChunk(chunkIndex: number, node: P2pCandidate): void {
    this.emit('failToGetChunk', { chunkIndex, node })
  }

  gettingChunk(chunkIndex: number, candidates: P2pCandidate[]): void {
    this.emit('gettingChunk', { chunkIndex, nodes: candidates })
  }

  gotChunk(chunkIndex: number, node: P2pCandidate): void {
    this.emit('gotChunk', { chunkIndex, node })
  }

  reserveNodes(nodesAvailable: P2pCandidate[]): void {
    this.emit('reserveNodes', { nodes: nodesAvailable })
  }

  unableToDownloadChunk(chunkIndex: number): void {
    this.emit('unableToDownloadChunk', { chunkIndex })
  }

  wantToDownload(chunkIndex: number): void {
    this.emit('wantToDownload', { chunkIndex })
  }

  wantToLoad(chunkIndex: number): void {
    this.emit('wantToLoad', { chunkIndex })
  }

  beforeReadyNodes(p2pCandidates: P2pCandidate[]): void {
    this.emit('beforeReadyNodes', { nodes: p2pCandidates })
  }

  syncFailNoNodeFound(): void {
    this.emit('syncFailNoNodeFound', {})
  }

  syncFailCannotConnectToRemote(): void {
    this.emit('syncFailCannotConnectToRemote', {})
  }
}

export class MultimeterWatcher implements Watcher {

  private xPos:number
  private yPos:number
  private multi:any
  private charm:any
  private appliedBar:any
  private savedBar:any
  private downloadBar:any
  private sbxBar:any
  private peersBar:any
  private writtens:string[] = []

  constructor() {
    this.multi = multimeter(process);
    this.charm = this.multi.charm;
    this.charm.on('^C', process.exit);
    this.charm.reset();

    this.multi.write('Progress:\n\n');

    let line = 3
    this.savedBar    = this.createBar('Milestones',  line++)
    this.downloadBar = this.createBar('Download', line++)
    this.appliedBar  = this.createBar('Apply',    line++)
    if (!cliprogram.nosbx) {
      this.sbxBar    = this.createBar('Sandbox',  line++)
    }
    if (!cliprogram.nopeers) {
      this.peersBar  = this.createBar('Peers',    line++)
    }

    this.multi.write('\nStatus: ');

    this.charm.position( (x:number, y:number) => {
      this.xPos = x;
      this.yPos = y;
    });

    this.writtens = [];

    this.downloadBar.percent(0);
    this.savedBar.percent(0);
    this.appliedBar.percent(0);
    if (!cliprogram.nosbx) {
      this.sbxBar.percent(0);
    }
    if (!cliprogram.nopeers) {
      this.peersBar.percent(0);
    }
  }

  writeStatus(str:string) {
    this.writtens.push(str);
    this.charm
      .position(this.xPos, this.yPos)
      .erase('end')
      .write(str)
    ;
  };

  downloadPercent(pct:number) {
    return this.downloadBar.percent(pct)
  }

  storagePercent(pct:number) {
    return this.savedBar.percent(pct)
  }

  appliedPercent(pct:number) {
    return this.appliedBar.percent(pct)
  }

  sbxPercent(pct:number) {
    if (!cliprogram.nosbx) {
      return this.sbxBar.percent(pct)
    }
    return 0
  }

  peersPercent(pct:number) {
    if (!cliprogram.nopeers) {
      return this.peersBar.percent(pct)
    }
    return 0
  }

  end() {
    this.multi.write('\nAll done.\n');
    this.multi.destroy();
  }

  private createBar(title: string, line: number) {
    const header = (title + ':').padEnd(14, ' ') + '\n'
    this.multi.write(header)
    return this.multi(header.length, line, {
      width : 20,
      solid : {
        text : '|',
        foreground : 'white',
        background : 'blue'
      },
      empty : { text : ' ' }
    })
  }

  /************* NOT IMPLEMENTED ****************/

  addWrongChunkFailure(chunkIndex: number, lastSupplier: P2pCandidate): void {
  }

  failToGetChunk(chunkIndex: number, node: P2pCandidate): void {
  }

  gettingChunk(chunkIndex: number, candidates: P2pCandidate[]): void {
  }

  gotChunk(chunkIndex: number, node: P2pCandidate): void {
  }

  reserveNodes(nodesAvailable: P2pCandidate[]): void {
  }

  unableToDownloadChunk(chunkIndex: number): void {
  }

  wantToDownload(chunkIndex: number): void {
  }

  wantToLoad(chunkIndex: number): void {
  }

  beforeReadyNodes(p2pCandidates: P2pCandidate[]): void {
  }

  syncFailNoNodeFound(): void {
  }

  syncFailCannotConnectToRemote(): void {
  }

}

export class LoggerWatcher implements Watcher {

  private downPct = 0
  private savedPct = 0
  private appliedPct = 0
  private sbxPct = 0
  private peersPct = 0
  private lastMsg = ""

  constructor(private logger:any) {
  }

  showProgress() {
    return this.logger.info('Milestones %s%, Downloaded %s%, Applied %s%', this.savedPct, this.downPct, this.appliedPct)
  }

  writeStatus(str:string) {
    if (str != this.lastMsg) {
      this.lastMsg = str;
      this.logger.info(str);
    }
  }

  downloadPercent(pct:number) {
    return this.change('downPct', pct)
  }

  storagePercent(pct:number) {
    return this.change('savedPct', pct)
  }

  appliedPercent(pct:number) {
    return this.change('appliedPct', pct)
  }

  sbxPercent(pct:number) {
    if (pct > this.sbxPct) {
      this.sbxPct = pct
    }
    return this.sbxPct
  }

  peersPercent(pct:number) {
    if (pct > this.peersPct) {
      this.peersPct = pct
    }
    return this.peersPct
  }

  change(prop: 'downPct'|'savedPct'|'appliedPct', pct:number) {
    if (pct !== undefined) {
      let changed = pct > this[prop]
      this[prop] = pct
      if (changed) this.showProgress()
    }
    return this[prop]
  }

  end() {
  }

  /************* NOT IMPLEMENTED ****************/

  addWrongChunkFailure(chunkIndex: number, lastSupplier: P2pCandidate): void {
  }

  failToGetChunk(chunkIndex: number, node: P2pCandidate): void {
  }

  gettingChunk(chunkIndex: number, candidates: P2pCandidate[]): void {
  }

  gotChunk(chunkIndex: number, node: P2pCandidate): void {
  }

  reserveNodes(nodesAvailable: P2pCandidate[]): void {
  }

  unableToDownloadChunk(chunkIndex: number): void {
  }

  wantToDownload(chunkIndex: number): void {
  }

  wantToLoad(chunkIndex: number): void {
  }

  beforeReadyNodes(p2pCandidates: P2pCandidate[]): void {
  }

  syncFailNoNodeFound(): void {
  }

  syncFailCannotConnectToRemote(): void {
  }

}
