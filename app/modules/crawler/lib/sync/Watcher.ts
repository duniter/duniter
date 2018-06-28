import * as events from "events"

const multimeter   = require('multimeter')

export interface Watcher {
  writeStatus(str: string): void
  downloadPercent(pct?: number): number
  savedPercent(pct?: number): number
  appliedPercent(pct?: number): number
  sbxPercent(pct?: number): number
  end(): void
}

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

  savedPercent(pct?: number): number {
    return this.change('savedChange', (pct) => this.innerWatcher.savedPercent(pct), pct)
  }

  appliedPercent(pct?: number): number {
    return this.change('appliedChange', (pct) => this.innerWatcher.appliedPercent(pct), pct)
  }

  sbxPercent(pct?: number): number {
    return this.change('sbxChange', (pct) => this.innerWatcher.sbxPercent(pct), pct)
  }

  change(changeName: string, method: (pct?: number) => number, pct?: number) {
    if (pct !== undefined && method() < pct) {
      this.emit(changeName, pct || 0)
    }
    return method(pct)
  }

  end(): void {
    this.innerWatcher.end()
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
  private writtens:string[] = []

  constructor() {
    this.multi = multimeter(process);
    this.charm = this.multi.charm;
    this.charm.on('^C', process.exit);
    this.charm.reset();

    this.multi.write('Progress:\n\n');

    this.downloadBar = this.createBar('Download', 3)
    this.savedBar    = this.createBar('Storage',  4)
    this.appliedBar  = this.createBar('Apply',    5)
    this.sbxBar      = this.createBar('Sandbox',  6)

    this.multi.write('\nStatus: ');

    this.charm.position( (x:number, y:number) => {
      this.xPos = x;
      this.yPos = y;
    });

    this.writtens = [];

    this.downloadBar.percent(0);
    this.savedBar.percent(0);
    this.appliedBar.percent(0);
    this.sbxBar.percent(0);
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

  savedPercent(pct:number) {
    return this.savedBar.percent(pct)
  }

  appliedPercent(pct:number) {
    return this.appliedBar.percent(pct)
  }

  sbxPercent(pct:number) {
    return this.sbxBar.percent(pct)
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
}

export class LoggerWatcher implements Watcher {

  private downPct = 0
  private savedPct = 0
  private appliedPct = 0
  private lastMsg = ""

  constructor(private logger:any) {
  }

  showProgress() {
    return this.logger.info('Downloaded %s%, Blockchained %s%, Applied %s%', this.downPct, this.savedPct, this.appliedPct)
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

  savedPercent(pct:number) {
    return this.change('savedPct', pct)
  }

  appliedPercent(pct:number) {
    return this.change('appliedPct', pct)
  }

  sbxPercent(pct:number) {
    return 0
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

}
