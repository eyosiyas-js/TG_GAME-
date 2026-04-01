import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Hash, Users } from "lucide-react";
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

const LogoIcon = ({ className }: { className?: string }) => (
  <img src="/logo.png" className={`object-contain opacity-70 grayscale ${className}`} alt="In-Game" />
);

const channelConfig = {
  global: { icon: Hash, label: "Global Lobby", color: "text-primary" },
  room: { icon: Users, label: "Room Chat", color: "text-secondary" },
  game: { icon: LogoIcon, label: "In-Game", color: "text-accent" },
};

interface ChatSystemProps {
  isOpen: boolean;
  onClose: () => void;
  availableChannels?: ChatChannel[];
  currentChannel?: ChatChannel;
  socketRef?: React.MutableRefObject<any>;
  gameType?: string;
  roomId?: string;
  matchId?: string;
  onUnreadMessagesChange?: (hasUnread: boolean) => void;
}

const ChatSystem = ({ isOpen, onClose, availableChannels = ["global"], currentChannel: initialChannel, socketRef, gameType, roomId, matchId, onUnreadMessagesChange }: ChatSystemProps) => {
  const [channel, setChannel] = useState<ChatChannel>(initialChannel || availableChannels[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      onUnreadMessagesChange?.(false);
    }
  }, [isOpen, onUnreadMessagesChange]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Read current user
  let myUsername = "You";
  try {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      myUsername = JSON.parse(userStr).username;
    }
  } catch (e) {}

  const getChannelPrefix = (ch: ChatChannel) => {
    switch (ch) {
      case "global": return gameType ? `global:${gameType}` : null;
      case "room": return roomId ? `room:${roomId}` : null;
      case "game": return matchId ? `match:${matchId}` : null;
      default: return null;
    }
  };

  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    // Join all available channels that have a valid context
    availableChannels.forEach((ch) => {
      const channelId = getChannelPrefix(ch);
      if (channelId) socket.emit("joinChat", { channel: channelId });
    });

    const handleChatHistory = (data: { channel: string; messages: any[] }) => {
      const parsedChannel = data.channel.split(":")[0] as ChatChannel;
      if (!availableChannels.includes(parsedChannel)) return;
      
      const formattedMessages = data.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
        channel: parsedChannel,
      }));

      setMessages(prev => {
        // Replace messages for this channel
        const filtered = prev.filter(m => m.channel !== parsedChannel);
        return [...filtered, ...formattedMessages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      });
    };

    const handleChatMessage = (data: { channel: string; message: any }) => {
      const parsedChannel = data.channel.split(":")[0] as ChatChannel;
      if (!availableChannels.includes(parsedChannel)) return;

      const formattedMsg: ChatMessage = {
        ...data.message,
        timestamp: new Date(data.message.timestamp),
        channel: parsedChannel,
      };

      setMessages(prev => [...prev, formattedMsg]);

      // Trigger unread notification if closed and message is from someone else
      if (!isOpenRef.current && formattedMsg.sender !== myUsername) {
        onUnreadMessagesChange?.(true);
      }
    };

    socket.on("chatHistory", handleChatHistory);
    socket.on("chatMessage", handleChatMessage);

    return () => {
      socket.off("chatHistory", handleChatHistory);
      socket.off("chatMessage", handleChatMessage);
      availableChannels.forEach((ch) => {
        const channelId = getChannelPrefix(ch);
        if (channelId) socket.emit("leaveChat", { channel: channelId });
      });
    };
  }, [socketRef?.current, gameType, roomId, matchId, availableChannels.join(",")]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, channel]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef?.current) return;
    
    const channelId = getChannelPrefix(channel);
    if (!channelId) return;

    socketRef.current.emit("chatMessage", {
      channel: channelId,
      text: input.trim(),
    });

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
                      <div className={`flex gap-2 ${msg.sender === myUsername ? "flex-row-reverse" : ""}`}>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[10px] font-display font-bold text-primary-foreground flex-shrink-0">
                          {msg.sender.charAt(0).toUpperCase()}
                        </div>
                        <div className={`max-w-[75%] ${msg.sender === myUsername ? "items-end" : "items-start"}`}>
                          <div className="flex items-baseline gap-1.5 mb-0.5">
                            {msg.sender !== myUsername && (
                              <span className="text-[10px] font-display font-semibold text-foreground">{msg.sender}</span>
                            )}
                            <span className="text-[9px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                          </div>
                          <div className={`px-3 py-1.5 rounded-xl text-xs ${
                            msg.sender === myUsername
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
