import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';
import PlayerAnalysisModal from './components/PlayerAnalysisModal';
import { getPlayerAnalysis } from './services/geminiService';
import SyncModal from './components/SyncModal';

const ALL_TAGS = ['My Man', 'Breakout', 'Bust', 'Sleeper', 'Value', 'Injury Prone', 'Rookie'];

type SyncStatus = 'idle' | 'syncing' | 'active' | 'error';

// Helper function to normalize the messy data from the Sleeper API
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

const App: React.FC = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState<Position>(Position.ALL);
    const [visibleTags, setVisibleTags] = useState<string[]>(['My Man', 'Sleeper']);
    
    const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState<number | null>(null);

    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState<boolean>(false);

    // State for Sync Modal
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [syncError, setSyncError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const intentionalCloseRef = useRef(false);

    const fetchPlayers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const normalized = normalizeSleeperData(data);
            setPlayers(normalized);
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

    const handleToggleTagVisibility = (tag: string) => {
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
        setPlayers(current =>
            current.map(p =>
                p.id === playerId ? { ...p, isDrafted: !p.isDrafted } : p
            )
        );
    }, []);

    const handleDragStart = (e: React.DragEvent, playerId: number) => {
        const player = players.find(p => p.id === playerId);
        if (player && !player.isDrafted) {
            setDraggedPlayerId(playerId);
            e.dataTransfer.effectAllowed = 'move';
        } else {
            e.preventDefault();
        }
    };

    const handleDragEnter = (e: React.DragEvent, targetPlayerId: number) => {
        e.preventDefault();
        if (draggedPlayerId !== targetPlayerId) {
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
            const draggedPlayerIndex = currentPlayers.findIndex(p => p.id === draggedPlayerId);
            const targetPlayerIndex = currentPlayers.findIndex(p => p.id === dragOverPlayerId);

            if (draggedPlayerIndex === -1 || targetPlayerIndex === -1) return currentPlayers;

            const newPlayers = [...currentPlayers];
            const [draggedPlayer] = newPlayers.splice(draggedPlayerIndex, 1);
            
            const newTargetIndex = newPlayers.findIndex(p => p.id === dragOverPlayerId);
            newPlayers.splice(newTargetIndex, 0, draggedPlayer);

            return newPlayers.map((p, index) => ({
                ...p,
                rank: index + 1
            }));
        });
        
        handleDragEnd(new Event('dragend') as any);
    };

    // --- SYNC LOGIC ---

    const handleStartSync = async (draftIdentifier: string) => {
        if (wsRef.current) {
            handleStopSync(); // Ensure any existing connection is closed first
        }
        
        setSyncStatus('syncing');
        setSyncError(null);
        intentionalCloseRef.current = false;

        const draftIdMatch = draftIdentifier.match(/\d{18,}/);
        const draftId = draftIdMatch ? draftIdMatch[0] : draftIdentifier.trim();

        if (!/^\d+$/.test(draftId)) {
            setSyncError("Invalid Draft URL or ID. Please check and try again.");
            setSyncStatus('error');
            return;
        }

        try {
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            if (!picksResponse.ok) {
                 if (picksResponse.status === 404) {
                    console.log("Draft has not started yet (no picks found). Connecting to WebSocket...");
                 } else {
                    throw new Error(`Failed to fetch draft data (Status: ${picksResponse.status})`);
                 }
            }

            if (picksResponse.ok) {
                const picks = await picksResponse.json();
                const draftedPlayerIds = new Set(picks.map((p: any) => parseInt(p.player_id, 10)));
                
                setPlayers(current =>
                    current.map(p => ({
                        ...p,
                        isDrafted: draftedPlayerIds.has(p.id)
                    }))
                );
            }

            wsRef.current = new WebSocket('wss://ws.sleeper.app');

            wsRef.current.onopen = () => {
                console.log('WebSocket connection established.');
            };

            wsRef.current.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                if (message.type === 'connected') {
                     console.log('Successfully connected to WebSocket, subscribing to draft...');
                     const subscribeMessage = JSON.stringify({
                        type: 'subscribe',
                        channel: 'draft',
                        payload: { draft_id: draftId },
                    });
                    wsRef.current?.send(subscribeMessage);
                    setSyncStatus('active');
                }

                if (message.type === 'draft' && message.data.type === 'pick') {
                    if (syncStatus !== 'active') {
                        setSyncStatus('active'); // Set active on first pick message if not already set
                    }
                    const pickedPlayerId = parseInt(message.data.payload.player_id, 10);
                    setPlayers(current =>
                        current.map(p =>
                            p.id === pickedPlayerId ? { ...p, isDrafted: true } : p
                        )
                    );
                }
            };
            
            wsRef.current.onclose = () => {
                console.log('WebSocket connection closed.');
                if (!intentionalCloseRef.current) {
                    setSyncError("Connection failed. Please check the URL/ID and try again.");
                    setSyncStatus('error');
                }
                wsRef.current = null;
            };

        } catch (error: any) {
            console.error("Error syncing draft:", error);
            setSyncError(error.message || "An unknown error occurred during sync setup.");
            setSyncStatus('error');
        }
    };

    const handleStopSync = () => {
        intentionalCloseRef.current = true;
        wsRef.current?.close();
        setSyncStatus('idle');
        setSyncError(null);
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
                onToggleTagVisibility={handleToggleTagVisibility}
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
                onStopSync={handleStopSync}
                syncStatus={syncStatus}
                errorMessage={syncError}
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