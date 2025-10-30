
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';
import SyncModal from './components/SyncModal';
import SaveRankingsModal from './components/SaveRankingsModal';
import LoadRankingsModal from './components/LoadRankingsModal';

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
type SavedRanking = { name: string; players: Player[]; date: string };

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

    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
    const [savedRankings, setSavedRankings] = useState<SavedRanking[]>([]);
    
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
            
            setPlayers(currentPlayers => {
                if (currentPlayers.length === 0) {
                    return newPlayers;
                }

                const newPlayersMap = new Map(newPlayers.map(p => [p.id, p]));
                const currentPlayerIds = new Set(currentPlayers.map(p => p.id));

                const updatedPlayers = currentPlayers
                    .map(p => {
                        const newPlayerData = newPlayersMap.get(p.id);
                        if (newPlayerData) {
                            return {
                                ...p,
                                name: newPlayerData.name,
                                team: newPlayerData.team,
                                position: newPlayerData.position,
                            };
                        }
                        return p;
                    })
                    .filter(p => newPlayersMap.has(p.id));

                const brandNewPlayers = newPlayers.filter(p => !currentPlayerIds.has(p.id));
                
                const combinedList = [...updatedPlayers, ...brandNewPlayers];
                
                const undrafted = combinedList.filter(p => !p.isDrafted).sort((a,b) => a.rank - b.rank);
                const drafted = combinedList.filter(p => p.isDrafted);
                
                const reRankedUndrafted = undrafted.map((p, index) => ({...p, rank: index + 1}));

                return [...reRankedUndrafted, ...drafted];
            });

        } catch (e) {
            console.error("Error fetching player data:", e);
            setError("Failed to fetch player data. Please try refreshing the page.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlayers();
        try {
            const storedRankings = localStorage.getItem('fantasyRankings');
            if (storedRankings) {
                setSavedRankings(JSON.parse(storedRankings));
            }
        } catch (error) {
            console.error("Failed to load rankings from local storage:", error);
        }
    }, [fetchPlayers]);
    
    useEffect(() => {
        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
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
        } catch (e: any) {
            console.error("Error syncing draft:", e);
            setSyncError(e.message || "An unknown error occurred during sync.");
            setSyncStatus('error');
            throw e;
        }
    }, []);

    const handleStartSync = useCallback(async (url: string) => {
        const match = url.match(/sleeper\.com\/draft\/nfl\/(\d+)/);
        const newDraftId = match ? match[1] : null;

        if (!newDraftId) {
            setSyncError("Invalid Sleeper draft URL. Please check the format.");
            setSyncStatus('error');
            return;
        }

        try {
            await fetchDraftPicks(newDraftId);
            setDraftId(newDraftId);
            if (ws.current) ws.current.close();

            ws.current = new WebSocket('wss://ws.sleeper.app');
            
            ws.current.onopen = () => {
                console.log("WebSocket connection opened.");
            };

            ws.current.onmessage = (event) => {
                if (syncStatusRef.current === 'paused') return;
                
                const data = JSON.parse(event.data);
                
                if (data.type === 'welcome') {
                    const subscribeMsg = JSON.stringify({
                        type: "subscribe",
                        payload: { channel: `draft:${newDraftId}` }
                    });
                    ws.current?.send(subscribeMsg);
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

            ws.current.onerror = (err) => {
                console.error("WebSocket Error:", err);
                setSyncError('WebSocket connection error. Please try reconnecting.');
                setSyncStatus('error');
            };

            ws.current.onclose = () => {
                 console.log("WebSocket connection closed.");
            };

        } catch (e) {
            // Error is already set by fetchDraftPicks
        }
    }, [fetchDraftPicks]);
    
    const handleRefreshPlayers = useCallback(() => {
        if (window.confirm('Are you sure you want to refresh the player database? This will update player info and add/remove players based on the latest Sleeper data. Your custom ranks, tags, and drafted players will be preserved.')) {
            fetchPlayers();
        }
    }, [fetchPlayers]);

    const handleTogglePauseSync = () => {
        setSyncStatus(prev => (prev === 'active' ? 'paused' : 'active'));
    };
    
    const handleForceRefresh = useCallback(() => {
        if (draftId) {
            fetchDraftPicks(draftId);
        }
    }, [draftId, fetchDraftPicks]);

    const handleRemoveSync = useCallback(() => {
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        setDraftId(null);
        setSyncStatus('idle');
        setLastSyncTime(null);
        setSyncError(null);
        
        setPlayers(currentPlayers => 
            currentPlayers.map(player => ({
                ...player,
                isDrafted: false
            }))
        );
    }, []);
    
    const handleSaveWithName = (name: string) => {
        const newSave: SavedRanking = { name, players, date: new Date().toISOString() };
        
        setSavedRankings(prev => {
            const existingIndex = prev.findIndex(s => s.name === name);
            const newList = [...prev];
            if (existingIndex > -1) {
                newList[existingIndex] = newSave;
            } else {
                newList.push(newSave);
            }
            localStorage.setItem('fantasyRankings', JSON.stringify(newList));
            return newList;
        });
        setIsSaveModalOpen(false);
    };

    const handleLoadFromStorage = (name: string) => {
        const savedState = savedRankings.find(s => s.name === name);
        if (savedState) {
            setPlayers(savedState.players);
            setIsLoadModalOpen(false);
            setSearchTerm('');
            setPositionFilter(Position.ALL);
            alert(`Successfully loaded "${name}" rankings.`);
        } else {
            alert(`Error: Could not find rankings named "${name}".`);
        }
    };
    
    const handleDeleteRanking = (name: string) => {
       if (window.confirm(`Are you sure you want to delete the "${name}" rankings? This cannot be undone.`)) {
            setSavedRankings(prev => {
                const newList = prev.filter(s => s.name !== name);
                localStorage.setItem('fantasyRankings', JSON.stringify(newList));
                return newList;
            });
       }
    };

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
        setPlayers(currentPlayers => {
            const updatedPlayers = currentPlayers.map(p =>
                p.id === playerId ? { ...p, isDrafted: !p.isDrafted } : p
            );
            
            const undrafted = updatedPlayers.filter(p => !p.isDrafted).sort((a, b) => a.rank - b.rank);
            const drafted = updatedPlayers.filter(p => p.isDrafted);

            const reRankedUndrafted = undrafted.map((p, index) => ({ ...p, rank: index + 1 }));

            return [...reRankedUndrafted, ...drafted];
        });
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

            let playersCopy = [...currentPlayers.filter(p => !p.isDrafted)];
            const draggedIdx = playersCopy.findIndex(p => p.id === draggedPlayerId);
            const [removed] = playersCopy.splice(draggedIdx, 1);
            const targetIdx = playersCopy.findIndex(p => p.id === dragOverPlayerId);
            playersCopy.splice(targetIdx, 0, removed);
            
            const reRanked = playersCopy.map((p, index) => ({ ...p, rank: index + 1 }));
            const draftedPlayers = currentPlayers.filter(p => p.isDrafted);

            return [...reRanked, ...draftedPlayers];
        });
        
        handleDragEnd(new Event('dragend') as any);
    };

    const displayPlayers = players
        .filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.team && p.team.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .filter(p => positionFilter === Position.ALL || p.position === positionFilter)
        .sort((a, b) => {
            if (a.isDrafted && !b.isDrafted) return 1;
            if (!a.isDrafted && b.isDrafted) return -1;
            return a.rank - b.rank;
        });

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
                onSaveRankings={() => setIsSaveModalOpen(true)}
                onLoadRankings={() => setIsLoadModalOpen(true)}
                onRefreshPlayers={handleRefreshPlayers}
            />
            
            <SaveRankingsModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onSave={handleSaveWithName}
                existingNames={savedRankings.map(s => s.name)}
            />

            <LoadRankingsModal
                isOpen={isLoadModalOpen}
                onClose={() => setIsLoadModalOpen(false)}
                savedRankings={savedRankings}
                onLoad={handleLoadFromStorage}
                onDelete={handleDeleteRanking}
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
