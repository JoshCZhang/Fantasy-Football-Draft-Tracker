import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';
import SyncModal from './components/SyncModal';

const ALL_TAGS = ['My Man', 'Breakout', 'Bust', 'Sleeper', 'Value', 'Injury Prone', 'Rookie'];

const normalizeSleeperData = (data: any): Player[] => {
    const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
    const playersArray = Object.values(data);

    const filteredPlayers = playersArray.filter((p: any) => 
        p.status === 'Active' && p.position && fantasyPositions.has(p.position)
    );

    const sortedPlayers = filteredPlayers.sort((a: any, b: any) => {
        // Players with a null search_rank should be sorted to the bottom.
        if (a.search_rank === null) return 1;
        if (b.search_rank === null) return -1;
        // Sort by the numerical search_rank.
        return a.search_rank - b.search_rank;
    });

    return sortedPlayers.map((p: any, index: number): Player => ({
        id: parseInt(p.player_id, 10),
        rank: index + 1, // The rank is now based on the new, more accurate sort.
        name: p.position === 'DST' ? `${p.first_name} ${p.last_name}` : `${p.first_name} ${p.last_name}`,
        team: p.team,
        position: p.position as Position,
        isDrafted: false,
        tags: p.years_exp === 0 ? ['Rookie'] : [],
    }));
};

type SyncStatus = 'idle' | 'syncing' | 'active' | 'paused' | 'error';

const App: React.FC = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState<Position>(Position.ALL);
    const [visibleTags, setVisibleTags] = useState<string[]>([]);
    
    // Drag and Drop State
    const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState<number | null>(null);

    // Live Sync State
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [draftId, setDraftId] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const syncIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const response = await fetch('https://api.sleeper.app/v1/players/nfl');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                const normalizedPlayers = normalizeSleeperData(data);
                setPlayers(normalizedPlayers);
            } catch (e) {
                console.error("Error fetching player data:", e);
                setError("Failed to fetch player data. Please try refreshing the page.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchPlayers();
    }, []);

    const fetchDraftPicks = useCallback(async (currentDraftId: string) => {
        if (!currentDraftId) return;

        setSyncStatus('syncing');
        setSyncError(null);

        try {
            const response = await fetch(`https://api.sleeper.app/v1/draft/${currentDraftId}/picks`);
            if (!response.ok) {
                throw new Error(`Failed to fetch draft data. Sleeper API returned status: ${response.status}`);
            }
            const picks = await response.json();
            const draftedPlayerIds = new Set(picks.map((pick: any) => parseInt(pick.player_id, 10)));
            
            setPlayers(currentPlayers => 
                currentPlayers.map(player => ({
                    ...player,
                    isDrafted: player.isDrafted || draftedPlayerIds.has(player.id)
                }))
            );

            setLastSyncTime(new Date());
            setSyncStatus('active');

        } catch (e: any) {
            console.error("Error syncing draft:", e);
            setSyncError(e.message || "An unknown error occurred during sync.");
            setSyncStatus('error');
        }
    }, []);

    useEffect(() => {
        const stopPolling = () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
                syncIntervalRef.current = null;
            }
        };

        if (syncStatus === 'active' && draftId) {
            stopPolling(); // Clear any existing interval before setting a new one
            syncIntervalRef.current = window.setInterval(() => {
                fetchDraftPicks(draftId);
            }, 15000); // Poll every 15 seconds
        } else {
            stopPolling();
        }
        
        return () => stopPolling(); // Cleanup on unmount
    }, [syncStatus, draftId, fetchDraftPicks]);

    const handleStartSync = useCallback(async (url: string) => {
        const match = url.match(/sleeper\.com\/draft\/nfl\/(\d+)/);
        const newDraftId = match ? match[1] : null;

        if (newDraftId) {
            setDraftId(newDraftId);
            await fetchDraftPicks(newDraftId);
        } else {
            setSyncError("Invalid Sleeper draft URL. Please check the format.");
            setSyncStatus('error');
        }
    }, [fetchDraftPicks]);

    const handleTogglePauseSync = () => {
        setSyncStatus(prev => (prev === 'active' ? 'paused' : 'active'));
    };
    
    const handleForceRefresh = useCallback(() => {
        if (draftId) {
            fetchDraftPicks(draftId);
        }
    }, [draftId, fetchDraftPicks]);

    const handleToggleTag = (tag: string) => {
        setVisibleTags(prevVisibleTags => {
            const newVisible = prevVisibleTags.includes(tag)
                ? prevVisibleTags.filter(t => t !== tag)
                : [...prevVisibleTags, tag];
            
            return ALL_TAGS.filter(t => newVisible.includes(t));
        });
    };

    const handleTogglePlayerTag = useCallback((playerId: number, tag: string) => {
        setPlayers(currentPlayers =>
            currentPlayers.map(p => {
                if (p.id === playerId) {
                    const currentTags = p.tags ?? [];
                    const hasTag = currentTags.includes(tag);
                    const newTags = hasTag
                        ? currentTags.filter(t => t !== tag)
                        : [...currentTags, tag];
                    return { ...p, tags: newTags };
                }
                return p;
            })
        );
    }, []);

    const handleToggleDraftStatus = useCallback((playerId: number) => {
        setPlayers(currentPlayers =>
            currentPlayers.map(p =>
                p.id === playerId ? { ...p, isDrafted: !p.isDrafted } : p
            )
        );
    }, []);

    const handleDragStart = (e: React.DragEvent, playerId: number) => {
        const player = players.find(p => p.id === playerId);
        if (player && !player.isDrafted) {
            setDraggedPlayerId(playerId);
            e.dataTransfer.effectAllowed = 'move';
        }
    };

    const handleDragEnter = (e: React.DragEvent, targetPlayerId: number) => {
        e.preventDefault();
        const targetPlayer = players.find(p => p.id === targetPlayerId);
        if (draggedPlayerId !== targetPlayerId && targetPlayer && !targetPlayer.isDrafted) {
            setDragOverPlayerId(targetPlayerId);
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.preventDefault();
        setDraggedPlayerId(null);
        setDragOverPlayerId(null);
    };

    const handleDrop = () => {
        if (draggedPlayerId === null || dragOverPlayerId === null || draggedPlayerId === dragOverPlayerId) {
            return;
        }

        setPlayers(currentPlayers => {
            const draggedPlayer = currentPlayers.find(p => p.id === draggedPlayerId);
            const dropTarget = currentPlayers.find(p => p.id === dragOverPlayerId);

            if (!draggedPlayer || draggedPlayer.isDrafted || !dropTarget || dropTarget.isDrafted) {
                return currentPlayers;
            }

            const undraftedPlayers = currentPlayers.filter(p => !p.isDrafted);
            const draftedPlayers = currentPlayers.filter(p => p.isDrafted);
            
            const draggedIdx = undraftedPlayers.findIndex(p => p.id === draggedPlayerId);
            const targetIdx = undraftedPlayers.findIndex(p => p.id === dragOverPlayerId);

            if (draggedIdx === -1 || targetIdx === -1) return currentPlayers;

            const [removed] = undraftedPlayers.splice(draggedIdx, 1);
            undraftedPlayers.splice(targetIdx, 0, removed);

            const rerankedUndrafted = undraftedPlayers.map((p, index) => ({ ...p, rank: index + 1 }));

            return [...rerankedUndrafted, ...draftedPlayers];
        });
        
        handleDragEnd(new Event('dragend') as any);
    };


    const displayPlayers = useMemo(() => {
        const filtered = players
            .filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.team && p.team.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .filter(p => positionFilter === Position.ALL || p.position === positionFilter);
        
        return filtered.sort((a, b) => a.rank - b.rank);
    }, [players, searchTerm, positionFilter]);

    const tagColumnWidths: { [key: string]: { class: string, pixels: number } } = {
        'Breakout': { class: 'w-28', pixels: 112 },
        'Injury Prone': { class: 'w-36', pixels: 144 },
    };
    const defaultTagWidth = { class: 'w-20', pixels: 80 };
    
    const baseTableWidth = 490;
    const tagColumnsWidth = visibleTags.reduce((acc, tag) => {
        const widthInfo = tagColumnWidths[tag] || defaultTagWidth;
        return acc + widthInfo.pixels;
    }, 0);
    const tableWidth = baseTableWidth + tagColumnsWidth;


    return (
        <div className="h-screen bg-gray-900 text-gray-200 font-sans flex flex-col">
            <Header
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                positionFilter={positionFilter}
                setPositionFilter={setPositionFilter}
                allTags={ALL_TAGS}
                visibleTags={visibleTags}
                onToggleTag={handleToggleTag}
                onOpenSyncModal={() => setIsSyncModalOpen(true)}
            />
            
            <SyncModal
                isOpen={isSyncModalOpen}
                status={syncStatus}
                error={syncError}
                lastSyncTime={lastSyncTime}
                onClose={() => setIsSyncModalOpen(false)}
                onStartSync={handleStartSync}
                onTogglePause={handleTogglePauseSync}
                onForceRefresh={handleForceRefresh}
            />

            <main className="container mx-auto p-4 flex-1 min-h-0">
                <div 
                    className="bg-gray-800/50 rounded-lg border border-gray-700 shadow-lg h-full flex flex-col mx-auto overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxWidth: `${tableWidth}px` }}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                >
                    <div className="flex-1 overflow-y-auto">
                        <div className="sticky top-0 bg-gray-800 z-10">
                            <div className="flex items-center text-sm text-gray-400 font-bold uppercase border-b border-gray-700">
                                <div className="w-10 flex-shrink-0 p-2 border-r border-gray-700"></div>
                                <div className="flex-grow p-2 border-r border-gray-700">Player</div>
                                <div className="w-16 text-center p-2 border-r border-gray-700">Pos</div>
                                {visibleTags.map(tag => {
                                     const widthClass = (tagColumnWidths[tag] || defaultTagWidth).class;
                                     return (
                                        <div key={tag} className={`${widthClass} text-center p-2 border-r border-gray-700 truncate`} title={tag}>
                                            {tag}
                                        </div>
                                     )
                                })}
                                <div className="w-20 text-center p-2">Drafted?</div>
                            </div>
                        </div>
                        
                        {isLoading ? (
                            <p className="p-6 text-center text-gray-500">Loading latest player data...</p>
                        ) : error ? (
                            <p className="p-6 text-center text-red-500">{error}</p>
                        ) : displayPlayers.length > 0 ? (
                           displayPlayers.map(player => (
                                <PlayerRow
                                    key={player.id}
                                    player={player}
                                    visibleTags={visibleTags}
                                    onTogglePlayerTag={handleTogglePlayerTag}
                                    onToggleDraftStatus={handleToggleDraftStatus}
                                    isDragging={draggedPlayerId === player.id}
                                    isDragOver={dragOverPlayerId === player.id}
                                    onDragStart={handleDragStart}
                                    onDragEnter={handleDragEnter}
                                    onDragEnd={handleDragEnd}
                                />
                            ))
                        ) : (
                            <p className="p-6 text-center text-gray-500">No players found. Check your filters or try again.</p>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;