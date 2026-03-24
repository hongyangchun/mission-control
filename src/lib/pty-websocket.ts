/**
 * PTY WebSocket handler — bridges browser xterm.js to server-side PTY
 *
 * Handles WebSocket upgrade on /ws/pty path.
 * Protocol: JSON messages for control, raw terminal data in output messages.
 */

import { type IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { createPtySession, getPtySession, type PtySessionInfo } from './pty-manager'
import { logger } from './logger'

const log = logger.child({ module: 'pty-websocket' })

let wss: WebSocketServer | null = null

/** Initialize the WebSocket server (call once from custom server wrapper) */
export function initPtyWebSocket(): WebSocketServer {
  if (wss) return wss

  wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const sessionId = url.searchParams.get('session') || ''
    const kind = url.searchParams.get('kind') || ''
    const mode = (url.searchParams.get('mode') || 'readonly') as 'readonly' | 'interactive'
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    log.info({ sessionId, kind, mode, clientId }, 'PTY WebSocket connected')

    let ptyId: string | null = null

    // Create or attach to PTY session
    createPtySession(sessionId, kind, mode)
      .then((ptySession) => {
        ptyId = ptySession.id

        ptySession.addClient({
          id: clientId,
          send: (data: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data)
            }
          },
          close: () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close()
            }
          },
        })

        // Send ready message
        ws.send(JSON.stringify({
          type: 'ready',
          ptyId: ptySession.id,
          sessionId,
          kind,
          mode,
        }))
      })
      .catch((error) => {
        log.error({ err: error, sessionId, kind }, 'Failed to create PTY session')
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to create PTY session',
        }))
        ws.close()
      })

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))

        if (!ptyId) return

        const session = getPtySession(ptyId)
        if (!session) return

        switch (msg.type) {
          case 'input':
            session.write(msg.data || '')
            break
          case 'resize':
            if (typeof msg.cols === 'number' && typeof msg.rows === 'number') {
              session.resize(msg.cols, msg.rows)
            }
            break
          default:
            break
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      log.info({ clientId, ptyId }, 'PTY WebSocket disconnected')
      if (ptyId) {
        const session = getPtySession(ptyId)
        session?.removeClient(clientId)
      }
    })

    ws.on('error', (err) => {
      log.error({ err, clientId }, 'PTY WebSocket error')
    })
  })

  return wss
}

/** Handle an HTTP upgrade request for PTY WebSocket */
export function handlePtyUpgrade(req: IncomingMessage, socket: any, head: Buffer): boolean {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname !== '/ws/pty') return false

  if (!wss) {
    initPtyWebSocket()
  }

  // TODO: validate auth cookie from req.headers before upgrading
  // For now, the PTY attach API endpoint handles auth validation

  wss!.handleUpgrade(req, socket, head, (ws) => {
    wss!.emit('connection', ws, req)
  })

  return true
}
