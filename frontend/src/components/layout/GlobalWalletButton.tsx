import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { WalletCards } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export default function GlobalWalletButton() {
  const { pathname } = useLocation();
  const isAuth = pathname === '/auth' || pathname === '/choose-username';
  
  const { data: balance = 0 } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No token');
      return api.get('/wallet/balance', token);
    },
    refetchInterval: 5000,
    enabled: !isAuth
  });

  if (isAuth) return null;

  return (
    <div className="fixed top-4 right-16 z-50 pointer-events-auto">
      <a 
        href="https://habt.utopiadigitalsolutions.com/deposit"
        className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 py-1.5 px-3.5 rounded-full border border-primary/40 transition-colors shadow-lg backdrop-blur-md"
      >
        <WalletCards className="w-4 h-4 text-primary shrink-0" />
        <div className="flex flex-col items-start justify-center">
          <span className="text-[9px] text-muted-foreground uppercase leading-none font-bold tracking-wider mb-0.5">Deposit</span>
          <span className="text-[13px] font-black text-foreground leading-none">{(Number(balance?.total ?? balance?.balance ?? (typeof balance === 'number' ? balance : 0)) || 0).toLocaleString()} <span className="text-[10px] text-muted-foreground">ETB</span></span>
        </div>
      </a>
    </div>
  );
}
