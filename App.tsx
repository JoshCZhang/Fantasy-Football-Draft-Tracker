
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
        if (a.search_rank === null) return 1;
        if (b.search_rank === null) return -1;
        return a.search_rank - b.search_rank;
    });

    return sortedPlayers.map((p: any, index: number): Player => ({
        id: parseInt(p.player_id, 10),
        rank: index + 1,
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
    
    const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState<number | null>(null);

    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [draftId, setDraftId] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    
    const ws = useRef<WebSocket | null>(null);
    const syncStatusRef = useRef(syncStatus);
    useEffect(() => {
        syncStatusRef.current = syncStatus;
    }, [syncStatus]);

    const fetchPlayers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const newPlayers = normalizeSleeperData(data);
            setPlayers(newPlayers);
        } catch (e) {
            console.error("Error fetching player data:", e);
            setError("Failed to fetch player data. Please try refreshing the page.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    const cleanupWebSocket = useCallback(() => {
        if (ws.current) {
            ws.current.onopen = null;
            ws.current.onmessage = null;
            ws.current.onerror = null;
            ws.current.onclose = null;
            if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
                ws.current.close();
            }
            ws.current = null;
        }
    }, []);

    useEffect(() => {
        fetchPlayers();
        return () => {
            cleanupWebSocket();
        };
    }, [fetchPlayers, cleanupWebSocket]);
    
    const handleStartSync = useCallback(async (url: string) => {
        const match = url.match(/sleeper\.com\/draft\/nfl\/(\d+)/);
        const newDraftId = match ? match[1] : null;

        if (!newDraftId) {
            setSyncError("Invalid Sleeper draft URL. Please check the format.");
            setSyncStatus('error');
            return;
        }

        cleanupWebSocket();
        setSyncStatus('syncing');
        setSyncError(null);

        try {
            // Step 1: Validate the draft ID itself
            const draftInfoResponse = await fetch(`https://api.sleeper.app/v1/draft/${newDraftId}`);
            if (!draftInfoResponse.ok) {
                if (draftInfoResponse.status === 404) {
                    throw new Error("Draft not found. Please check if the URL is correct.");
                }
                throw new Error(`Failed to verify draft (Status: ${draftInfoResponse.status})`);
            }

            // Step 2: Try to fetch initial picks, but gracefully handle 404 for pre-drafts
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${newDraftId}/picks`);
            if (picksResponse.ok) {
                const picks = await picksResponse.json();
                const draftedPlayerIds = new Set(picks.map((pick: any) => parseInt(pick.player_id, 10)));
                
                setPlayers(currentPlayers => 
                    currentPlayers.map(player => ({
                        ...player,
                        isDrafted: player.isDrafted || draftedPlayerIds.has(player.id)
                    }))
                );
                setLastSyncTime(new Date());
            } else if (picksResponse.status !== 404) {
                // It's an error, but not a "not found" which we accept for pre-drafts
                throw new Error(`Failed to fetch draft data (Status: ${picksResponse.status})`);
            }
            // If it was a 404, we just continue without error, assuming the draft hasn't started.

            // Step 3: If validation and initial sync passed, connect WebSocket
            setDraftId(newDraftId);
            
            const newWs = new WebSocket('wss://ws.sleeper.app');
            ws.current = newWs;
            
            newWs.onopen = () => {
                const subscribeMsg = JSON.stringify({
                    type: "subscribe",
                    payload: { channel: `draft:${newDraftId}` }
                });
                newWs.send(subscribeMsg);
            };

            newWs.onmessage = (event) => {
                if (syncStatusRef.current === 'paused' || newWs !== ws.current) return;
                
                const data = JSON.parse(event.data);
                
                if (data.type === 'welcome') {
                    setSyncStatus('active');
                    setSyncError(null);
                    return;
                }

                if (data.type === 'draft_pick' && data.payload) {
                    const pickedPlayerId = parseInt(data.payload.player_id, 10);
                    if (pickedPlayerId) {
                        setPlayers(currentPlayers =>
                            currentPlayers.map(player =>
                                player.id === pickedPlayerId
                                    ? { ...player, isDrafted: true }
                                    : player
                            )
                        );
                        setLastSyncTime(new Date());
                    }
                }
            };

            newWs.onclose = (event: CloseEvent) => {
                 if (newWs !== ws.current || syncStatusRef.current === 'idle') return;
                 
                 const errorMessage = syncStatusRef.current === 'syncing'
                    ? 'Connection failed. Please check the draft URL and your network.'
                    : `Live connection lost (Code: ${event.code}). Please reconnect.`;

                 setSyncError(errorMessage);
                 setSyncStatus('error');
            };

        } catch (e: any) {
            console.error("Error starting sync:", e);
            setSyncError(e.message || "An unknown error occurred during sync setup.");
            setSyncStatus('error');
            cleanupWebSocket();
        }
    }, [cleanupWebSocket]);
    
    const handleTogglePauseSync = () => {
        setSyncStatus(prev => (prev === 'active' ? 'paused' : 'active'));
    };
    
    const handleForceRefresh = useCallback(async () => {
        if (!draftId) return;

        try {
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            if (picksResponse.ok) {
                const picks = await picksResponse.json();
                const draftedPlayerIds = new Set(picks.map((pick: any) => parseInt(pick.player_id, 10)));
                
                setPlayers(currentPlayers => 
                    currentPlayers.map(player => ({
                        ...player,
                        isDrafted: player.isDrafted || draftedPlayerIds.has(player.id)
                    }))
                );
                setLastSyncTime(new Date());
                alert('Draft picks refreshed successfully!');
            } else {
                throw new Error(`Failed to refresh picks (Status: ${picksResponse.status})`);
            }
        } catch (e: any) {
            console.error("Error during force refresh:", e);
            alert(`Error refreshing picks: ${e.message}`);
        }
    }, [draftId]);

    const handleRemoveSync = useCallback(() => {
        if(window.confirm('This will disconnect from the live draft and reset the drafted status for all players on the board. Are you sure?')) {
            cleanupWebSocket();
            setDraftId(null);
            setLastSyncTime(null);
            setSyncError(null);
            setSyncStatus('idle');
            setPlayers(currentPlayers => 
                currentPlayers.map(player => ({
                    ...player,
                    isDrafted: false
                }))
            );
        }
    }, [cleanupWebSocket]);

    const handleToggleTag = (tag: string) => {
        setVisibleTags(prev => {
            const newVisible = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
            return ALL_TAGS.filter(t => newVisible.includes(t));
        });
    };

    const handleTogglePlayerTag = useCallback((playerId: number, tag: string) => {
        setPlayers(current =>
            current.map(p => {
                if (p.id === playerId) {
                    const currentTags = p.tags ?? [];
                    const newTags = currentTags.includes(tag) ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
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
        if (draggedPlayerId === null || dragOverPlayerId === null || draggedPlayerId === dragOverPlayerId) return;

        setPlayers(currentPlayers => {
            const draggedPlayer = currentPlayers.find(p => p.id === draggedPlayerId);
            const targetPlayer = currentPlayers.find(p => p.id === dragOverPlayerId);

            if (!draggedPlayer || draggedPlayer.isDrafted || !targetPlayer || targetPlayer.isDrafted) {
                return currentPlayers;
            }

            const playersCopy = [...currentPlayers];
            const draggedIdx = playersCopy.findIndex(p => p.id === draggedPlayerId);
            const [removed] = playersCopy.splice(draggedIdx, 1);
            const targetIdx = playersCopy.findIndex(p => p.id === dragOverPlayerId);
            playersCopy.splice(targetIdx, 0, removed);
            
            const reRanked = playersCopy.map((p, index) => ({ ...p, rank: index + 1 }));

            return reRanked;
        });
        
        handleDragEnd(new Event('dragend') as any);
    };

    const displayPlayers = players
        .filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.team && p.team.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .filter(p => positionFilter === Position.ALL || p.position === positionFilter)
        .sort((a, b) => a.rank - b.rank);

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
                onRemoveSync={handleRemoveSync}
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
