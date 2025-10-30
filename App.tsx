
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';
import PlayerAnalysisModal from './components/PlayerAnalysisModal';
import { getPlayerAnalysis } from './services/geminiService';
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

    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState<boolean>(false);
    
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [syncError, setSyncError] = useState<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);

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

    useEffect(() => {
        fetchPlayers();
    }, [fetchPlayers]);
    
    const handleOpenAnalysisModal = useCallback(async (player: Player) => {
        setSelectedPlayer(player);
        setIsAnalysisLoading(true);
        setAnalysis('');
        try {
            const result = await getPlayerAnalysis(player);
            setAnalysis(result);
        } catch (e) {
            setAnalysis('Failed to load analysis.');
        } finally {
            setIsAnalysisLoading(false);
        }
    }, []);

    const handleCloseAnalysisModal = () => {
        setSelectedPlayer(null);
        setAnalysis('');
    };
    
    const handleRemoveSync = useCallback(() => {
        if (webSocketRef.current) {
            webSocketRef.current.close();
            webSocketRef.current = null;
        }
        setSyncStatus('idle');
        setSyncError(null);
    }, []);

    const handleStartSync = useCallback(async (draftIdentifier: string) => {
        handleRemoveSync(); // Ensure any existing connection is closed
        setSyncStatus('syncing');
        setSyncError(null);

        const draftIdMatch = draftIdentifier.match(/\d{18,}/);
        const draftId = draftIdMatch ? draftIdMatch[0] : draftIdentifier;

        if (!/^\d+$/.test(draftId)) {
            setSyncStatus('error');
            setSyncError("Invalid Draft ID format. Please use a Sleeper URL or a numeric Draft ID.");
            return;
        }
        
        try {
            // 1. Validate Draft
            const draftResponse = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
            if (!draftResponse.ok) {
                 if (draftResponse.status === 404) {
                    throw new Error("Draft not found. Please check if the URL or ID is correct.");
                }
                throw new Error(`Failed to verify draft (Status: ${draftResponse.status})`);
            }

            // 2. Fetch existing picks
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            let draftedPlayerIds = new Set<number>();
            if (picksResponse.ok) {
                // FIX: Used the correct response variable `picksResponse` instead of the undefined `response`.
                const picks = await picksResponse.json();
                picks.forEach((pick: any) => {
                    if (pick.player_id) {
                         draftedPlayerIds.add(parseInt(pick.player_id, 10));
                    }
                });
            } else if (picksResponse.status !== 404) { // 404 is ok, means draft hasn't started
                throw new Error(`Failed to fetch draft picks (Status: ${picksResponse.status})`);
            }
            
            setPlayers(current => current.map(p => ({ ...p, isDrafted: draftedPlayerIds.has(p.id) })));

            // 3. Establish WebSocket connection
            const ws = new WebSocket('wss://ws.sleeper.app');
            webSocketRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'subscribe', channel: 'draft', payload: { draft_id: draftId } }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'draft' && data.data.type === 'pick') {
                    const pickedPlayerId = parseInt(data.data.payload.player_id, 10);
                    setPlayers(current =>
                        current.map(p =>
                            p.id === pickedPlayerId ? { ...p, isDrafted: true } : p
                        )
                    );
                }
                // The first message received confirms an active connection
                if(syncStatus !== 'active') {
                   setSyncStatus('active');
                }
            };
            
            ws.onclose = () => {
                if (syncStatus !== 'idle') {
                    setSyncStatus('error');
                    setSyncError("Connection lost. Please try reconnecting.");
                }
            };

        } catch (err: any) {
            setSyncStatus('error');
            setSyncError(err.message || 'An unknown error occurred.');
        }

    }, [handleRemoveSync, syncStatus]);

    useEffect(() => {
        // Cleanup WebSocket on component unmount
        return () => {
            if (webSocketRef.current) {
                webSocketRef.current.close();
            }
        };
    }, []);

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
            const sortedPlayers = [...currentPlayers].sort((a,b) => a.rank - b.rank);

            const draggedPlayer = sortedPlayers.find(p => p.id === draggedPlayerId);
            const targetPlayer = sortedPlayers.find(p => p.id === dragOverPlayerId);

            if (!draggedPlayer || draggedPlayer.isDrafted || !targetPlayer || targetPlayer.isDrafted) {
                return currentPlayers;
            }
            
            const draggedIdx = sortedPlayers.findIndex(p => p.id === draggedPlayerId);
            const [removed] = sortedPlayers.splice(draggedIdx, 1);
            
            const targetIdx = sortedPlayers.findIndex(p => p.id === dragOverPlayerId);
            sortedPlayers.splice(targetIdx, 0, removed);
            
            const reRankedPlayers = sortedPlayers.map((p, index) => ({ ...p, rank: index + 1 }));

            return reRankedPlayers;
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
            
            <PlayerAnalysisModal
                player={selectedPlayer}
                analysis={analysis}
                isLoading={isAnalysisLoading}
                onClose={handleCloseAnalysisModal}
            />

            <SyncModal
                isOpen={isSyncModalOpen}
                onClose={() => setIsSyncModalOpen(false)}
                onStartSync={handleStartSync}
                onRemoveSync={handleRemoveSync}
                status={syncStatus}
                error={syncError}
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
                                    onOpenAnalysisModal={handleOpenAnalysisModal}
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
