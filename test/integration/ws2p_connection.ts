import {WS2PConnection} from "../../app/lib/ws2p/WS2PConnection"
const assert = require('assert');
const WebSocketServer = require('ws').Server

describe("WS2P connection", function() {

  describe("no auth", () => {

    let wss:any

    before(async () => {
      wss = new WebSocketServer({ port: 20902 })
      wss.on('connection', (ws:any) => {
        ws.on('message', (data:any) => {
          const obj = JSON.parse(data)
          if (obj.uuid) {
            ws.send(JSON.stringify({ uuid: obj.uuid, body: { bla: 'aa' } }))
          }
        })
      })
    })

    after((done) => {
      wss.close(done)
    })

    it('should be able to create a connection', async () => {
      const ws2p = new WS2PConnection(() => {})
      await ws2p.connect('localhost:20902')
      const res = await ws2p.request({ message: 'head' })
      assert.deepEqual({ bla: 'aa' }, res)
    })
  })
})