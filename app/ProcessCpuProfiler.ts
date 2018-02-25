const SAMPLING_PERIOD = 150 // milliseconds
const MAX_SAMPLES_DISTANCE = 20 * 1000000 // seconds

function getMicrosecondsTime() {
  const [ seconds, nanoseconds ] = process.hrtime()
  return seconds * 1000000 + nanoseconds / 1000
}

interface CpuUsage {
  user: number
  system:number
}

interface CpuUsageAt {
  usage:number
  at:number // microseconds timestamp
  elapsed:number // microseconds elapsed for this result
}

export class ProcessCpuProfiler {

  private cumulatedUsage: CpuUsage
  private startedAt:number // microseconds timestamp
  private samples:CpuUsageAt[] = []

  constructor(samplingPeriod = SAMPLING_PERIOD) {
    // Initial state
    const start = getMicrosecondsTime()
    this.startedAt = start
    this.cumulatedUsage = process.cpuUsage()
    this.samples.push({ usage: 0, at: start, elapsed: 1 })
    // Periodic sample
    setInterval(() => {
      const newSampleAt = getMicrosecondsTime()
      const newUsage:CpuUsage = process.cpuUsage()
      const elapsed = newSampleAt - this.lastSampleAt
      const userDiff = newUsage.user - this.cumulatedUsage.user
      const usagePercent = userDiff / elapsed // The percent of time consumed by the process since last sample
      this.samples.push({ usage: usagePercent, at: newSampleAt, elapsed })
      while(this.samplesDistance > MAX_SAMPLES_DISTANCE) {
        this.samples.shift()
      }
      this.cumulatedUsage = newUsage
      // console.log('Time elapsed: %s microseconds, = %s %CPU', elapsed, (usagePercent*100).toFixed(2))
    }, samplingPeriod)
  }

  private get lastSampleAt() {
    return this.samples[this.samples.length - 1].at
  }

  private get samplesDistance() {
    return this.samples[this.samples.length - 1].at - this.samples[0].at
  }

  cpuUsageOverLastMilliseconds(elapsedMilliseconds:number) {
    return this.cpuUsageOverLastX(elapsedMilliseconds * 1000)
  }

  private cpuUsageOverLastX(nbMicrosecondsElapsed:number) {
    return this.getSamplesResult(getMicrosecondsTime() - nbMicrosecondsElapsed)
  }

  private getSamplesResult(minTimestamp:number) {
    const matchingSamples = this.samples.filter(s => s.at >= minTimestamp - SAMPLING_PERIOD * 1000)
    const cumulativeElapsed = matchingSamples.reduce((sum, s) => sum + s.elapsed, 0)
    return matchingSamples.reduce((cumulated, percent) => {
      const weight = percent.elapsed / cumulativeElapsed
      return cumulated + percent.usage * weight
    }, 0)
  }
}