import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Games from "./pages/Games";
import WalletPage from "./pages/WalletPage";
import Profile from "./pages/Profile";
import SettingsPage from "./pages/SettingsPage";
import Leaderboard from "./pages/Leaderboard";
import RockPaperScissors from "./pages/play/RockPaperScissors";
import BingoGame from "./pages/play/BingoGame";
import GuessMyNumber from "./pages/play/GuessMyNumber";
import DiceBattle from "./pages/play/DiceBattle";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import NotificationsPage from "./pages/NotificationsPage";
import DepositPage from "./pages/DepositPage";
import WithdrawPage from "./pages/WithdrawPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/games" element={<Games />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/deposit" element={<DepositPage />} />
            <Route path="/withdraw" element={<WithdrawPage />} />
            <Route path="/play/rps" element={<RockPaperScissors />} />
            <Route path="/play/bingo" element={<BingoGame />} />
            <Route path="/play/guess" element={<GuessMyNumber />} />
            <Route path="/play/dice" element={<DiceBattle />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
