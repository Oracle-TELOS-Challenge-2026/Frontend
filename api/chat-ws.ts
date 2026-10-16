import { createServer, STATUS_CODES } from 'node:http'
import WebSocket, { WebSocketServer, type RawData } from 'ws'

const origin = 'https://frontend-oracle.vercel.app'
const protocol = 'bintime.chat.v1'
const bufferLimit = 64 * 1024

export function createChatRelay(upstreamUrl = 'wss://140.238.19.165/api/v1/chatting/ws') {
  const server = createServer((_request, response) => {
    response.writeHead(426, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Upgrade: 'websocket' })
    response.end(JSON.stringify({ error: 'WEBSOCKET_UPGRADE_REQUIRED' }))
  })
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
    autoPong: false,
    handleProtocols: protocols => protocols.has(protocol) ? protocol : false,
  })

  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number) => {
      if (!socket.destroyed && !socket.writableEnded) socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`)
    }
    const path = request.url?.split('?')[0]
    if (path !== '/api/chat-ws' && path !== '/api/v1/chatting/ws') return reject(404)
    if (request.headers.origin !== origin) return reject(403)
    if (!request.headers['sec-websocket-protocol']?.split(',').map(value => value.trim()).includes(protocol)) return reject(400)
    const cookies = request.headers.cookie?.split(';').map(value => value.trim()).filter(value => value.startsWith('bt_session=')) ?? []
    if (cookies.length !== 1 || cookies[0] === 'bt_session=') return reject(401)

    const upstream = new WebSocket(upstreamUrl, protocol, {
      headers: { Cookie: cookies[0], Origin: request.headers.origin },
      handshakeTimeout: 5000,
      maxPayload: bufferLimit,
      perMessageDeflate: false,
      autoPong: false,
    })
    let browser: WebSocket | undefined
    const stopUpstream = () => {
      if (upstream.readyState !== WebSocket.CLOSED) upstream.terminate()
    }
    const abort = () => {
      if (!browser) reject(502)
      browser?.terminate()
      stopUpstream()
    }
    const closePeer = (peer: WebSocket, code: number, reason: Buffer) => {
      if (peer.readyState !== WebSocket.OPEN) return
      if (code === 1006) peer.terminate()
      else if (code === 1005) peer.close()
      else peer.close(code, reason)
    }
    const forward = (peer: WebSocket, data: RawData, binary: boolean) => {
      if (peer.readyState !== WebSocket.OPEN) return
      const size = Array.isArray(data) ? data.reduce((total, chunk) => total + chunk.length, 0) : data.byteLength
      if (peer.bufferedAmount + size > bufferLimit) {
        browser?.close(1013, 'RELAY_BACKPRESSURE')
        upstream.close(1013, 'RELAY_BACKPRESSURE')
        return
      }
      peer.send(data, { binary }, error => { if (error) abort() })
    }
    socket.on('error', abort)
    socket.once('close', stopUpstream)
    upstream.on('error', abort)
    upstream.on('unexpected-response', (_request, response) => {
      console.warn('Chat WebSocket upstream handshake rejected', response.statusCode)
      reject(response.statusCode === 401 || response.statusCode === 403 ? response.statusCode : 502)
      response.destroy()
      stopUpstream()
    })
    upstream.on('close', (code, reason) => {
      if (browser) closePeer(browser, code, reason)
      else reject(502)
    })
    upstream.once('open', () => {
      if (socket.destroyed) return stopUpstream()
      // Oracle 연결 후 브라우저를 열어 최초 CSRF 인증 프레임을 유실하지 않는다.
      sockets.handleUpgrade(request, socket, head, client => {
        browser = client
        socket.off('close', stopUpstream)
        client.on('error', abort)
        client.on('message', (data, binary) => forward(upstream, data, binary))
        upstream.on('message', (data, binary) => forward(client, data, binary))
        client.on('close', (code, reason) => closePeer(upstream, code, reason))
        // 중계가 대신 응답하지 않고 실제 브라우저까지 heartbeat를 전달한다.
        upstream.on('ping', data => { if (client.readyState === WebSocket.OPEN) client.ping(data) })
        client.on('pong', data => { if (upstream.readyState === WebSocket.OPEN) upstream.pong(data) })
        client.on('ping', data => { if (upstream.readyState === WebSocket.OPEN) upstream.ping(data) })
        upstream.on('pong', data => { if (client.readyState === WebSocket.OPEN) client.pong(data) })
      })
    })
  })
  return server
}

export default createChatRelay()
