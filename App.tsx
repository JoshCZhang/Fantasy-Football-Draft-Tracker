

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';
import SyncModal from './components/SyncModal';
import LoadingOverlay from './components/LoadingOverlay';

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
    const [isUploading, setIsUploading] = useState<boolean>(false);
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
    
    // File input ref for loading rankings
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                // Initial load
                if (currentPlayers.length === 0) {
                    return newPlayers;
                }

                // Merge logic for refreshing data
                const newPlayersMap = new Map(newPlayers.map(p => [p.id, p]));
                const currentPlayerIds = new Set(currentPlayers.map(p => p.id));

                const updatedAndKeptPlayers = currentPlayers
                    .filter(p => newPlayersMap.has(p.id)) // Remove players no longer in API
                    .map(p => {
                        const newPlayerData = newPlayersMap.get(p.id)!;
                        return { // Update static data, keep user-generated data
                            ...p,
                            name: newPlayerData.name,
                            team: newPlayerData.team,
                            position: newPlayerData.position,
                        };
                    });
                
                const brandNewPlayers = newPlayers.filter(p => !currentPlayerIds.has(p.id));

                const undraftedKept = updatedAndKeptPlayers.filter(p => !p.isDrafted).sort((a,b) => a.rank - b.rank);
                const draftedKept = updatedAndKeptPlayers.filter(p => p.isDrafted);

                const allUndrafted = [...undraftedKept, ...brandNewPlayers];
                const rerankedUndrafted = allUndrafted.map((p, index) => ({...p, rank: index + 1}));

                return [...rerankedUndrafted, ...draftedKept];
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
    }, [fetchPlayers]);

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
            }, 5000); // Poll every 5 seconds
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
        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
        }
        setDraftId(null);
        setSyncStatus('idle');
        setLastSyncTime(null);
        setSyncError(null);
        
        // Reset drafted status for all players
        setPlayers(currentPlayers => 
            currentPlayers.map(player => ({
                ...player,
                isDrafted: false
            }))
        );
    }, []);
    
    const handleSaveToFile = useCallback(() => {
        try {
            const dataToSave = JSON.stringify(players, null, 2);
            const blob = new Blob([dataToSave], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
            link.download = `fantasy-rankings-${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to save rankings to file:", error);
            alert("An error occurred while trying to save your rankings.");
        }
    }, [players]);

    const handleLoadFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        const input = event.target;

        if (!file) {
            return;
        }
    
        if (!window.confirm("Are you sure? This will overwrite your current rankings and mark all players as undrafted.")) {
            input.value = ''; // Reset if user cancels confirmation
            return;
        }
        
        setIsUploading(true);
    
        try {
            const text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    const result = e.target?.result;
                    if (typeof result === 'string') {
                        resolve(result);
                    } else {
                        reject(new Error("Failed to read file as text."));
                    }
                };
                reader.onerror = () => reject(new Error("An error occurred while reading the file."));
                reader.readAsText(file);
            });
    
            const loadedPlayers: Player[] = JSON.parse(text);
    
            // Basic validation
            if (!Array.isArray(loadedPlayers) || (loadedPlayers.length > 0 && (loadedPlayers[0].id === undefined || loadedPlayers[0].name === undefined))) {
                throw new Error("Invalid file format. The file does not appear to contain valid player rankings.");
            }
            
            // The order of players in the file is the source of truth.
            // Overwrite all previous rankings and mark all players as undrafted.
            const newlyLoadedPlayers = loadedPlayers.map((player, index) => ({
                ...player,
                isDrafted: false, // Reset draft status for all players
                rank: index + 1,   // Re-assign rank based on file order
            }));

            setPlayers(newlyLoadedPlayers);

            setSearchTerm('');
            setPositionFilter(Position.ALL);
            alert('Rankings loaded successfully!');

        } catch (error: any) {
            console.error("Failed to load or parse rankings file:", error);
            alert(`Error loading file: ${error.message}`);
        } finally {
            setIsUploading(false);
            input.value = ''; // Always reset the input to allow re-selecting the same file
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

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
        setPlayers(currentPlayers => {
            // First, find the player and toggle their status
            const toggledPlayers = currentPlayers.map(p =>
                p.id === playerId ? { ...p, isDrafted: !p.isDrafted } : p
            );
    
            // Now, separate and re-rank the undrafted players
            const undraftedPlayers = toggledPlayers.filter(p => !p.isDrafted);
            const draftedPlayers = toggledPlayers.filter(p => p.isDrafted);
    
            // Sort undrafted players by their current rank to maintain order before re-ranking
            undraftedPlayers.sort((a, b) => a.rank - b.rank);
    
            const rerankedUndrafted = undraftedPlayers.map((p, index) => ({
                ...p,
                rank: index + 1
            }));
    
            // Combine the lists back together
            return [...rerankedUndrafted, ...draftedPlayers];
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

    const displayPlayers = players
        .filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.team && p.team.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .filter(p => positionFilter === Position.ALL || p.position === positionFilter)
        .sort((a, b) => {
            if (a.isDrafted !== b.isDrafted) {
                return a.isDrafted ? 1 : -1;
            }
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
            <LoadingOverlay isLoading={isUploading} text="Loading rankings..." />
            <Header
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                positionFilter={positionFilter}
                setPositionFilter={setPositionFilter}
                allTags={ALL_TAGS}
                visibleTags={visibleTags}
                onToggleTag={handleToggleTag}
                onOpenSyncModal={() => setIsSyncModalOpen(true)}
                onSaveRankings={handleSaveToFile}
                onLoadRankings={triggerFileInput}
                onRefreshPlayers={handleRefreshPlayers}
            />
            
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleLoadFromFile}
                className="hidden"
                accept=".json,application/json"
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