import { motion, AnimatePresence } from "framer-motion";
import { Search, X, UserPlus, Clock, Send, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { sounds } from "@/components/game/AnimationEffects";

interface Player {
  id: string;
  username: string;
  avatar: string;
  wins: number;
  level: number;
  online: boolean;
}

const MOCK_PLAYERS: Player[] = [
  { id: "1", username: "Player_42", avatar: "P", wins: 45, level: 12, online: true },
  { id: "2", username: "Lucky_13", avatar: "L", wins: 32, level: 8, online: true },
  { id: "3", username: "DiceKing", avatar: "D", wins: 67, level: 15, online: false },
  { id: "4", username: "ProGamer", avatar: "P", wins: 89, level: 20, online: true },
  { id: "5", username: "RollMaster", avatar: "R", wins: 28, level: 7, online: true },
  { id: "6", username: "BingoQueen", avatar: "B", wins: 55, level: 14, online: false },
  { id: "7", username: "AcePlayer", avatar: "A", wins: 41, level: 11, online: true },
];

const RECENT_PLAYERS: (Player & { lastPlayed: string })[] = [
  { ...MOCK_PLAYERS[0], lastPlayed: "5 min ago" },
  { ...MOCK_PLAYERS[1], lastPlayed: "1 hour ago" },
  { ...MOCK_PLAYERS[3], lastPlayed: "Yesterday" },
];

interface InviteSystemProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite?: (playerId: string) => void;
  onViewProfile?: (playerId: string) => void;
}

const InviteSystem = ({ isOpen, onClose, onInvite, onViewProfile }: InviteSystemProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sentInvites, setSentInvites] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"search" | "recent">("search");

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return MOCK_PLAYERS.filter((p) =>
      p.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleInvite = (playerId: string) => {
    sounds.success();
    setSentInvites((prev) => new Set(prev).add(playerId));
    onInvite?.(playerId);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 max-h-[80vh] z-[70] bg-background border-t border-border rounded-t-2xl flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3">
              <h2 className="font-display font-bold text-foreground text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Invite Players
              </h2>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border mx-4">
              {(["search", "recent"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-display font-bold transition-all relative ${
                    activeTab === tab ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {tab === "search" ? <Search className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    {tab === "search" ? "Search Players" : "Recent"}
                  </span>
                  {activeTab === tab && (
                    <motion.div
                      layoutId="inviteTab"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[200px] max-h-[50vh]">
              {activeTab === "search" && (
                <>
                  {/* Search Input */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by username..."
                      className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground"
                      autoFocus
                    />
                  </div>

                  {searchQuery && searchResults.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No players found</p>
                  )}

                  {searchResults.map((player, i) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      index={i}
                      invited={sentInvites.has(player.id)}
                      onInvite={() => handleInvite(player.id)}
                      onViewProfile={() => onViewProfile?.(player.id)}
                    />
                  ))}

                  {!searchQuery && (
                    <p className="text-sm text-muted-foreground text-center py-8">Type a username to search</p>
                  )}
                </>
              )}

              {activeTab === "recent" && (
                <>
                  {RECENT_PLAYERS.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No recent players</p>
                  ) : (
                    RECENT_PLAYERS.map((player, i) => (
                      <PlayerRow
                        key={player.id}
                        player={player}
                        index={i}
                        invited={sentInvites.has(player.id)}
                        onInvite={() => handleInvite(player.id)}
                        onViewProfile={() => onViewProfile?.(player.id)}
                        subtitle={player.lastPlayed}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

interface PlayerRowProps {
  player: Player;
  index: number;
  invited: boolean;
  onInvite: () => void;
  onViewProfile: () => void;
  subtitle?: string;
}

const PlayerRow = ({ player, index, invited, onInvite, onViewProfile, subtitle }: PlayerRowProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.04 }}
    className="card-game rounded-xl p-3 flex items-center gap-3"
  >
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onViewProfile}
      className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-display font-bold text-primary-foreground relative"
    >
      {player.avatar}
      {player.online && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
      )}
    </motion.button>
    <button onClick={onViewProfile} className="flex-1 text-left min-w-0">
      <p className="text-sm font-display font-semibold text-foreground truncate">{player.username}</p>
      <p className="text-[10px] text-muted-foreground">
        {subtitle || `Lvl ${player.level} • ${player.wins} wins`}
      </p>
    </button>
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onInvite}
      disabled={invited}
      className={`px-3 py-2 rounded-lg font-display font-bold text-xs flex items-center gap-1.5 transition-all ${
        invited
          ? "bg-primary/20 text-primary"
          : "bg-primary text-primary-foreground"
      }`}
    >
      {invited ? (
        <>
          <Check className="w-3 h-3" /> Sent
        </>
      ) : (
        <>
          <Send className="w-3 h-3" /> Invite
        </>
      )}
    </motion.button>
  </motion.div>
);

export default InviteSystem;
