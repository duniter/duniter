
export abstract class Initiable {
  abstract init(): Promise<void>
  abstract close(): Promise<void>
  abstract cleanCache(): void
}
