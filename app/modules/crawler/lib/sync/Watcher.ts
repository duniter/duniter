const multimeter   = require('multimeter')

export interface Watcher {
  writeStatus(str: string): void
  downloadPercent(pct?: number): number
  savedPercent(pct?: number): number
  appliedPercent(pct?: number): number
  end(): void
}

export class EventWatcher implements Watcher {

  constructor(
    private innerWatcher:Watcher,
    private beforeDownloadPercentHook: (pct:number, innerWatcher:Watcher) => void,
    private beforeSavedPercentHook: (pct:number, innerWatcher:Watcher) => void,
    private beforeAppliedPercentHook: (pct:number, innerWatcher:Watcher) => void) {
  }

  writeStatus(str: string): void {
    this.innerWatcher.writeStatus(str)
  }

  downloadPercent(pct?: number): number {
    this.beforeDownloadPercentHook(pct || 0, this.innerWatcher)
    return this.innerWatcher.downloadPercent(pct)
  }

  savedPercent(pct?: number): number {
    this.beforeSavedPercentHook(pct || 0, this.innerWatcher)
    return this.innerWatcher.savedPercent(pct)
  }

  appliedPercent(pct?: number): number {
    this.beforeAppliedPercentHook(pct || 0, this.innerWatcher)
    return this.innerWatcher.appliedPercent(pct)
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
  private writtens:string[] = []

  constructor() {
    this.multi = multimeter(process);
    this.charm = this.multi.charm;
    this.charm.on('^C', process.exit);
    this.charm.reset();

    this.multi.write('Progress:\n\n');

    this.multi.write("Download:   \n");
    this.downloadBar = this.multi("Download:   \n".length, 3, {
      width : 20,
      solid : {
        text : '|',
        foreground : 'white',
        background : 'blue'
      },
      empty : { text : ' ' }
    });

    this.multi.write("Blockchain: \n");
    this.savedBar = this.multi("Blockchain: \n".length, 4, {
      width : 20,
      solid : {
        text : '|',
        foreground : 'white',
        background : 'blue'
      },
      empty : { text : ' ' }
    });

    this.multi.write("Apply:      \n");
    this.appliedBar = this.multi("Apply:      \n".length, 5, {
      width : 20,
      solid : {
        text : '|',
        foreground : 'white',
        background : 'blue'
      },
      empty : { text : ' ' }
    });

    this.multi.write('\nStatus: ');

    this.charm.position( (x:number, y:number) => {
      this.xPos = x;
      this.yPos = y;
    });

    this.writtens = [];

    this.downloadBar.percent(0);
    this.savedBar.percent(0);
    this.appliedBar.percent(0);
  }

  writeStatus(str:string) {
    this.writtens.push(str);
    //require('fs').writeFileSync('writtens.json', JSON.stringify(writtens));
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

  end() {
    this.multi.write('\nAll done.\n');
    this.multi.destroy();
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
    if (pct !== undefined) {
      let changed = pct > this.downPct;
      this.downPct = pct;
      if (changed) this.showProgress();
    }
    return this.downPct;
  }

  savedPercent(pct:number) {
    if (pct !== undefined) {
      let changed = pct > this.savedPct;
      this.savedPct = pct;
      if (changed) this.showProgress();
    }
    return this.savedPct;
  }

  appliedPercent(pct:number) {
    if (pct !== undefined) {
      let changed = pct > this.appliedPct;
      this.appliedPct = pct;
      if (changed) this.showProgress();
    }
    return this.appliedPct;
  }

  end() {
  }

}
