import { motion, AnimatePresence } from "framer-motion";
import { X, Users, DollarSign, Edit3, Play } from "lucide-react";
import { useState } from "react";
import { sounds } from "@/components/game/AnimationEffects";

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (config: RoomConfig) => void;
  gameName: string;
  isBingo?: boolean;
}

export interface RoomConfig {
  name: string;
  maxPlayers: number;
  stake: number;
}

const CreateRoomDialog = ({ isOpen, onClose, onCreateRoom, gameName, isBingo = false }: CreateRoomDialogProps) => {
  const [roomName, setRoomName] = useState(`${gameName} Room`);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [stake, setStake] = useState("100");

  const minPlayers = 2;
  const maxPlayersLimit = isBingo ? 4 : 2;
  const playerOptions = Array.from({ length: maxPlayersLimit - minPlayers + 1 }, (_, i) => minPlayers + i);

  const handleCreate = () => {
    const stakeNum = parseInt(stake) || 100;
    sounds.select();
    onCreateRoom({ name: roomName, maxPlayers, stake: stakeNum });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-background/70 backdrop-blur-sm z-[60]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto z-[70] card-game rounded-2xl p-5 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-foreground text-lg">Create Room</h2>
              <motion.button whileTap={{ scale: 0.85 }} onClick={onClose} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Edit3 className="w-3 h-3" /> Room Name
              </label>
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={30} className="w-full h-11 px-4 rounded-xl bg-muted border border-border text-foreground font-display font-semibold text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all" placeholder="Enter room name..." />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Players
              </label>
              <div className="flex gap-2">
                {playerOptions.map((count) => (
                  <motion.button key={count} whileTap={{ scale: 0.92 }} onClick={() => { setMaxPlayers(count); sounds.tap(); }} className={`flex-1 py-3 rounded-xl font-display font-bold text-sm transition-all ${maxPlayers === count ? "bg-primary text-primary-foreground glow-primary" : "bg-muted text-foreground border border-border"}`}>
                    {count === 2 ? "1v1" : `${count}P`}
                  </motion.button>
                ))}
              </div>
              {!isBingo && maxPlayersLimit === 2 && (
                <p className="text-[10px] text-muted-foreground">This game only supports 1v1</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Bet Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-display font-bold text-sm">$</span>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  placeholder="Enter amount"
                  min={1}
                  className="w-full h-11 pl-7 pr-4 rounded-xl bg-muted border border-border text-foreground font-display font-bold text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
            </div>

            <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} onClick={handleCreate} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-base glow-primary flex items-center justify-center gap-2">
              <Play className="w-5 h-5" />
              Create Room
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreateRoomDialog;
