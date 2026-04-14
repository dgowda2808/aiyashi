/**
 * chat.js — Socket.io real-time messaging
 *
 * Events (client → server):
 *   join_match    { matchId }           → join a room
 *   send_message  { matchId, content }  → send a message
 *   typing        { matchId }           → broadcast typing indicator
 *   stop_typing   { matchId }           → stop typing indicator
 *   read_messages { matchId }           → mark messages read
 *
 * Events (server → client):
 *   new_message   { message }           → new chat message
 *   typing        { userId, matchId }   → other user typing
 *   stop_typing   { userId, matchId }   → stopped typing
 *   messages_read { matchId, userId }   → receipts
 *   match_event   { match }             → new match notification
 *   error         { message }
 */
const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');

// Map: userId → Set of socket IDs (one user can have multiple tabs)
const onlineUsers = new Map();

module.exports = (io) => {

  // ── Auth middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await query(
        'SELECT id, email FROM users WHERE id = $1 AND is_active = TRUE AND is_banned = FALSE',
        [decoded.userId]
      );
      if (!rows.length) return next(new Error('User not found'));

      socket.userId = rows[0].id;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`[socket] connected: ${userId} (${socket.id})`);

    // Track online users
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Update last_seen
    query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]).catch(() => {});

    // ── join_match ─────────────────────────────────────────────────
    socket.on('join_match', async ({ matchId }) => {
      try {
        // Verify user is part of this match
        const { rows } = await query(
          `SELECT id FROM matches
           WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) AND unmatched_by IS NULL`,
          [matchId, userId]
        );
        if (!rows.length) return socket.emit('error', { message: 'Not authorised for this match' });

        socket.join(`match:${matchId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join match' });
      }
    });

    // ── send_message ───────────────────────────────────────────────
    socket.on('send_message', async ({ matchId, content }) => {
      try {
        if (!content || !content.trim()) return;

        // Verify match
        const { rows: matchRows } = await query(
          `SELECT id FROM matches
           WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) AND unmatched_by IS NULL`,
          [matchId, userId]
        );
        if (!matchRows.length) return socket.emit('error', { message: 'Not authorised' });

        // Save to DB
        const { rows: [msg] } = await query(
          `INSERT INTO messages (match_id, sender_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, match_id, sender_id, content, read_at, created_at`,
          [matchId, userId, content.trim()]
        );

        // Get sender display name
        const { rows: [sender] } = await query(
          `SELECT display_name, photos FROM profiles WHERE user_id = $1`,
          [userId]
        );

        const payload = {
          ...msg,
          sender_name:  sender.display_name,
          sender_photo: sender.photos?.[0] || null,
        };

        // Broadcast to everyone in the match room (including sender for confirmation)
        io.to(`match:${matchId}`).emit('new_message', payload);

      } catch (err) {
        console.error('[socket] send_message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── typing ─────────────────────────────────────────────────────
    socket.on('typing', ({ matchId }) => {
      socket.to(`match:${matchId}`).emit('typing', { userId, matchId });
    });

    socket.on('stop_typing', ({ matchId }) => {
      socket.to(`match:${matchId}`).emit('stop_typing', { userId, matchId });
    });

    // ── read_messages ──────────────────────────────────────────────
    socket.on('read_messages', async ({ matchId }) => {
      try {
        await query(
          `UPDATE messages SET read_at = NOW()
           WHERE match_id = $1 AND sender_id != $2 AND read_at IS NULL`,
          [matchId, userId]
        );
        socket.to(`match:${matchId}`).emit('messages_read', { matchId, userId });
      } catch (_) {}
    });

    // ── disconnect ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]).catch(() => {});
        }
      }
      console.log(`[socket] disconnected: ${userId}`);
    });
  });

  // Export helper to emit match events from HTTP routes
  return {
    emitMatchEvent: (userId, matchData) => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.forEach(socketId => {
          io.to(socketId).emit('match_event', matchData);
        });
      }
    },
    isOnline: (userId) => onlineUsers.has(userId),
  };
};
