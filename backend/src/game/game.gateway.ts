import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { GameService } from './game.service';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { GameType } from '@prisma/client';

interface RoomPlayer {
  userId: string;
  username: string;
  isReady: boolean;
}

interface GameRoom {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  name: string;
  gameType: GameType;
  stake: number;
  maxPlayers: number;
  isPublic: boolean;
  players: RoomPlayer[];
  createdAt: number;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;


  private turnTimers: Map<string, NodeJS.Timeout> = new Map();
  private activeMatches: Map<string, string> = new Map();
  private pendingDisconnects: Map<string, NodeJS.Timeout> = new Map();

  // Tracks when each turn timer was set (key = timerKey, value = { startedAt, totalMs })
  // Used to compute remaining time when we need to pause/resume a timer.
  private timerMeta: Map<string, { startedAt: number; totalMs: number }> = new Map();

  // Stores remaining turn-timer time when a player disconnects (key = timerKey, value = remainingMs)
  // Allows accurate timer resumption when the player reconnects.
  private pausedTimers: Map<string, number> = new Map();

  // Tracks which players (userIds) are currently disconnected per match (matchId → Set<userId>)
  // Used to handle dual-disconnect scenarios: don't resume until ALL disconnected players return.
  private disconnectedPlayers: Map<string, Set<string>> = new Map();

  // Room system
  private rooms: Map<string, GameRoom> = new Map();
  private userRooms: Map<string, string> = new Map(); // userId -> roomId

  // Chat system
  private chatMessages: Map<string, any[]> = new Map();

  constructor(
    private gameService: GameService,
    private jwtService: JwtService,
  ) {}

  /** Returns only non-forfeited participants for a Bingo match */
  private getActiveBingoParticipants(matchId: string, participants: any[]): any[] {
    const state = this.gameService.getBingoState(matchId);
    if (!state) return participants;
    const forfeited = new Set(state.forfeitedPlayers);
    return participants.filter((p: any) => !forfeited.has(p.userId));
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  private broadcastRoomUpdate(room: GameRoom) {
    room.players.forEach(p => {
      this.server.to(p.userId).emit('roomUpdate', {
        roomId: room.id,
        code: room.code,
        hostId: room.hostId,
        hostName: room.hostName,
        name: room.name,
        gameType: room.gameType,
        stake: room.stake,
        maxPlayers: room.maxPlayers,
        isPublic: room.isPublic,
        players: room.players,
      });
    });
  }

  /**
   * Sets a turn timer and records metadata (start time + total duration)
   * so that handleDisconnect can compute how much time remains if it needs to pause.
   */
  private setTrackedTimer(key: string, callback: () => void, durationMs: number): void {
    // Clear any old timer + metadata for this key
    const existing = this.turnTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(key);
    }
    this.timerMeta.set(key, { startedAt: Date.now(), totalMs: durationMs });
    const t = setTimeout(() => {
      this.turnTimers.delete(key);
      this.timerMeta.delete(key);
      callback();
    }, durationMs);
    this.turnTimers.set(key, t);
  }

  async handleConnection(socket: Socket) {
    try {
      const auth = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!auth) return socket.disconnect();

      const payload = await this.jwtService.verifyAsync(auth, { secret: process.env.JWT_SECRET || 'super-secret' });
      socket.data.user = { userId: payload.sub, username: payload.username };
      socket.join(payload.sub);

      // Reconnect check for active matches
      const userId = payload.sub;

      // Clear any pending disconnect timer (player reconnected in time)
      const pendingTimer = this.pendingDisconnects.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.pendingDisconnects.delete(userId);
      }

      // Check if this user has an active match to rejoin
      const matchId = this.activeMatches.get(userId);
      if (matchId) {
        const match = await this.gameService.getMatchById(matchId);
        if (match && (match as any).status !== 'FINISHED') {
          // Check if this user was forfeited — block reconnection
          if ((match as any).gameType === 'BINGO') {
            const bingoState = this.gameService.getBingoState(matchId);
            if (bingoState && bingoState.forfeitedPlayers.includes(userId)) {
              this.activeMatches.delete(userId);
              return; // fully blocked — no rejoin
            }
          }

          const participants = (match as any).participants || [];
          const opponent = participants.find((pp: any) => pp.userId !== userId);

          // Remove this player from the disconnected set for this match
          const disconnected = this.disconnectedPlayers.get(matchId);
          if (disconnected) {
            disconnected.delete(userId);
            if (disconnected.size === 0) this.disconnectedPlayers.delete(matchId);
          }

          // Check if there are OTHER players still disconnected (dual-disconnect scenario)
          const stillDisconnected = this.disconnectedPlayers.get(matchId);
          const hasPeersStillDisconnected = stillDisconnected && stillDisconnected.size > 0;

          // Build Bingo-specific state for the rejoin payload
          let bingoRejoinData: any = {};
          if ((match as any).gameType === 'BINGO') {
            if (!hasPeersStillDisconnected) {
              // Only unpause Bingo if all players are back
              this.gameService.setBingoPaused(matchId, false);
            }

            const state = this.gameService.getBingoState(matchId);
            if (state) {
              const playerData = state.players.find(bp => bp.userId === userId);
              const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
              const playerLines: Record<string, number> = {};
              for (const p of state.players) {
                const calledSet = new Set(state.calledNumbers);
                const lines = [
                  [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
                  [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
                  [0,6,12,18,24],[4,8,12,16,20],
                ];
                let count = 0;
                for (const line of lines) {
                  if (line.every(idx => calledSet.has(p.board[idx]))) count++;
                }
                playerLines[p.userId] = count;
              }
              bingoRejoinData = {
                board: playerData?.board || [],
                calledNumbers: [...state.calledNumbers],
                playerLines,
                currentTurn: currentTurnUserId,
                isYourTurn: userId === currentTurnUserId,
                myUserId: userId,
              };
            }
          }

          // Determine the disconnect remaining time for the still-absent peer (for the returning player's overlay)
          let peerReconnectDeadlineMs: number | null = null;
          if (hasPeersStillDisconnected) {
            const disconnectTimeMs = await this.gameService.getDisconnectTimeMs();
            peerReconnectDeadlineMs = Date.now() + disconnectTimeMs; // approximate; forfeit timer is already running
          }

          // Send the match state to the returning player
          socket.emit('rejoinedMatch', {
            matchId,
            gameType: (match as any).gameType,
            stake: Number((match as any).stake),
            matchStartedAt: (match as any).createdAt ? new Date((match as any).createdAt).getTime() : Date.now(),
            opponentName: opponent?.user?.username || 'Opponent',
            opponentLevel: opponent?.user?.level || 1,
            allPlayers: participants.map((p: any) => ({
              userId: p.userId,
              username: p.user?.username || 'Player',
              level: p.user?.level || 1,
              avatar: p.user?.avatar || null,
            })),
            ...bingoRejoinData,
          });

          if (hasPeersStillDisconnected) {
            // Dual-disconnect: the other player is still gone.
            // Show the returning player the waiting/disconnected UI instead of resuming.
            const absentUserId = [...stillDisconnected!][0];
            const absentPlayer = participants.find((p: any) => p.userId === absentUserId);
            socket.emit('opponentStillDisconnected', {
              matchId,
              opponentName: absentPlayer?.user?.username || 'Opponent',
              reconnectDeadline: peerReconnectDeadlineMs,
            });
            // Do NOT resume timers — keep them frozen until the other player returns.
            console.log(`[GATEWAY] User ${userId} rejoined but peer ${absentUserId} is still disconnected. Showing wait overlay.`);
          } else {
            // All players back — notify peers and resume timers.
            let activeParticipants = participants;
            if ((match as any).gameType === 'BINGO') {
              activeParticipants = this.getActiveBingoParticipants(matchId, participants);
            }
            activeParticipants.forEach((p: any) => {
              if (p.userId !== userId) {
                this.server.to(p.userId).emit('opponentReconnected', { matchId, opponentId: userId });
              }
            });

            // Resume the turn timers — restore exact remaining time from before the disconnect
            if ((match as any).gameType === 'BINGO') {
              const state = this.gameService.getBingoState(matchId);
              if (state) {
                const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
                const pausedKey = matchId;
                const remainingMs = this.pausedTimers.get(pausedKey) ?? await this.gameService.getTurnTimeMs();
                this.pausedTimers.delete(pausedKey);

                this.setTrackedTimer(matchId, async () => {
                  await this.broadcastBingoAutoCall(matchId, currentTurnUserId);
                }, remainingMs);

                participants.forEach((p: any) => {
                  this.server.to(p.userId).emit('startTurnTimer', {
                    matchId, remainingMs,
                    currentTurn: currentTurnUserId,
                    isYourTurn: p.userId === currentTurnUserId,
                  });
                });
              }
            } else if ((match as any).gameType === 'DICE') {
              const state = this.gameService.getDiceState(matchId);
              if (state) {
                const fullTurnTimeMs = await this.gameService.getTurnTimeMs();
                participants.forEach((p: any) => {
                  const isDone = p.userId === state.p1 ? state.p1Done : state.p2Done;
                  if (isDone) return;
                  const timerKey = `${matchId}_${p.userId}`;
                  const remainingMs = this.pausedTimers.get(timerKey) ?? fullTurnTimeMs;
                  this.pausedTimers.delete(timerKey);

                  this.setTrackedTimer(timerKey, async () => {
                    const forfeitResult = await this.gameService.forfeitMatch(matchId, p.userId);
                    if (forfeitResult) {
                      const parts = (forfeitResult as any).participants || [];
                      parts.forEach((pp: any) => {
                        const opp = parts.find((x: any) => x.userId !== pp.userId);
                        const isWinner = pp.userId !== p.userId;
                        this.server.to(pp.userId).emit('matchUpdate', {
                          matchId, status: 'FINISHED', result: isWinner ? 'win' : 'lose',
                          winnerId: isWinner ? pp.userId : opp?.userId,
                          opponentName: opp?.user?.username || 'Opponent',
                          stake: Number((forfeitResult as any).stake),
                          winAmount: (forfeitResult as any).winAmount, commission: (forfeitResult as any).commission,
                          reason: isWinner ? 'opponent_timeout' : 'timeout',
                        });
                        this.activeMatches.delete(pp.userId);
                      });
                    }
                  }, remainingMs);

                  this.server.to(p.userId).emit('startTurnTimer', { matchId, remainingMs });
                });
              }
            }
          }
        }
      }
    } catch (e) {
      socket.disconnect();
    }
  }

  @SubscribeMessage('requestRejoin')
  async handleRequestRejoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    try {
      const userId = socket.data.user.userId;
      const matchId = data.matchId;

      const match = await this.gameService.getMatchById(matchId);
      if (!match || (match as any).status === 'FINISHED') {
        socket.emit('error', { message: 'Match not found or already finished' });
        return;
      }

      const participants = (match as any).participants || [];
      const isParticipant = participants.some((p: any) => p.userId === userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'You are not a participant in this match' });
        return;
      }

      // Check if user was already forfeited/removed from this match
      if ((match as any).gameType === 'BINGO') {
        const state = this.gameService.getBingoState(matchId);
        if (state && state.forfeitedPlayers.includes(userId)) {
          socket.emit('error', { message: 'You have been removed from this match' });
          return;
        }
      }

      // Register this user as active for this match
      this.activeMatches.set(userId, matchId);

      // Clear any pending disconnect timer
      const pendingTimer = this.pendingDisconnects.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.pendingDisconnects.delete(userId);
      }

      // Notify other players that this player reconnected
      participants.forEach((p: any) => {
        if (p.userId !== userId) {
          this.server.to(p.userId).emit('opponentReconnected', { matchId });
        }
      });

      const opponent = participants.find((pp: any) => pp.userId !== userId);

      let bingoRejoinData: any = {};
      if ((match as any).gameType === 'BINGO') {
        const state = this.gameService.getBingoState(matchId);
        if (state) {
          const playerData = state.players.find(bp => bp.userId === userId);
          const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
          const playerLines: Record<string, number> = {};
          for (const p of state.players) {
            const calledSet = new Set(state.calledNumbers);
            const lines = [
              [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
              [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
              [0,6,12,18,24],[4,8,12,16,20],
            ];
            let count = 0;
            for (const line of lines) {
              if (line.every(idx => calledSet.has(p.board[idx]))) count++;
            }
            playerLines[p.userId] = count;
          }
          bingoRejoinData = {
            board: playerData?.board || [],
            calledNumbers: [...state.calledNumbers],
            playerLines,
            currentTurn: currentTurnUserId,
            isYourTurn: userId === currentTurnUserId,
            myUserId: userId,
          };
        }
      }

      socket.emit('rejoinedMatch', {
        matchId,
        gameType: (match as any).gameType,
        stake: Number((match as any).stake),
        // Provide match start time so the frontend can restore the elapsed match timer
        matchStartedAt: (match as any).createdAt ? new Date((match as any).createdAt).getTime() : Date.now(),
        opponentName: opponent?.user?.username || 'Opponent',
        opponentLevel: opponent?.user?.level || 1,
        allPlayers: participants.map((p: any) => ({
          userId: p.userId,
          username: p.user?.username || 'Player',
          level: p.user?.level || 1,
          avatar: p.user?.avatar || null,
        })),
        ...bingoRejoinData,
      });

      // Remove this player from the disconnected set (they manually requested rejoin via banner)
      const disconnectedSet = this.disconnectedPlayers.get(matchId);
      if (disconnectedSet) {
        disconnectedSet.delete(userId);
        if (disconnectedSet.size === 0) this.disconnectedPlayers.delete(matchId);
      }

      // Check for dual-disconnect: any other participants still offline?
      const stillDisconnected = this.disconnectedPlayers.get(matchId);
      const hasPeersStillDisconnected = stillDisconnected && stillDisconnected.size > 0;

      if (hasPeersStillDisconnected) {
        // The other player is also missing — show wait overlay, don't resume timers.
        const absentUserId = [...stillDisconnected!][0];
        const absentPlayer = participants.find((p: any) => p.userId === absentUserId);
        const disconnectTimeMs = await this.gameService.getDisconnectTimeMs();
        socket.emit('opponentStillDisconnected', {
          matchId,
          opponentName: absentPlayer?.user?.username || 'Opponent',
          reconnectDeadline: Date.now() + disconnectTimeMs, // approximate
        });
        // Do NOT resume timers.
      } else {
      // If Bingo, unpause the game and start the turn timer (resume from paused if available)
      if ((match as any).gameType === 'BINGO') {
        this.gameService.setBingoPaused(matchId, false);
        const state = this.gameService.getBingoState(matchId);
        if (state && !this.turnTimers.has(matchId)) {
          const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
          // Restore paused timer remaining time, or use a fresh full duration
          const remainingMs = this.pausedTimers.get(matchId) ?? await this.gameService.getTurnTimeMs();
          this.pausedTimers.delete(matchId);

          this.setTrackedTimer(matchId, async () => {
            await this.broadcastBingoAutoCall(matchId, currentTurnUserId);
          }, remainingMs);

          participants.forEach((p: any) => {
            this.server.to(p.userId).emit('startTurnTimer', {
              matchId, remainingMs,
              currentTurn: currentTurnUserId,
              isYourTurn: p.userId === currentTurnUserId,
            });
          });
        }
      } else if ((match as any).gameType === 'DICE') {
        const state = this.gameService.getDiceState(matchId);
        if (state) {
          const fullTurnTimeMs = await this.gameService.getTurnTimeMs();

          participants.forEach((p: any) => {
            const isDone = p.userId === state.p1 ? state.p1Done : state.p2Done;
            const timerKey = `${matchId}_${p.userId}`;

            if (!isDone && !this.turnTimers.has(timerKey)) {
              // Restore from paused time, or use fresh full duration
              const remainingMs = this.pausedTimers.get(timerKey) ?? fullTurnTimeMs;
              this.pausedTimers.delete(timerKey);

              this.server.to(p.userId).emit('startTurnTimer', { matchId, remainingMs });
              this.setTrackedTimer(timerKey, async () => {
                const forfeitResult = await this.gameService.forfeitMatch(matchId, p.userId);
                if (forfeitResult) {
                  const parts = (forfeitResult as any).participants || [];
                  parts.forEach((pp: any) => {
                    const opponentUrl = parts.find((ppp: any) => ppp.userId !== pp.userId);
                    const isWinner = pp.userId !== p.userId;
                    this.server.to(pp.userId).emit('matchUpdate', {
                      matchId, status: 'FINISHED', result: isWinner ? 'win' : 'lose',
                      winnerId: isWinner ? pp.userId : opponentUrl?.userId,
                      opponentName: opponentUrl?.user?.username || 'Opponent',
                      stake: Number((forfeitResult as any).stake),
                      winAmount: (forfeitResult as any).winAmount, commission: (forfeitResult as any).commission,
                      reason: isWinner ? 'opponent_timeout' : 'timeout',
                    });
                    this.activeMatches.delete(pp.userId);
                  });
                }
              }, remainingMs);
            }
          });
        }
      }
      } // end else (no peers still disconnected)
    } catch (e: any) {
      socket.emit('error', { message: e.message || 'Failed to rejoin' });
    }
  }

  async handleDisconnect(socket: Socket) {
    try {
      const userId = socket.data?.user?.userId;
      if (!userId) return;

      // --- Room disconnect: remove player from room ---
      const roomId = this.userRooms.get(userId);
      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
          room.players = room.players.filter(p => p.userId !== userId);
          this.userRooms.delete(userId);

          if (room.players.length === 0) {
            this.rooms.delete(roomId);
          } else {
            // Transfer host if host left
            if (room.hostId === userId) {
              room.hostId = room.players[0].userId;
              room.hostName = room.players[0].username;
            }
            this.broadcastRoomUpdate(room);
          }
        }
      }

      // --- Match disconnect: 60s reconnect window ---
      const matchId = this.activeMatches.get(userId);
      if (!matchId) return;

      const match = await this.gameService.getMatchById(matchId);
      if (!match || (match as any).status === 'FINISHED') {
        this.activeMatches.delete(userId);
        return;
      }

      const participants = (match as any).participants || [];
      const disconnectedPlayer = participants.find((p: any) => p.userId === userId);
      
      let activeParticipants = participants;
      if ((match as any).gameType === 'BINGO') {
        activeParticipants = this.getActiveBingoParticipants(matchId, participants);
      }
      
      const disconnectTimeMs = await this.gameService.getDisconnectTimeMs();

      // ✅ TWO-TAB FORFEIT FIX: Only start the disconnect timer if this was the user's LAST active socket.
      // Without this, closing a second tab would forfeit the match still open in the first tab.
      const socketsInRoom = await this.server.in(userId).fetchSockets();
      if (socketsInRoom.length > 0) {
        // User still has at least one other connected socket — do NOT start the forfeit timer
        console.log(`[GATEWAY] User ${userId} disconnected from one tab but still has ${socketsInRoom.length} active socket(s). Ignoring disconnect.`);
        return;
      }
      
      // Track this player as disconnected for their match
      if (!this.disconnectedPlayers.has(matchId)) {
        this.disconnectedPlayers.set(matchId, new Set());
      }
      this.disconnectedPlayers.get(matchId)!.add(userId);

      // Pause (freeze) ALL active turn timers for this match and compute remaining time.
      let frozenRemainingMs: number | null = null;
      for (const [key, tObj] of this.turnTimers.entries()) {
        if (key === matchId || key.startsWith(`${matchId}_`)) {
          clearTimeout(tObj);
          this.turnTimers.delete(key);
          const meta = this.timerMeta.get(key);
          if (meta) {
            const elapsed = Date.now() - meta.startedAt;
            const remaining = Math.max(0, meta.totalMs - elapsed);
            this.pausedTimers.set(key, remaining);
            this.timerMeta.delete(key);
            // Keep the smallest remaining time to broadcast as the frozen display value
            if (frozenRemainingMs === null || remaining < frozenRemainingMs) {
              frozenRemainingMs = remaining;
            }
          }
        }
      }

      // Pause the Bingo game state so no moves/auto-calls can fire
      if ((match as any).gameType === 'BINGO') {
        this.gameService.setBingoPaused(matchId, true);
      }

      // Emit 'timerFrozen' to ALL participants (including both still-connected peers).
      // This lets every client freeze its turn-timer display immediately.
      activeParticipants.forEach((p: any) => {
        this.server.to(p.userId).emit('timerFrozen', {
          matchId,
          remainingMs: frozenRemainingMs,
        });
      });

      // Notify other connected players that the opponent disconnected.
      // Only emit to players who are NOT also currently disconnected.
      const alreadyDisconnected = this.disconnectedPlayers.get(matchId) || new Set();
      activeParticipants.forEach((p: any) => {
        if (p.userId !== userId && !alreadyDisconnected.has(p.userId)) {
          this.server.to(p.userId).emit('opponentDisconnected', {
            matchId,
            opponentName: disconnectedPlayer?.user?.username || 'Opponent',
            reconnectDeadline: Date.now() + disconnectTimeMs,
          });
        }
      });

      const timer = setTimeout(async () => {
        this.pendingDisconnects.delete(userId);
        // Also clean up disconnectedPlayers entry for this user
        const dcSet = this.disconnectedPlayers.get(matchId);
        if (dcSet) {
          dcSet.delete(userId);
          if (dcSet.size === 0) this.disconnectedPlayers.delete(matchId);
        }
        try {
          const currentMatch = await this.gameService.getMatchById(matchId);
          if (!currentMatch || (currentMatch as any).status === 'FINISHED') {
            this.activeMatches.delete(userId);
            return;
          }

          const result = await this.gameService.forfeitMatch(matchId, userId);
          this.activeMatches.delete(userId);

          if (result && (result as any).status === 'CONTINUES') {
            // Bingo: player removed, game continues with remaining players
            const parts = (result as any).participants || [];

            // Notify remaining active players: player removed, overlay dismissed
            const state = this.gameService.getBingoState(matchId);
            const forfeitedList = state?.forfeitedPlayers || [];

            parts.forEach((p: any) => {
              if (p.userId !== userId && !forfeitedList.includes(p.userId)) {
                this.server.to(p.userId).emit('playerForfeited', {
                  matchId,
                  forfeitedUserId: userId,
                  forfeitedUsername: parts.find((pp: any) => pp.userId === userId)?.user?.username || 'Player',
                  reason: 'disconnect_timeout',
                });
                // Dismiss the disconnect overlay
                this.server.to(p.userId).emit('opponentDisconnectResolved', { matchId });
              }
            });

            // Unpause the game and resume
            this.gameService.setBingoPaused(matchId, false);

            // Advance turn if the disconnected player was the current turn
            if (state) {
              const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
              if (forfeitedList.includes(currentTurnUserId)) {
                do {
                  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
                } while (
                  forfeitedList.includes(state.turnOrder[state.currentTurnIndex]) &&
                  forfeitedList.length < state.turnOrder.length
                );
              }

              const nextTurnUserId = state.turnOrder[state.currentTurnIndex];
              const turnTimeMs = await this.gameService.getTurnTimeMs();

              // Clear any stale paused timer entry (player timed out, fresh timer for remaining)
              this.pausedTimers.delete(matchId);

              this.setTrackedTimer(matchId, async () => {
                await this.broadcastBingoAutoCall(matchId, nextTurnUserId);
              }, turnTimeMs);

              parts.forEach((p: any) => {
                if (!forfeitedList.includes(p.userId)) {
                  this.server.to(p.userId).emit('startTurnTimer', {
                    matchId, remainingMs: turnTimeMs,
                    currentTurn: nextTurnUserId,
                    isYourTurn: p.userId === nextTurnUserId,
                  });
                }
              });
            }
          } else if (result) {
            // Last player standing or 1v1 forfeit: game finished
            // The forfeitMatch already marked FINISHED in DB
            const parts = (result as any).participants || [];
            const winnerId = (result as any).winnerId;

            parts.forEach((p: any) => {
              if (p.userId !== userId) {
                this.server.to(p.userId).emit('opponentDisconnectResolved', { matchId });
                this.server.to(p.userId).emit('matchUpdate', {
                  matchId, status: 'FINISHED', result: 'win',
                  winnerId: winnerId || p.userId,
                  opponentName: parts.find((pp: any) => pp.userId === userId)?.user?.username || 'Opponent',
                  stake: Number((result as any).stake),
                  winAmount: (result as any).winAmount, commission: (result as any).commission,
                  reason: 'opponent_timeout',
                });
                this.activeMatches.delete(p.userId);
              }
            });
            // Clean up Bingo state
            this.gameService.cleanupBingoGame(matchId);
          }
        } catch (e) {
          console.error('[GATEWAY] Disconnect timeout handler error:', e);
        }
      }, disconnectTimeMs);
      this.pendingDisconnects.set(userId, timer);
    } catch (e) {}
  }

  // ========================
  //    ROOM EVENTS
  // ========================

  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { gameType: GameType; stake: number; maxPlayers: number; name: string; isPublic: boolean },
  ) {
    const userId = socket.data.user.userId;
    const username = socket.data.user.username;

    // Guard: maintenance mode
    if (await this.gameService.isMaintenanceMode()) {
      socket.emit('roomError', { message: 'Platform is in maintenance mode. No new rooms can be created.' });
      return;
    }
    // Guard: game enabled
    if (!(await this.gameService.isGameEnabled(data.gameType))) {
      socket.emit('roomError', { message: 'This game is currently disabled.' });
      return;
    }

    // Can't be in two rooms at once
    if (this.userRooms.has(userId)) {
      socket.emit('roomError', { message: 'You are already in a room' });
      return;
    }

    const room: GameRoom = {
      id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      code: this.generateRoomCode(),
      hostId: userId,
      hostName: username,
      name: data.name || `${data.gameType} Room`,
      gameType: data.gameType,
      stake: data.stake,
      maxPlayers: data.maxPlayers || 2,
      isPublic: data.isPublic !== false,
      players: [{ userId, username, isReady: true }],
      createdAt: Date.now(),
    };

    this.rooms.set(room.id, room);
    this.userRooms.set(userId, room.id);

    socket.emit('roomCreated', {
      roomId: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
    });

    this.broadcastRoomUpdate(room);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId?: string; code?: string; gameType?: string },
  ) {
    const userId = socket.data.user.userId;
    const username = socket.data.user.username;

    if (this.userRooms.has(userId)) {
      socket.emit('roomError', { message: 'You are already in a room' });
      return;
    }

    let room: GameRoom | undefined;

    if (data.roomId) {
      room = this.rooms.get(data.roomId);
    } else if (data.code) {
      room = Array.from(this.rooms.values()).find(r => r.code === (data.code || '').toUpperCase());
    }

    if (!room) {
      socket.emit('roomError', { message: 'Room not found' });
      return;
    }

    if (data.gameType && room.gameType !== data.gameType) {
      socket.emit('roomError', { message: `This room is for a different game` });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('roomError', { message: 'Room is full' });
      return;
    }

    if (room.players.find(p => p.userId === userId)) {
      socket.emit('roomError', { message: 'You are already in this room' });
      return;
    }

    room.players.push({ userId, username, isReady: false });
    this.userRooms.set(userId, room.id);

    this.broadcastRoomUpdate(room);
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.user.userId;
    const roomId = this.userRooms.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.userRooms.delete(userId);
      return;
    }

    room.players = room.players.filter(p => p.userId !== userId);
    this.userRooms.delete(userId);

    socket.emit('roomLeft', { roomId });

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    } else {
      if (room.hostId === userId) {
        room.hostId = room.players[0].userId;
        room.hostName = room.players[0].username;
      }
      this.broadcastRoomUpdate(room);
    }
  }

  @SubscribeMessage('kickPlayer')
  handleKickPlayer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { userId: string },
  ) {
    const hostId = socket.data.user.userId;
    const roomId = this.userRooms.get(hostId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== hostId) {
      socket.emit('roomError', { message: 'Only the host can kick players' });
      return;
    }

    if (data.userId === hostId) return; // Can't kick yourself

    const kickedPlayer = room.players.find(p => p.userId === data.userId);
    if (!kickedPlayer) return;

    room.players = room.players.filter(p => p.userId !== data.userId);
    this.userRooms.delete(data.userId);

    // Notify kicked player
    this.server.to(data.userId).emit('roomKicked', { roomId, message: 'You have been kicked from the room' });

    this.broadcastRoomUpdate(room);
  }

  @SubscribeMessage('toggleReady')
  handleToggleReady(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.user.userId;
    const roomId = this.userRooms.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.userId === userId);
    if (player) {
      player.isReady = !player.isReady;
      this.broadcastRoomUpdate(room);
    }
  }

  @SubscribeMessage('listRooms')
  handleListRooms(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { gameType?: GameType },
  ) {
    const publicRooms = Array.from(this.rooms.values())
      .filter(r => r.isPublic && r.players.length < r.maxPlayers)
      .filter(r => !data?.gameType || r.gameType === data.gameType)
      .map(r => ({
        id: r.id,
        host: r.hostName,
        name: r.name,
        players: r.players.length,
        maxPlayers: r.maxPlayers,
        stake: r.stake,
        gameType: r.gameType,
        status: 'waiting',
      }));

    socket.emit('roomList', publicRooms);
  }

  // Helper: initialize Bingo game state and emit events to all players
  private async initAndStartBingoGame(matchId: string, participants: any[], stake: number) {
    const playerIds = participants.map((p: any) => p.userId);
    const bingoState = this.gameService.initBingoGame(matchId, playerIds);
    const firstTurn = bingoState.turnOrder[0];

    console.log(`[BINGO] Game ${matchId} initialized. Turn order: ${bingoState.turnOrder.join(', ')}. First turn: ${firstTurn}`);

    const allPlayers = participants.map((p: any) => ({
      userId: p.userId,
      username: p.user?.username || 'Player',
      level: p.user?.level || 1,
      avatar: p.user?.avatar || null,
    }));

    // Send each player their unique board + per-player turn flag
    participants.forEach((p: any) => {
      const playerData = bingoState.players.find(bp => bp.userId === p.userId);
      const isYourTurn = p.userId === firstTurn;
      console.log(`[BINGO] Sending bingoGameStart to ${p.userId} (${p.user?.username}): isYourTurn=${isYourTurn}`);
      this.server.to(p.userId).emit('bingoGameStart', {
        matchId,
        myUserId: p.userId,
        board: playerData?.board || [],
        turnOrder: bingoState.turnOrder,
        currentTurn: firstTurn,
        isYourTurn,
        allPlayers,
      });
    });

    // Emit the initial turn timer for the first player
    const turnTimeMs = await this.gameService.getTurnTimeMs();
    const timer = setTimeout(async () => {
      this.turnTimers.delete(matchId);
      console.log(`[BINGO] Turn timer expired for ${firstTurn} in match ${matchId}`);
      await this.broadcastBingoAutoCall(matchId, firstTurn);
    }, turnTimeMs);
    this.turnTimers.set(matchId, timer);

    participants.forEach((p: any) => {
      const isYourTurn = p.userId === firstTurn;
      this.server.to(p.userId).emit('startTurnTimer', {
        matchId,
        remainingMs: turnTimeMs,
        currentTurn: firstTurn,
        isYourTurn,
      });
    });
  }

  @SubscribeMessage('startRoom')
  async handleStartRoom(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.user.userId;
    const roomId = this.userRooms.get(userId);
    if (!roomId) {
      socket.emit('roomError', { message: 'You are not in a room' });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== userId) {
      socket.emit('roomError', { message: 'Only the host can start the game' });
      return;
    }

    if (room.players.length < 2) {
      socket.emit('roomError', { message: 'Need at least 2 players to start' });
      return;
    }

    try {
      let match: any;

      // Guard: maintenance mode
      if (await this.gameService.isMaintenanceMode()) {
        socket.emit('roomError', { message: 'Platform is in maintenance mode. No new matches can be started.' });
        return;
      }
      // Guard: game enabled
      if (!(await this.gameService.isGameEnabled(room.gameType))) {
        socket.emit('roomError', { message: 'This game is currently disabled.' });
        return;
      }

      if (room.gameType === 'BINGO') {
        // Multi-player Bingo match
        const playerIds = room.players.map(p => p.userId);
        match = await this.gameService.createBingoMatch(playerIds, room.stake);
      } else {
        // 1v1 games
        const p1 = room.players[0];
        const p2 = room.players[1];
        match = await this.gameService.createMatch(p1.userId, p2.userId, room.gameType, room.stake);
      }

      // Track active matches
      room.players.forEach(p => {
        this.activeMatches.set(p.userId, match.id);
        this.userRooms.delete(p.userId);
      });

      // Clean up room
      this.rooms.delete(roomId);

      const participants = (match as any).participants || [];
      const allPlayers = participants.map((p: any) => ({
        userId: p.userId,
        username: p.user?.username || 'Player',
        level: p.user?.level || 1,
        avatar: p.user?.avatar || null,
      }));

      // Send matchFound to each player
      participants.forEach((p: any) => {
        const others = participants.filter((pp: any) => pp.userId !== p.userId);
        this.server.to(p.userId).emit('matchFound', {
          matchId: match.id,
          gameType: match.gameType,
          stake: Number(match.stake),
          yourName: p.user?.username || 'You',
          yourLevel: p.user?.level || 1,
          opponentName: others[0]?.user?.username || 'Opponent',
          opponentLevel: others[0]?.user?.level || 1,
          allPlayers,
        });
      });

      // Initialize Bingo game if applicable
      if (match.gameType === 'BINGO') {
        await this.initAndStartBingoGame(match.id, participants, Number(match.stake));
      } else if (match.gameType === 'DICE') {
        // Timers only begin once a player rolls — see handleMatchMove
        this.gameService.initDiceGame(match.id, participants[0].userId, participants[1].userId);
      }
    } catch (e: any) {
      socket.emit('roomError', { message: e.message });
    }
  }

  // ========================
  //    MATCH EVENTS (existing)
  // ========================

  @SubscribeMessage('leaveQueue')
  handleLeaveQueue(@ConnectedSocket() socket: Socket) {
    const userId = socket.data?.user?.userId;
    if (userId) {
      this.gameService.leaveQueue(userId);
    }
  }

  @SubscribeMessage('joinMatch')
  async handleJoinMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { gameType: GameType; stake: number },
  ) {
    try {
      const userId = socket.data.user.userId;

      // Guard: maintenance mode
      if (await this.gameService.isMaintenanceMode()) {
        socket.emit('error', { message: 'Platform is in maintenance mode. No new matches can be started.' });
        return;
      }
      // Guard: game enabled
      if (!(await this.gameService.isGameEnabled(data.gameType))) {
        socket.emit('error', { message: 'This game is currently disabled.' });
        return;
      }

      const result = await this.gameService.joinQueue(userId, data.gameType, data.stake);

      if (!result) {
        // First player in queue, just waiting
        socket.emit('waitingForOpponent', { gameType: data.gameType, stake: data.stake });
        return;
      }

      // BINGO fill-timer flow
      if (result.filling) {
        // 2+ players in queue, start fill timer if not already running
        const key = result.key;
        socket.emit('waitingForOpponent', {
          gameType: data.gameType,
          stake: data.stake,
          filling: true,
          playerCount: result.playerCount,
        });

        // Notify all queued players about player count
        const queuedIds = this.gameService.getBingoQueue(key);
        queuedIds.forEach(id => {
          this.server.to(id).emit('bingoQueueUpdate', { playerCount: queuedIds.length, maxPlayers: 4 });
        });

        // Start fill timer (gateway provides the callback)
        this.gameService.startBingoFillTimer(key, async (playerIds: string[]) => {
          try {
            const match = await this.gameService.createBingoMatch(playerIds, data.stake);
            const participants = (match as any).participants || [];
            const allPlayers = participants.map((p: any) => ({
              userId: p.userId,
              username: p.user?.username || 'Player',
              level: p.user?.level || 1,
            }));

            participants.forEach((p: any) => {
              this.activeMatches.set(p.userId, match.id);
              const others = participants.filter((pp: any) => pp.userId !== p.userId);
              this.server.to(p.userId).emit('matchFound', {
                matchId: match.id,
                gameType: match.gameType,
                stake: Number(match.stake),
                yourName: p.user?.username || 'You',
                yourLevel: p.user?.level || 1,
                opponentName: others[0]?.user?.username || 'Opponent',
                opponentLevel: others[0]?.user?.level || 1,
                allPlayers,
              });
            });

            if (match.gameType === 'BINGO') {
              this.initAndStartBingoGame(match.id, participants, Number(match.stake));
            } else if (match.gameType === 'DICE') {
              this.gameService.initDiceGame(match.id, participants[0].userId, participants[1].userId);
            }
          } catch (e) {}
        });
        return;
      }

      // Non-BINGO games or BINGO with 4 players (instant match)
      const match = result;
      const participants = (match as any).participants || [];
      participants.forEach((p: any) => {
        this.activeMatches.set(p.userId, match.id);
      });

      const allPlayers = participants.map((p: any) => ({
        userId: p.userId,
        username: p.user?.username || 'Player',
        level: p.user?.level || 1,
        avatar: p.user?.avatar || null,
      }));

      participants.forEach((p: any) => {
        const others = participants.filter((pp: any) => pp.userId !== p.userId);
        this.server.to(p.userId).emit('matchFound', {
          matchId: match.id,
          gameType: match.gameType,
          stake: Number(match.stake),
          yourName: p.user?.username || 'You',
          yourLevel: p.user?.level || 1,
          opponentName: others[0]?.user?.username || 'Opponent',
          opponentLevel: others[0]?.user?.level || 1,
          allPlayers,
        });
      });

      if (match.gameType === 'BINGO') {
        await this.initAndStartBingoGame(match.id, participants, Number(match.stake));
      } else if (match.gameType === 'DICE') {
        // ✅ DICE TIMER FIX: Do NOT start timers here at match creation.
        // Timers only begin once the first player actually rolls the dice.
        this.gameService.initDiceGame(match.id, participants[0].userId, participants[1].userId);
      }
    } catch (e: any) {
      socket.emit('error', { message: e.message });
    }
  }

  @SubscribeMessage('forfeitMatch')
  async handleForfeit(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    try {
      const userId = (socket.data.user as any).userId;
      const result = await this.gameService.forfeitMatch(data.matchId, userId);
      this.activeMatches.delete(userId);

      // Clear any pending disconnect timer for this user
      const pendingTimer = this.pendingDisconnects.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.pendingDisconnects.delete(userId);
      }

      if (result) {
        if ((result as any).status === 'CONTINUES') {
          // Bingo multi-player: player removed, game continues
          const parts = (result as any).participants || [];
          const state = this.gameService.getBingoState(data.matchId);
          const forfeitedList = state?.forfeitedPlayers || [];

          // Send matchUpdate to the forfeiting player so they get a 'You Lost' banner
          const finalMatch = await this.gameService.getMatchById(data.matchId);
          this.server.to(userId).emit('matchUpdate', {
            matchId: data.matchId,
            status: 'FINISHED',
            result: 'lose',
            reason: 'forfeit',
            stake: Number(finalMatch?.stake || 0),
          });

          // Notify remaining active players
          parts.forEach((p: any) => {
            if (p.userId !== userId && !forfeitedList.includes(p.userId)) {
              this.server.to(p.userId).emit('playerForfeited', {
                matchId: data.matchId,
                forfeitedUserId: userId,
                forfeitedUsername: parts.find((pp: any) => pp.userId === userId)?.user?.username || 'Player',
                reason: 'forfeit',
              });
              // Dismiss any disconnect overlay they might have
              this.server.to(p.userId).emit('opponentDisconnectResolved', { matchId: data.matchId });
            }
          });

          // Clear the existing turn timer
          const existingTimer = this.turnTimers.get(data.matchId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            this.turnTimers.delete(data.matchId);
          }

          // Unpause the game (in case it was paused by a disconnect)
          this.gameService.setBingoPaused(data.matchId, false);

          // If it's the forfeiting player's turn, advance to next
          if (state) {
            const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
            if (forfeitedList.includes(currentTurnUserId)) {
              do {
                state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
              } while (
                forfeitedList.includes(state.turnOrder[state.currentTurnIndex]) &&
                forfeitedList.length < state.turnOrder.length
              );
            }

            const nextTurnUserId = state.turnOrder[state.currentTurnIndex];
            const turnTimeMs = await this.gameService.getTurnTimeMs();

            const timerObj = setTimeout(async () => {
              this.turnTimers.delete(data.matchId);
              await this.broadcastBingoAutoCall(data.matchId, nextTurnUserId);
            }, turnTimeMs);
            this.turnTimers.set(data.matchId, timerObj);

            parts.forEach((p: any) => {
              if (!forfeitedList.includes(p.userId)) {
                this.server.to(p.userId).emit('startTurnTimer', {
                  matchId: data.matchId, remainingMs: turnTimeMs,
                  currentTurn: nextTurnUserId,
                  isYourTurn: p.userId === nextTurnUserId,
                });
              }
            });
          }
          return;
        }

        // 1v1 / last player: game finished
        const participants = (result as any).participants || [];
        
        // SEND to forfeiting player so they legitimately lose and see the Result screen
        const finalMatch = await this.gameService.getMatchById(data.matchId);
        this.server.to(userId).emit('matchUpdate', {
          matchId: data.matchId,
          status: 'FINISHED',
          result: 'lose',
          yourMove: null, opponentMove: null,
          opponentName: 'Opponent',
          winnerId: null,
          stake: Number(finalMatch?.stake || 0),
          reason: 'forfeit',
        });

        participants.forEach((p: any) => {
          if (p.userId !== userId) {
            const meP = participants.find((pp: any) => pp.userId === userId);
            this.server.to(p.userId).emit('opponentDisconnectResolved', { matchId: data.matchId });
            this.server.to(p.userId).emit('matchUpdate', {
              matchId: data.matchId, status: 'FINISHED', result: 'win',
              yourMove: null, opponentMove: null,
              opponentName: meP?.user?.username || 'Opponent',
              winnerId: p.userId,
              stake: Number((result as any).stake), winAmount: (result as any).winAmount, commission: (result as any).commission, reason: 'opponent_forfeit',
            });
            this.activeMatches.delete(p.userId);
          }
        });
        this.gameService.cleanupBingoGame(data.matchId);
      }
    } catch (e: any) {
      socket.emit('error', { message: e.message });
    }
  }

  // Dedicated method for broadcasting auto-called numbers (timeout or disconnect)
  private async broadcastBingoAutoCall(matchId: string, timedOutUserId: string) {
    try {
      // Check if game is paused before auto-calling
      const checkState = this.gameService.getBingoState(matchId);
      if (!checkState || checkState.paused) {
        console.log(`[BINGO] Auto-call skipped for ${timedOutUserId} in ${matchId} (game paused or not found)`);
        return;
      }

      const autoCallResult = await this.gameService.bingoAutoCallRandom(matchId, timedOutUserId);
      if (!autoCallResult || !autoCallResult.success || !('numberCalled' in autoCallResult)) {
        console.log(`[BINGO] Auto-call failed for ${timedOutUserId} in ${matchId}:`, autoCallResult?.error);
        return;
      }

      const match = await this.gameService.getMatchById(matchId);
      const participants = (match as any)?.participants || [];

      if (autoCallResult.winnerId) {
        // Cache active participant IDs before finalizeBingoWin destroys the state
        const activeIds = new Set(this.getActiveBingoParticipants(matchId, participants).map((p: any) => p.userId));
        
        // Game over via auto-call
        const finalMatch = await this.gameService.finalizeBingoWin(matchId, autoCallResult.winnerId);
        if (finalMatch) {
          const parts = (finalMatch as any).participants || [];
          const activeParticipants = parts.filter((p: any) => activeIds.has(p.userId));
          activeParticipants.forEach((p: any) => {
            const opponent = activeParticipants.find((pp: any) => pp.userId !== p.userId);
            const playerResult = autoCallResult.winnerId === p.userId ? 'win' : 'lose';
            this.server.to(p.userId).emit('bingoNumberCalled', {
              number: autoCallResult.numberCalled,
              calledBy: timedOutUserId,
              calledNumbers: autoCallResult.calledNumbers,
              nextTurn: null,
              isYourTurn: false,
              playerLines: autoCallResult.playerLines,
              autoCall: true,
            });
            this.server.to(p.userId).emit('matchUpdate', {
              matchId,
              status: 'FINISHED',
              result: playerResult,
              winnerId: autoCallResult.winnerId,
              opponentName: opponent?.user?.username || 'Opponent',
              stake: Number((finalMatch as any).stake),
              winAmount: (finalMatch as any).winAmount, commission: (finalMatch as any).commission,
              playerLines: autoCallResult.playerLines,
            });
            this.activeMatches.delete(p.userId);
          });
        }
      } else {
        // Game continues after auto-call — only broadcast to active players
        const activeParticipants = this.getActiveBingoParticipants(matchId, participants);
        activeParticipants.forEach((p: any) => {
          const isYourTurn = p.userId === autoCallResult.nextTurnUserId;
          this.server.to(p.userId).emit('bingoNumberCalled', {
            number: autoCallResult.numberCalled,
            calledBy: timedOutUserId,
            calledNumbers: autoCallResult.calledNumbers,
            nextTurn: autoCallResult.nextTurnUserId,
            isYourTurn,
            playerLines: autoCallResult.playerLines,
            autoCall: true,
          });
        });

        // Start timer for the NEXT player
        const turnTimeMs = await this.gameService.getTurnTimeMs();
        const nextTimer = setTimeout(async () => {
          this.turnTimers.delete(matchId);
          await this.broadcastBingoAutoCall(matchId, autoCallResult.nextTurnUserId!);
        }, turnTimeMs);
        this.turnTimers.set(matchId, nextTimer);

        activeParticipants.forEach((p: any) => {
          const isYourTurn = p.userId === autoCallResult.nextTurnUserId;
          this.server.to(p.userId).emit('startTurnTimer', {
            matchId,
            remainingMs: turnTimeMs,
            currentTurn: autoCallResult.nextTurnUserId,
            isYourTurn,
          });
        });
      }
    } catch (e) {
      console.error('[BINGO] broadcastBingoAutoCall error:', e);
    }
  }

  @SubscribeMessage('bingoCall')
  async handleBingoCall(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { matchId: string; number: number },
  ) {
    try {
      const userId = socket.data.user.userId;

      // Check if game is paused
      const checkState = this.gameService.getBingoState(data.matchId);
      if (checkState?.paused) {
        socket.emit('error', { message: 'Game is paused — a player has disconnected' });
        return;
      }

      const result = await this.gameService.bingoCallNumber(data.matchId, userId, data.number);

      if (!result.success) {
        socket.emit('error', { message: result.error || 'Invalid move' });
        return;
      }

      // Clear any existing turn timer
      const existingTimer = this.turnTimers.get(data.matchId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.turnTimers.delete(data.matchId);
      }

      // Get match participants for broadcasting
      const match = await this.gameService.getMatchById(data.matchId);
      const participants = (match as any)?.participants || [];

      if (result.winnerId) {
        // Cache active participant IDs before finalizeBingoWin destroys the state
        const activeIds = new Set(this.getActiveBingoParticipants(data.matchId, participants).map((p: any) => p.userId));
        
        // Game over — finalize
        const finalMatch = await this.gameService.finalizeBingoWin(data.matchId, result.winnerId);
        if (finalMatch) {
          const parts = (finalMatch as any).participants || [];
          const activeParticipants = parts.filter((p: any) => activeIds.has(p.userId));
          activeParticipants.forEach((p: any) => {
            const opponent = activeParticipants.find((pp: any) => pp.userId !== p.userId);
            const playerResult = result.winnerId === p.userId ? 'win' : 'lose';
            this.server.to(p.userId).emit('bingoNumberCalled', {
              number: data.number,
              calledBy: userId,
              calledNumbers: result.calledNumbers,
              nextTurn: null,
              playerLines: result.playerLines,
            });
            this.server.to(p.userId).emit('matchUpdate', {
              matchId: data.matchId,
              status: 'FINISHED',
              result: playerResult,
              winnerId: result.winnerId,
              opponentName: opponent?.user?.username || 'Opponent',
              stake: Number((finalMatch as any).stake),
              winAmount: (finalMatch as any).winAmount, commission: (finalMatch as any).commission,
              playerLines: result.playerLines,
            });
            this.activeMatches.delete(p.userId);
          });
        }
      } else {
        // Game continues — broadcast only to active players
        const activeParticipants = this.getActiveBingoParticipants(data.matchId, participants);
        console.log(`[BINGO] Number ${data.number} called by ${userId} in match ${data.matchId}. Next turn: ${result.nextTurnUserId}`);
        activeParticipants.forEach((p: any) => {
          const isYourTurn = p.userId === result.nextTurnUserId;
          this.server.to(p.userId).emit('bingoNumberCalled', {
            number: data.number,
            calledBy: userId,
            calledNumbers: result.calledNumbers,
            nextTurn: result.nextTurnUserId,
            isYourTurn,
            playerLines: result.playerLines,
          });
        });

        // Start turn timer for next player
        const turnTimeMs = await this.gameService.getTurnTimeMs();
        const timer = setTimeout(async () => {
          this.turnTimers.delete(data.matchId);
          await this.broadcastBingoAutoCall(data.matchId, result.nextTurnUserId!);
        }, turnTimeMs);
        this.turnTimers.set(data.matchId, timer);

        // Emit turn timer only to active players
        activeParticipants.forEach((p: any) => {
          const isYourTurn = p.userId === result.nextTurnUserId;
          this.server.to(p.userId).emit('startTurnTimer', {
            matchId: data.matchId,
            remainingMs: turnTimeMs,
            currentTurn: result.nextTurnUserId,
            isYourTurn,
          });
        });
      }
    } catch (e: any) {
      socket.emit('error', { message: e.message });
    }
  }

  @SubscribeMessage('startRolling')
  async handleStartRolling(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    const userId = (socket.data.user as any).userId;
    const match = await this.gameService.getMatchById(data.matchId);
    const participants = (match as any)?.participants || [];
    participants.forEach((p: any) => {
      if (p.userId !== userId) {
        this.server.to(p.userId).emit('opponentRolling', { matchId: data.matchId });
      }
    });
  }

  @SubscribeMessage('submitMove')
  async handleMatchMove(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { matchId: string; move: string },
  ) {
    try {
      const userId = (socket.data.user as any).userId;
      const result = await this.gameService.submitMove(userId, data.matchId, data.move);

      if (result && (result as any).isDice) {
        if ((result as any).status === 'update') {
          const state = (result as any).state;
          const participants = (result as any).participants || [];
          
          // Clear and restart timer ONLY for the moving player if not done
          const timerKey = `${data.matchId}_${userId}`;
          const existingTimer = this.turnTimers.get(timerKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
            this.turnTimers.delete(timerKey);
          }

          const turnTimeMs = await this.gameService.getTurnTimeMs();

          participants.forEach((p: any) => {
            const pUpdate = {
              myScore: p.userId === state.p1 ? state.p1Score : state.p2Score,
              myRolls: p.userId === state.p1 ? state.p1Rolls : state.p2Rolls,
              myDone: p.userId === state.p1 ? state.p1Done : state.p2Done,
              myLastRoll: p.userId === state.p1 ? state.p1LastRoll : state.p2LastRoll,
              opponentScore: p.userId === state.p1 ? state.p2Score : state.p1Score,
              opponentRolls: p.userId === state.p1 ? state.p2Rolls : state.p1Rolls,
              opponentDone: p.userId === state.p1 ? state.p1Done : state.p2Done,
              opponentLastRoll: p.userId === state.p1 ? state.p2LastRoll : state.p1LastRoll,
            };
            this.server.to(p.userId).emit('diceUpdate', pUpdate);

            // Restart timer for the player who just moved IF they are not done
            const isMe = p.userId === userId;
            const myDone = p.userId === state.p1 ? state.p1Done : state.p2Done;
            if (isMe && !myDone) {
              this.server.to(p.userId).emit('startTurnTimer', { matchId: data.matchId, remainingMs: turnTimeMs });
              const newTimer = setTimeout(async () => {
                this.turnTimers.delete(timerKey);
                const forfeitResult = await this.gameService.forfeitMatch(data.matchId, userId);
                if (forfeitResult) {
                  const parts = (forfeitResult as any).participants || [];
                  parts.forEach((pp: any) => {
                    const opponentUrl = parts.find((ppp: any) => ppp.userId !== pp.userId);
                    const isWinner = pp.userId !== userId;
                    this.server.to(pp.userId).emit('matchUpdate', {
                      matchId: data.matchId,
                      status: 'FINISHED',
                      result: isWinner ? 'win' : 'lose',
                      winnerId: isWinner ? pp.userId : opponentUrl?.userId,
                      opponentName: opponentUrl?.user?.username || 'Opponent',
                      stake: Number((forfeitResult as any).stake),
                      winAmount: (forfeitResult as any).winAmount, commission: (forfeitResult as any).commission,
                      reason: isWinner ? 'opponent_timeout' : 'timeout',
                    });
                    this.activeMatches.delete(pp.userId);
                  });
                }
              }, turnTimeMs);
              this.turnTimers.set(timerKey, newTimer);
            }
          });
          return;
        } else if ((result as any).status === 'finished') {
          (result as any).status = 'FINISHED';
        }
      }

      if (result && (result as any).status === 'FINISHED') {
        const timerObj = this.turnTimers.get(data.matchId);
        if (timerObj) {
          clearTimeout(timerObj);
          this.turnTimers.delete(data.matchId);
        }

        const moves = (result as any).moves || [];
        const participants = (result as any).participants || [];
        const winnerId = (result as any).winnerId;
        const stake = Number((result as any).stake);

        participants.forEach((p: any) => {
          const myMove = moves.find((m: any) => m.userId === p.userId);
          const opMove = moves.find((m: any) => m.userId !== p.userId);
          const opponent = participants.find((pp: any) => pp.userId !== p.userId);
          const playerResult = winnerId === null ? 'draw' : winnerId === p.userId ? 'win' : 'lose';

          this.server.to(p.userId).emit('matchUpdate', {
            matchId: data.matchId, status: 'FINISHED', result: playerResult,
            yourMove: myMove?.move || null, opponentMove: opMove?.move || null,
            opponentName: opponent?.user?.username || 'Opponent',
            winnerId, stake, winAmount: (result as any).winAmount, commission: (result as any).commission,
          });
          this.activeMatches.delete(p.userId);
        });
      } else if (result) {
        socket.emit('moveAccepted', { status: 'waiting' });
        const participants = (result as any).participants || [];

        // START TIMER
        const turnTimeMs = await this.gameService.getTurnTimeMs();
        const timerObj = setTimeout(async () => {
          this.turnTimers.delete(data.matchId);
          try {
            const slowPlayer = participants.find((p: any) => p.userId !== userId);
            if (slowPlayer) {
              const forfeitResult = await this.gameService.forfeitMatch(data.matchId, slowPlayer.userId);
              this.activeMatches.delete(slowPlayer.userId);

              if (forfeitResult) {
                const parts = (forfeitResult as any).participants || [];
                parts.forEach((p: any) => {
                  const opponentP = parts.find((pp: any) => pp.userId !== p.userId);
                  this.server.to(p.userId).emit('matchUpdate', {
                    matchId: data.matchId, status: 'FINISHED', result: p.userId === slowPlayer.userId ? 'lose' : 'win',
                    yourMove: null, opponentMove: null,
                    opponentName: opponentP?.user?.username || 'Opponent',
                    winnerId: p.userId === slowPlayer.userId ? opponentP?.userId : p.userId,
                    stake: Number((forfeitResult as any).stake),
                    winAmount: (forfeitResult as any).winAmount, commission: (forfeitResult as any).commission,
                    reason: 'opponent_timeout',
                  });
                  this.activeMatches.delete(p.userId);
                });
              }
            }
          } catch(e) {}
        }, turnTimeMs);
        this.turnTimers.set(data.matchId, timerObj);

        participants.forEach((p: any) => {
          if (p.userId !== userId) {
            this.server.to(p.userId).emit('opponentMoved', { matchId: data.matchId });
          }
          this.server.to(p.userId).emit('startTurnTimer', { matchId: data.matchId, remainingMs: turnTimeMs });
        });
      }
    } catch (e: any) {
      socket.emit('error', { message: e.message });
    }
  }

  // ========================
  //    CHAT SYSTEM
  // ========================

  @SubscribeMessage('joinChat')
  handleJoinChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { channel: string },
  ) {
    const roomName = `chat:${data.channel}`;
    socket.join(roomName);

    // Send recent history
    const history = this.chatMessages.get(data.channel) || [];
    socket.emit('chatHistory', { channel: data.channel, messages: history });
  }

  @SubscribeMessage('leaveChat')
  handleLeaveChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { channel: string },
  ) {
    const roomName = `chat:${data.channel}`;
    socket.leave(roomName);
  }

  @SubscribeMessage('chatMessage')
  handleChatMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { channel: string; text: string },
  ) {
    const user = socket.data?.user;
    if (!user || !data.text?.trim() || !data.channel) return;

    const message = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      sender: user.username,
      text: data.text.trim(),
      timestamp: new Date(),
      channel: data.channel.split(':')[0], // Extract channel type (e.g. "global" from "global:BINGO")
    };

    // Store in memory
    if (!this.chatMessages.has(data.channel)) {
      this.chatMessages.set(data.channel, []);
    }
    const messages = this.chatMessages.get(data.channel)!;
    messages.push(message);

    // Limit to 100 max
    if (messages.length > 100) {
      messages.shift();
    }

    // Broadcast to everyone in that specific chat room
    this.server.to(`chat:${data.channel}`).emit('chatMessage', { channel: data.channel, message });
  }
}
