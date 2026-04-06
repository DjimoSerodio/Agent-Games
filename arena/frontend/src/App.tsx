import { ChatFeed } from './components/ChatFeed';
import { CommitmentLedger } from './components/CommitmentLedger';
import { CrisisBanner } from './components/CrisisBanner';
import { GameBoard } from './components/GameBoard';
import IdentityCard from './components/IdentityCard';
import ParticipationCard from './components/ParticipationCard';
import { PowerTable } from './components/PowerTable';
import { TopBar } from './components/TopBar';
import { TrustGraph } from './components/TrustGraph';
import { WorldHealthSidebar } from './components/WorldHealthSidebar';
import { useGameSocket } from './hooks/useGameSocket';

function App() {
  useGameSocket();

  return (
    <div className="w-full min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-sans overflow-y-auto px-10 py-8">
      <TopBar />

      {/* Row 1: World Board (8 cols) + Power Table (4 cols) */}
      <div className="mt-5 grid grid-cols-12 gap-8 items-start max-[1500px]:grid-cols-1">
        <section className="col-span-9 max-[1500px]:col-auto border border-[var(--color-line)] rounded-[var(--radius-xl)] bg-gradient-to-b from-[rgba(12,24,36,0.92)] to-[rgba(8,16,24,0.86)] shadow-[var(--shadow)] backdrop-blur-[16px]">
          <div className="flex justify-between items-start gap-5 p-6 px-7 border-b border-[var(--color-line)] bg-gradient-to-b from-[rgba(24,40,56,0.86)] to-[rgba(10,18,28,0.48)] max-[1500px]:flex-col max-[1500px]:items-start">
            <div>
              <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[var(--color-text-soft)] pl-1">Living Board</div>
              <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--color-text)]">The Shared World</h2>
            </div>
            <div className="mt-1 text-[13px] leading-[1.55] text-[var(--color-text-muted)] text-right max-w-[420px] max-[1500px]:text-left">
              A deterministic board with public memory and hidden horizons.
            </div>
          </div>

          <div className="p-7 grid grid-cols-[minmax(0,1fr)_minmax(280px,320px)] gap-7 max-[1500px]:grid-cols-1 items-start max-h-[640px] overflow-hidden">
            <div className="relative min-h-[640px]">
              <GameBoard />
              <CrisisBanner />
            </div>
            <WorldHealthSidebar />
          </div>
        </section>

        <div className="col-span-3 max-[1500px]:col-auto h-[640px]">
          <PowerTable />
        </div>
      </div>

      {/* Row 2: Chat (4 cols) + Commitments (4 cols) + Trust (4 cols) */}
      <div className="mt-8 grid grid-cols-12 gap-8 items-start max-[1500px]:grid-cols-1 pb-12">
        <div className="col-span-4 max-[1500px]:col-auto h-[580px] max-[1500px]:h-auto max-[1500px]:min-h-[380px]">
          <ChatFeed />
        </div>

        <div className="col-span-5 max-[1500px]:col-auto h-[580px] max-[1500px]:h-auto max-[1500px]:min-h-[380px]">
          <CommitmentLedger />
        </div>

        <div className="col-span-3 max-[1500px]:col-auto h-[580px] max-[1500px]:h-auto max-[1500px]:min-h-[380px]">
          <TrustGraph />
        </div>
      </div>

      {/* Row 3: Protocol Readiness Surfaces */}
      <div className="mt-8 grid grid-cols-12 gap-8 items-start max-[1500px]:grid-cols-1 pb-12">
        <div className="col-span-3 max-[1500px]:col-auto">
          <IdentityCard />
        </div>
        <div className="col-span-3 max-[1500px]:col-auto">
          <ParticipationCard />
        </div>
      </div>
    </div>
  );
}

export default App;
