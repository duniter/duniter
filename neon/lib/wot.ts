import { Wot } from "../native";

export class WotBuilder {

    static fromWot(wot: Wot): Wot {
        return new Wot(wot.toBytes());
    }

    static fromFile(filePath: string): Wot {
        return new Wot(filePath)
    }
}
