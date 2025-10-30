import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';
import PlayerAnalysisModal from './components/PlayerAnalysisModal';
import SyncModal from './components/SyncModal';
import { getPlayerAnalysis } from './services/geminiService';

const ALL_TAGS = ['My Man', 'Breakout', 'Bust', 'Sleeper', 'Value', 'Injury Prone', 'Rookie'];

// Helper function to normalize the messy data from the Sleeper API
const normalizeSleeperData = (data: any): Player[] => {
    // We only care about standard fantasy positions
    const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
    const playersArray = Object.values(data);

    // Filter for active players with a valid fantasy position
    const filteredPlayers = playersArray.filter((p: any) => 
        p.status === 'Active' && p.position && fantasyPositions.has(p.position)
    );

    // Sort by Sleeper's search rank to get a reasonable default order
    const sortedPlayers = filteredPlayers.sort((a: any, b: any) => {
        if (a.search_rank === null) return 1;
        if (b.search_rank === null) return -1;
        return a.search_rank - b.search_rank;
    });

    // Map to our clean Player type
    return sortedPlayers.map((p: any, index: number): Player => ({
        id: parseInt(p.player_id, 10),
        rank: index + 1,
        name: p.position === 'DST' ? `${p.first_name} ${p.last_name}` : `${p.first_name} ${p.last_name}`,
        team: p.team,
        position: p.position as Position,
        isDrafted: false,
        tags: p.years_exp === 0 ? ['Rookie'] : [], // Automatically tag rookies
    }));
};


const App: React.FC = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState<Position>(Position.ALL);
    const [visibleTags, setVisibleTags] = useState<string[]>(['My Man', 'Sleeper']);
    
    // State for drag-and-drop functionality
    const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState<number | null>(null);

    // State for the player analysis modal
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState<boolean>(false);

    // State for the draft sync modal
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'active' | 'error'>('idle');
    const [draftId, setDraftId] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const syncStatusRef = useRef(syncStatus);

    useEffect(() => {
        syncStatusRef.current = syncStatus;
    }, [syncStatus]);


    // Fetch player data from the Sleeper API when the component mounts
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
    
    // Handle opening the analysis modal and fetching data from Gemini
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

    // Toggle which tag columns are visible in the table
    const handleToggleTagVisibility = (tag: string) => {
        setVisibleTags(prev => {
            const newVisible = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
            // Maintain a consistent order for the columns
            return ALL_TAGS.filter(t => newVisible.includes(t));
        });
    };

    // Add or remove a tag from a specific player
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

    // Mark a player as drafted or not drafted
    const handleToggleDraftStatus = useCallback((playerId: number) => {
        setPlayers(currentPlayers => 
            currentPlayers.map(p => 
                p.id === playerId ? { ...p, isDrafted: !p.isDrafted } : p
            )
        );
    }, []);

    // --- Draft Sync Handlers ---
    const handleOpenSyncModal = () => setIsSyncModalOpen(true);
    const handleCloseSyncModal = () => setIsSyncModalOpen(false);

    const handleStartSync = useCallback(async (url: string) => {
        if (wsRef.current) {
            wsRef.current.close();
        }
        setSyncStatus('syncing');
        setSyncError(null);
    
        const match = url.match(/sleeper\.(?:app|com)\/draft\/nfl\/(\d+)|^\s*(\d+)\s*$/);
        const id = match ? (match[1] || match[2]) : null;
    
        if (!id) {
            setSyncStatus('error');
            setSyncError("Invalid Sleeper URL or Draft ID. Please check the format.");
            return;
        }
        setDraftId(id);
    
        try {
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${id}/picks`);
            if (!picksResponse.ok && picksResponse.status !== 404) {
                throw new Error(`Failed to fetch draft data (Status: ${picksResponse.status})`);
            }
            const picks = picksResponse.status === 404 ? [] : await picksResponse.json();
            const draftedPlayerIds = new Set(picks.map((pick: any) => parseInt(pick.player_id, 10)));
            
            setPlayers(current => current.map(p => ({
                ...p,
                isDrafted: draftedPlayerIds.has(p.id)
            })));
    
            const ws = new WebSocket('wss://ws.sleeper.app');
            wsRef.current = ws;
    
            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'subscribe', topic: `draft:NFL:${id}` }));
            };
    
            ws.onmessage = (event) => {
                if (syncStatusRef.current !== 'active') {
                    setSyncStatus('active');
                }
                const message = JSON.parse(event.data);
                if (message.type === 'draft' && message.data) {
                    const pickedPlayerId = parseInt(message.data.player_id, 10);
                    if (pickedPlayerId) {
                        setPlayers(current => current.map(p => 
                            p.id === pickedPlayerId ? { ...p, isDrafted: true } : p
                        ));
                    }
                }
            };
    
            ws.onclose = () => {
                if (syncStatusRef.current !== 'idle') {
                    setSyncStatus('error');
                    setSyncError('Connection lost. Please try reconnecting.');
                }
                wsRef.current = null;
            };
    
            ws.onerror = () => {
                setSyncStatus('error');
                setSyncError('A connection error occurred.');
                wsRef.current = null;
            };
    
        } catch (e: any) {
            setSyncStatus('error');
            setSyncError(e.message || "Failed to start sync.");
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        }
    }, []);

    const handleStopSync = () => {
        setSyncStatus('idle');
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setDraftId(null);
        setSyncError(null);
    };

    useEffect(() => {
        return () => { // Cleanup on unmount
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);


    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent, playerId: number) => {
        const player = players.find(p => p.id === playerId);
        if (player && !player.isDrafted) {
            setDraggedPlayerId(playerId);
            e.dataTransfer.effectAllowed = 'move';
        } else {
            e.preventDefault(); // Prevent dragging drafted players
        }
    };

    const handleDragEnter = (e: React.DragEvent, targetPlayerId: number) => {
        e.preventDefault();
        const targetPlayer = players.find(p => p.id === targetPlayerId);
        // Only allow dropping on other undrafted players
        if (draggedPlayerId !== targetPlayerId && targetPlayer && !targetPlayer.isDrafted) {
            setDragOverPlayerId(targetPlayerId);
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.preventDefault();
        setDraggedPlayerId(null);
        setDragOverPlayerId(null);
    };

    // The core logic for re-ranking players after a drop
    const handleDrop = () => {
        if (draggedPlayerId === null || dragOverPlayerId === null || draggedPlayerId === dragOverPlayerId) return;

        setPlayers(currentPlayers => {
            const draggedPlayer = currentPlayers.find(p => p.id === draggedPlayerId);
            if (!draggedPlayer) return currentPlayers;

            // Create a new array without the dragged player
            const remainingPlayers = currentPlayers.filter(p => p.id !== draggedPlayerId);
            
            // Find the index to insert the player
            const targetIdx = remainingPlayers.findIndex(p => p.id === dragOverPlayerId);
            
            // Insert the dragged player at the correct position
            remainingPlayers.splice(targetIdx, 0, draggedPlayer);
            
            // Re-rank the entire list
            const reRankedPlayers = remainingPlayers.map((p, index) => ({
                ...p,
                rank: index + 1,
            }));
            
            return reRankedPlayers;
        });
        
        handleDragEnd(new Event('dragend') as any); // Reset drag state
    };

    // Filter and sort players for display
    const displayPlayers = players
        .filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.team && p.team.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .filter(p => positionFilter === Position.ALL || p.position === positionFilter)
        // Sort only by rank
        .sort((a, b) => a.rank - b.rank);

    // --- Dynamic Table Width Calculation ---
    // This allows the table to expand and shrink based on visible tag columns
    const tagColumnWidths: { [key: string]: { class: string, pixels: number } } = {
        'Breakout': { class: 'w-28', pixels: 112 },
        'Injury Prone': { class: 'w-36', pixels: 144 },
    };
    const defaultTagWidth = { class: 'w-20', pixels: 80 };
    
    const baseTableWidth = 490; // The width of the table without any tag columns
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
                onOpenSyncModal={handleOpenSyncModal}
            />
            
            <PlayerAnalysisModal
                player={selectedPlayer}
                analysis={analysis}
                isLoading={isAnalysisLoading}
                onClose={handleCloseAnalysisModal}
            />

            <SyncModal
                isOpen={isSyncModalOpen}
                onClose={handleCloseSyncModal}
                onStartSync={handleStartSync}
                onStopSync={handleStopSync}
                syncStatus={syncStatus}
                draftId={draftId}
                error={syncError}
            />

            <main className="container mx-auto p-4 flex-1 min-h-0">
                <div 
                    className="bg-gray-800/50 rounded-lg border border-gray-700 shadow-lg h-full flex flex-col mx-auto overflow-hidden transition-all duration-300 ease-in-out"
                    // The table width is set dynamically here
                    style={{ maxWidth: `${tableWidth}px` }}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                >
                    <div className="flex-1 overflow-y-auto">
                        {/* Sticky Table Header */}
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
                        
                        {/* Player List */}
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