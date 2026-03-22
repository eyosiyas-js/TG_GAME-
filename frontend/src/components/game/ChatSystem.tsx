import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Hash, Users, Gamepad2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type ChatChannel = "global" | "room" | "game";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  channel: ChatChannel;
  isSystem?: boolean;
}

const MOCK_MESSAGES: ChatMessage[] = [
  { id: "1", sender: "Player_42", text: "Anyone up for Bingo?", timestamp: new Date(Date.now() - 120000), channel: "global" },
  { id: "2", sender: "Lucky_13", text: "GG last round 🔥", timestamp: new Date(Date.now() - 90000), channel: "global" },
  { id: "3", sender: "DiceKing", text: "Looking for Dice Battle partners", timestamp: new Date(Date.now() - 45000), channel: "global" },
  { id: "4", sender: "System", text: "ProGamer joined the room", timestamp: new Date(Date.now() - 30000), channel: "room", isSystem: true },
  { id: "5", sender: "RollMaster", text: "Ready when you are!", timestamp: new Date(Date.now() - 20000), channel: "room" },
  { id: "6", sender: "System", text: "Game started!", timestamp: new Date(Date.now() - 10000), channel: "game", isSystem: true },
  { id: "7", sender: "Bot_1", text: "Nice roll! 🎲", timestamp: new Date(Date.now() - 5000), channel: "game" },
];

const channelConfig = {
  global: { icon: Hash, label: "Global Lobby", color: "text-primary" },
  room: { icon: Users, label: "Room Chat", color: "text-secondary" },
  game: { icon: Gamepad2, label: "In-Game", color: "text-accent" },
};

interface ChatSystemProps {
  isOpen: boolean;
  onClose: () => void;
  availableChannels?: ChatChannel[];
  currentChannel?: ChatChannel;
}

const ChatSystem = ({ isOpen, onClose, availableChannels = ["global"], currentChannel: initialChannel }: ChatSystemProps) => {
  const [channel, setChannel] = useState<ChatChannel>(initialChannel || availableChannels[0]);
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, channel]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "You",
      text: input.trim(),
      timestamp: new Date(),
      channel,
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
  };

  const filteredMessages = messages.filter((m) => m.channel === channel);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60]"
          />

          {/* Chat Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm z-[70] flex flex-col bg-background border-l border-border"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-foreground text-sm">Chat</h2>
              </div>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            </div>

            {/* Channel Tabs */}
            <div className="flex border-b border-border">
              {availableChannels.map((ch) => {
                const config = channelConfig[ch];
                const Icon = config.icon;
                const isActive = channel === ch;
                return (
                  <button
                    key={ch}
                    onClick={() => setChannel(ch)}
                    className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-display font-bold transition-all relative ${
                      isActive ? config.color : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {config.label}
                    {isActive && (
                      <motion.div
                        layoutId="chatTab"
                        className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-hide">
              {filteredMessages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground text-center">No messages yet.<br />Start the conversation!</p>
                </div>
              ) : (
                filteredMessages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    {msg.isSystem ? (
                      <div className="text-center py-1">
                        <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                          {msg.text}
                        </span>
                      </div>
                    ) : (
                      <div className={`flex gap-2 ${msg.sender === "You" ? "flex-row-reverse" : ""}`}>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[10px] font-display font-bold text-primary-foreground flex-shrink-0">
                          {msg.sender.charAt(0)}
                        </div>
                        <div className={`max-w-[75%] ${msg.sender === "You" ? "items-end" : "items-start"}`}>
                          <div className="flex items-baseline gap-1.5 mb-0.5">
                            {msg.sender !== "You" && (
                              <span className="text-[10px] font-display font-semibold text-foreground">{msg.sender}</span>
                            )}
                            <span className="text-[9px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                          </div>
                          <div className={`px-3 py-1.5 rounded-xl text-xs ${
                            msg.sender === "You"
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-muted text-foreground rounded-tl-sm"
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border safe-area-bottom">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={`Message ${channelConfig[channel].label}...`}
                  className="flex-1 h-10 px-3 rounded-xl bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground"
                />
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatSystem;
