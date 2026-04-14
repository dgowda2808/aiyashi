/**
 * socket.js — Socket.io client wrapper
 */
import { tokens } from './api.js';

let socket = null;

export function getSocket() { return socket; }

export function connectSocket() {
  if (socket?.connected) return socket;

  // Load socket.io client (served by our server)
  if (typeof io === 'undefined') {
    console.warn('Socket.io client not loaded');
    return null;
  }

  socket = io({
    auth:             { token: tokens.access },
    reconnection:     true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect',    () => console.log('[socket] connected'));
  socket.on('disconnect', () => console.log('[socket] disconnected'));
  socket.on('connect_error', (err) => console.warn('[socket] error:', err.message));

  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function joinMatch(matchId) {
  socket?.emit('join_match', { matchId });
}

export function sendMessage(matchId, content) {
  socket?.emit('send_message', { matchId, content });
}

export function sendTyping(matchId)     { socket?.emit('typing',      { matchId }); }
export function sendStopTyping(matchId) { socket?.emit('stop_typing', { matchId }); }
export function markRead(matchId)       { socket?.emit('read_messages', { matchId }); }
