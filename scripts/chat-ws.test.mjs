import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import WebSocket, { WebSocketServer } from 'ws'
import { createChatRelay } from '../api/chat-ws.ts'

const origin = 'https://frontend-oracle.vercel.app'
const protocol = 'bintime.chat.v1'
const headers = { Origin: origin, Cookie: 'other=private; bt_session=test-session; analytics=tracking' }

async function listen(t, server) {
  const sockets = new Set()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => {
    server.close(resolve)
    for (const socket of sockets) socket.destroy()
  }))
  return `ws://127.0.0.1:${server.address().port}`
}

async function fixture(t, options = {}) {
  const server = createServer()
  const upstream = new WebSocketServer({ server, ...options })
  t.after(() => {
    for (const socket of upstream.clients) socket.terminate()
    upstream.close()
  })
  const upstreamUrl = await listen(t, server)
  const relayUrl = await listen(t, createChatRelay(`${upstreamUrl}/api/v1/chatting/ws`))
  return { server, upstream, relayUrl }
}

function connect(t, url, options = {}) {
  const socket = new WebSocket(url, Object.hasOwn(options, 'protocol') ? options.protocol : protocol, {
    headers: options.headers ?? headers,
    autoPong: options.autoPong ?? true,
  })
  socket.on('error', () => {})
  t.after(() => socket.terminate())
  return socket
}

async function rejected(t, url, options) {
  const socket = connect(t, url, options)
  let opened = false
  socket.on('open', () => { opened = true })
  const status = await new Promise((resolve, reject) => {
    socket.on('unexpected-response', (_request, response) => {
      response.resume()
      socket.terminate()
      resolve(response.statusCode)
    })
    socket.on('error', reject)
  })
  assert.equal(opened, false)
  assert.ok(status >= 400 && status < 600, `unexpected HTTP status: ${status}`)
}

test('relay preserves chat frames and forwards only the session cookie on either route', { timeout: 5000 }, async (t) => {
  const { upstream, relayUrl } = await fixture(t)
  for (const path of ['/api/chat-ws', '/api/v1/chatting/ws']) {
    const connected = once(upstream, 'connection')
    const client = connect(t, `${relayUrl}${path}`, { protocol: ['other', protocol] })
    await once(client, 'open')
    const [server, request] = await connected
    assert.equal(request.url, '/api/v1/chatting/ws')
    assert.equal(request.headers.origin, origin)
    assert.equal(request.headers.cookie, 'bt_session=test-session')
    assert.equal(request.headers['sec-websocket-protocol'], protocol)
    assert.equal(request.headers.upgrade, 'websocket')
    assert.equal(client.protocol, protocol)

    const authenticate = JSON.stringify({ type: 'connection.authenticate', payload: { csrfToken: 'test-csrf' } })
    const received = once(server, 'message')
    client.send(authenticate)
    const [frame, binary] = await received
    assert.equal(frame.toString(), authenticate)
    assert.equal(binary, false)

    const ready = JSON.stringify({ type: 'connection.ready', payload: { userId: 'test-user' } })
    const reply = once(client, 'message')
    server.send(ready)
    const [readyFrame, readyBinary] = await reply
    assert.equal(readyFrame.toString(), ready)
    assert.equal(readyBinary, false)

    const bytes = Buffer.from([0, 255, 128, 42])
    const upstreamBinary = once(server, 'message')
    client.send(bytes)
    assert.deepEqual(await upstreamBinary, [bytes, true])
    const downstreamBinary = once(client, 'message')
    server.send(bytes)
    assert.deepEqual(await downstreamBinary, [bytes, true])
    const closed = once(client, 'close')
    client.close(1000)
    await closed
  }
})

test('invalid origin, session, protocol and route are rejected before contacting upstream', { timeout: 5000 }, async (t) => {
  const { server, relayUrl } = await fixture(t)
  let upstreamAttempts = 0
  server.on('upgrade', () => { upstreamAttempts += 1 })
  await rejected(t, `${relayUrl}/api/chat-ws`, { headers: { ...headers, Origin: 'https://untrusted.example' } })
  await rejected(t, `${relayUrl}/api/chat-ws`, { headers: { Origin: origin, Cookie: 'other=private' } })
  await rejected(t, `${relayUrl}/api/chat-ws`, { protocol: undefined })
  await rejected(t, `${relayUrl}/other`)
  assert.equal(upstreamAttempts, 0)
})

test('upstream authentication rejection does not upgrade the browser connection', { timeout: 5000 }, async (t) => {
  const server = createServer()
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
  })
  const upstreamUrl = await listen(t, server)
  const relayUrl = await listen(t, createChatRelay(upstreamUrl))
  await rejected(t, `${relayUrl}/api/chat-ws`)
})

test('unreachable upstream does not upgrade the browser connection', { timeout: 5000 }, async (t) => {
  const server = createServer()
  const upstreamUrl = await listen(t, server)
  await new Promise((resolve) => server.close(resolve))
  const relayUrl = await listen(t, createChatRelay(upstreamUrl))
  await rejected(t, `${relayUrl}/api/chat-ws`)
})

test('closing the browser connection also closes its upstream connection', { timeout: 5000 }, async (t) => {
  const { upstream, relayUrl } = await fixture(t)
  const connected = once(upstream, 'connection')
  const client = connect(t, `${relayUrl}/api/chat-ws`)
  await once(client, 'open')
  const [server] = await connected
  const closed = once(server, 'close')
  client.close(1000, 'page left')
  const [code, reason] = await closed
  assert.equal(code, 1000)
  assert.equal(reason.toString(), 'page left')
})

test('upstream close code and reason reach the browser connection', { timeout: 5000 }, async (t) => {
  const { upstream, relayUrl } = await fixture(t)
  const connected = once(upstream, 'connection')
  const client = connect(t, `${relayUrl}/api/chat-ws`)
  await once(client, 'open')
  const [server] = await connected
  const closed = once(client, 'close')
  server.close(4401, 'session expired')
  const [code, reason] = await closed
  assert.equal(code, 4401)
  assert.equal(reason.toString(), 'session expired')
})

test('ping and pong travel end to end in both directions without a relay-generated reply', { timeout: 5000 }, async (t) => {
  const { upstream, relayUrl } = await fixture(t, { autoPong: false })
  const connected = once(upstream, 'connection')
  const client = connect(t, `${relayUrl}/api/chat-ws`, { autoPong: false })
  await once(client, 'open')
  const [server] = await connected

  const clientPing = once(client, 'ping')
  const serverPong = once(server, 'pong')
  server.ping('server-ping')
  assert.equal((await clientPing)[0].toString(), 'server-ping')
  client.pong('browser-pong')
  assert.equal((await serverPong)[0].toString(), 'browser-pong')

  const serverPing = once(server, 'ping')
  const clientPong = once(client, 'pong')
  client.ping('browser-ping')
  assert.equal((await serverPing)[0].toString(), 'browser-ping')
  server.pong('server-pong')
  assert.equal((await clientPong)[0].toString(), 'server-pong')
})

test('browser messages larger than 16 KiB are rejected and the upstream is released', { timeout: 5000 }, async (t) => {
  const { upstream, relayUrl } = await fixture(t)
  const connected = once(upstream, 'connection')
  const client = connect(t, `${relayUrl}/api/chat-ws`)
  await once(client, 'open')
  const [server] = await connected
  let delivered = false
  server.on('message', () => { delivered = true })
  const browserClosed = new Promise((resolve) => client.once('close', resolve))
  const upstreamClosed = once(server, 'close')
  client.send(Buffer.alloc(16 * 1024 + 1))
  assert.notEqual(await browserClosed, 1000)
  await upstreamClosed
  assert.equal(delivered, false)
})
