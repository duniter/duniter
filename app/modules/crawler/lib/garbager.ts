import {CrawlerConstants} from "./constants"
import {Server} from "../../../../server"

export const cleanLongDownPeers = async (server:Server, now:number) => {
  const first_down_limit = now - CrawlerConstants.PEER_LONG_DOWN * 1000;
  await server.dal.peerDAL.query('DELETE FROM peer WHERE first_down < ' + first_down_limit)
}
