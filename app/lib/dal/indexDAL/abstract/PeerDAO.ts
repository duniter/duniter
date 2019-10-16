import {DBPeer} from "../../../db/DBPeer"
import {Initiable} from "../../sqliteDAL/Initiable"

export interface PeerDAO extends Initiable {

  /**
   * Trigger the initialization of the DAO. Called when the underlying DB is ready.
   */
  triggerInit(): void

  listAll(): Promise<DBPeer[]>

  withUPStatus(): Promise<DBPeer[]>

  /**
   * Saves a wallet.
   * @param {DBPeer} peer
   * @returns {Promise<DBPeer>}
   */
  savePeer(peer:DBPeer): Promise<DBPeer>

  /**
   * Find a wallet based on conditions.
   * @param {string} pubkey
   * @returns {Promise<DBPeer>}
   */
  getPeer(pubkey:string): Promise<DBPeer>

  /**
   * Find all peers with at least one endpoint matching given parameter.
   * @param {string} ep
   * @returns {Promise<DBPeer[]>}
   */
  getPeersWithEndpointsLike(ep:string): Promise<DBPeer[]>

  /**
   * Make a batch insert.
   * @param records The records to insert as a batch.
   */
  insertBatch(records:DBPeer[]): Promise<void>

  /**
   * Remove a peer by its pubkey.
   * @param {string} pubkey
   * @returns {Promise<void>}
   */
  removePeerByPubkey(pubkey:string): Promise<void>

  /**
   * Remove all the peers.
   * @returns {Promise<void>}
   */
  removeAll(): Promise<void>

  /**
   * Count the number of non-WoT peers known is the DB.
   * @returns {Promise<number>} The number of nonWoT peers.
   */
  countNonWoTPeers(): Promise<number>

  /**
   * Remove all **non-WoT** peers whose last contact is above given time (timestamp in seconds).
   * @param {number} threshold
   * @returns {Promise<void>}
   */
  deleteNonWotPeersWhoseLastContactIsAbove(threshold: number): Promise<void>
}
