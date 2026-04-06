import { useMemo } from 'react';
import { useGameStore } from '../store';
import { formatAgentName, shortName } from '../lib/format';

function getCellColor(score: number, isSelf: boolean): string {
  if (isSelf) return 'transparent';
  if (score > 0) {
    const intensity = Math.min(score, 1);
    return `rgba(126, 172, 115, ${intensity * 0.4})`;
  }
  if (score < 0) {
    const intensity = Math.min(Math.abs(score), 1);
    return `rgba(217, 113, 99, ${intensity * 0.4})`;
  }
  return 'transparent';
}

interface CellProps {
  rowIndex: number;
  colIndex: number;
  rowAgentId: string;
  colAgentId: string;
  score: number;
  context: { agents?: Record<string, { name?: string | null } | undefined>; pendingAgentInfo?: Record<string, { name?: string | null } | undefined> };
}

function TrustCell({ rowIndex, colIndex, rowAgentId, colAgentId, score, context }: CellProps) {
  const isSelf = rowIndex === colIndex;
  const bgColor = getCellColor(score, isSelf);

  return (
    <div 
      key={`cell-${rowAgentId}-${colAgentId}`}
      className="rounded-lg min-h-[40px] flex items-center justify-center text-center p-2.5 border border-[rgba(233,220,190,0.08)] font-mono text-[12px] text-[var(--color-text)]"
      style={{ backgroundColor: bgColor }}
      title={`${formatAgentName(rowAgentId, context)} → ${formatAgentName(colAgentId, context)}: ${score}`}
    >
      {isSelf ? '·' : typeof score === 'number' ? score.toFixed(1) : score}
    </div>
  );
}

export function TrustGraph() {
  const trustMatrix = useGameStore((state) => state.gameState.trustMatrix);
  const agents = useGameStore((state) => state.gameState.agents);
  const pendingAgentInfo = useGameStore((state) => state.gameState.pendingAgentInfo);
  const context = useMemo(() => ({ agents, pendingAgentInfo }), [agents, pendingAgentInfo]);

  const agentIds = useMemo(() => trustMatrix?.agents ?? [], [trustMatrix?.agents]);
  const gridTemplateColumns = useMemo(
    () => `64px repeat(${agentIds.length}, minmax(52px, 1fr))`,
    [agentIds.length]
  );

  const rows = useMemo(() => {
    if (!trustMatrix?.matrix) return [];
    return trustMatrix.matrix.map((row, rowIndex) => ({
      rowAgentId: agentIds[rowIndex],
      cells: row.map((score, colIndex) => ({
        rowIndex,
        colIndex,
        rowAgentId: agentIds[rowIndex],
        colAgentId: agentIds[colIndex],
        score,
      })),
    }));
  }, [trustMatrix?.matrix, agentIds]);

  return (
    <section className="border border-[var(--color-line)] rounded-[var(--radius-xl)] bg-gradient-to-b from-[rgba(12,24,36,0.92)] to-[rgba(8,16,24,0.86)] shadow-[var(--shadow)] backdrop-blur-[16px] min-h-0 flex flex-col h-full">
      <div className="flex justify-between items-start gap-5 p-6 px-7 border-b border-[var(--color-line)] bg-gradient-to-b from-[rgba(24,40,56,0.86)] to-[rgba(10,18,28,0.48)] shrink-0 max-[1600px]:flex-col max-[1600px]:items-start">
        <div>
          <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[var(--color-text-soft)] pl-1">
            Public Reputation Surface
          </div>
          <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--color-text)]">
            Reputation Field
          </h2>
        </div>
          <div className="mt-1 text-[12px] leading-[1.45] text-[var(--color-text-muted)] text-right max-w-[180px]">
          Trust informs deal flow, but it never grants points or protection.
        </div>
      </div>
      
      <div className="p-6 flex-1 overflow-auto custom-scrollbar">
        {agentIds.length === 0 ? (
          <div className="p-4 border border-dashed border-[rgba(233,220,190,0.12)] rounded-[18px] text-center text-[13px] leading-[1.5] text-[var(--color-text-muted)] bg-[rgba(10,20,30,0.36)]">
            No trust data available yet.
          </div>
        ) : (
          <div 
            className="grid gap-2 items-stretch min-w-0"
            style={{ gridTemplateColumns }}
          >
            <div className="rounded-lg min-h-[40px] flex items-center justify-center text-center p-2.5"></div>
            {agentIds.map((agentId) => (
              <div 
                key={`header-${agentId}`} 
                className="rounded-lg min-h-[40px] flex items-center justify-center text-center p-2.5 bg-[rgba(11,23,34,0.72)] border border-[rgba(233,220,190,0.08)] font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-soft)]"
                title={formatAgentName(agentId, context)}
              >
                {shortName(agentId, context).substring(0, 3)}
              </div>
            ))}

            {rows.map(({ rowAgentId, cells }) => (
              <div key={`row-${rowAgentId}`} className="contents">
                <div 
                  className="rounded-lg min-h-[40px] flex items-center justify-center text-center p-2.5 bg-[rgba(11,23,34,0.72)] border border-[rgba(233,220,190,0.08)] font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-soft)]"
                  title={formatAgentName(rowAgentId, context)}
                >
                  {shortName(rowAgentId, context).substring(0, 3)}
                </div>
                
                {cells.map((cell) => (
                  <TrustCell key={`cell-${cell.rowAgentId}-${cell.colAgentId}`} {...cell} context={context} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
