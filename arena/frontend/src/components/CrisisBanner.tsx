import { useGameStore } from '../store';

export function CrisisBanner() {
  const activeCrisis = useGameStore((state) => state.gameState.activeCrisis);
  const hidden = !activeCrisis;

  return (
    <div
      className={`absolute left-1/2 bottom-[18px] -translate-x-1/2 w-[min(92%,560px)] p-[14px_18px] rounded-[18px] border shadow-[0_20px_34px_rgba(0,0,0,0.32)] backdrop-blur-[16px] transition-all duration-200 ${
        hidden
          ? 'opacity-0 pointer-events-none translate-y-3 border-transparent'
          : 'opacity-100 border-[rgba(217,113,99,0.28)] bg-[linear-gradient(135deg,rgba(106,42,36,0.9),rgba(52,18,18,0.9))]'
      }`}
    >
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#efc0b8]">Commons Warning</div>
      <div className="mt-2 font-serif text-[22px] text-[#fff4ec]">{activeCrisis?.name || activeCrisis?.type || 'No active crisis'}</div>
      <div className="mt-1.5 text-[13px] leading-[1.45] text-[#e8cfc9]">{activeCrisis?.description || ''}</div>
    </div>
  );
}
