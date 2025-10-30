import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Player, Position } from './types';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';

const ALL_TAGS = ['My Man', 'Breakout', 'Bust', 'Sleeper', 'Value', 'Injury Prone', 'Rookie'];

// This function translates the raw data from the Sleeper API into the Player[] format our app uses.
const normalizeSleeperData = (sleeperData: { [key: string]: any }): Player[] => {
    const relevantPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const playersArray = Object.values(sleeperData);

    const filteredAndMapped = playersArray
        .filter(p => p.active && relevantPositions.includes(p.position))
        .map((p, index) => ({
            id: parseInt(p.player_id, 10),
            rank: index + 1, // Initial rank based on alphabetical order from API
            name: p.full_name || `${p.first_name} ${p.last_name}`,
            team: p.team || 'FA',
            position: (p.position === 'DEF' ? 'DST' : p.position) as Position,
            bye: 0, // Sleeper's main player endpoint doesn't include bye weeks.
            isDrafted: false,
            tags: [],
        }));

    return filteredAndMapped;
};

const App: React.FC = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState<Position>(Position.ALL);
    const [isDrafting, setIsDrafting] = useState<boolean>(false);
    const [visibleTags, setVisibleTags] = useState<string[]>([]);
    
    // Using a ref to store the initial fetched player list for resets
    const initialPlayersRef = useRef<Player[]>([]);

    // Drag and Drop State
    const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState<number | null>(null);
    
    // Fetch data directly from the Sleeper API when the app loads
    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                setIsLoading(true);
                const response = await fetch('https://api.sleeper.app/v1/players/nfl');
                if (!response.ok) {
                    throw new Error('Failed to fetch players from Sleeper API');
                }
                const sleeperData = await response.json();
                const normalizedPlayers = normalizeSleeperData(sleeperData);
                
                setPlayers(normalizedPlayers);
                initialPlayersRef.current = JSON.parse(JSON.stringify(normalizedPlayers)); // Store a deep copy for resets
            } catch (error) {
                console.error("Error fetching player data:", error);
                // In a real app, you might set an error state here to show in the UI
            } finally {
                setIsLoading(false);
            }
        };
        fetchPlayers();
    }, []);


    // Draft Simulation Logic
    useEffect(() => {
        if (!isDrafting) {
            return;
        }

        const draftInterval = setInterval(() => {
            setPlayers(prevPlayers => {
                const availablePlayers = prevPlayers
                    .filter(p => !p.isDrafted)
                    .sort((a, b) => a.rank - b.rank);

                if (availablePlayers.length === 0) {
                    setIsDrafting(false); // Stop if no players left
                    return prevPlayers;
                }

                const playerToDraft = availablePlayers[0];
                return prevPlayers.map(p =>
                    p.id === playerToDraft.id ? { ...p, isDrafted: true } : p
                );
            });
        }, 2000); // Draft a player every 2 seconds

        return () => clearInterval(draftInterval);
    }, [isDrafting]);

    const handleResetDraft = useCallback(() => {
        setIsDrafting(false);
        // Reset players from the stored initial list, not the static file
        setPlayers(JSON.parse(JSON.stringify(initialPlayersRef.current)));
        setSearchTerm('');
        setPositionFilter(Position.ALL);
        setVisibleTags([]);
    }, []);
    
    const handleToggleTag = (tag: string) => {
        setVisibleTags(prevVisibleTags => {
            const newVisible = prevVisibleTags.includes(tag)
                ? prevVisibleTags.filter(t => t !== tag)
                : [...prevVisibleTags, tag];
            
            // Reorder based on ALL_TAGS to maintain a consistent column order
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

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, playerId: number) => {
        setDraggedPlayerId(playerId);
        e.dataTransfer.effectAllowed = 'move';
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
        if (draggedPlayerId === null || dragOverPlayerId === null || draggedPlayerId === dragOverPlayerId) {
            return;
        }

        setPlayers(currentPlayers => {
            const draggedPlayer = currentPlayers.find(p => p.id === draggedPlayerId);
            if (!draggedPlayer) return currentPlayers;

            const filteredPlayers = currentPlayers.filter(p => p.id !== draggedPlayerId);
            const dropIndex = filteredPlayers.findIndex(p => p.id === dragOverPlayerId);

            const newPlayersList = [
                ...filteredPlayers.slice(0, dropIndex),
                draggedPlayer,
                ...filteredPlayers.slice(dropIndex)
            ];

            return newPlayersList.map((p, index) => ({ ...p, rank: index + 1 }));
        });
        
        handleDragEnd(new Event('dragend') as any);
    };


    const displayPlayers = useMemo(() => {
        const filtered = players
            .filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.team.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .filter(p => positionFilter === Position.ALL || p.position === positionFilter);
        
        return filtered.sort((a, b) => a.rank - b.rank);
    }, [players, searchTerm, positionFilter]);

    // Dynamic table width calculation
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
                isDrafting={isDrafting}
                onStart={() => setIsDrafting(true)}
                onPause={() => setIsDrafting(false)}
                onReset={handleResetDraft}
                allTags={ALL_TAGS}
                visibleTags={visibleTags}
                onToggleTag={handleToggleTag}
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
                            <div className="flex flex-col justify-center items-center h-full text-gray-500">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
                                <p className="mt-4 text-lg">Fetching latest player data...</p>
                            </div>
                        ) : displayPlayers.length > 0 ? (
                           displayPlayers.map(player => (
                                <PlayerRow
                                    key={player.id}
                                    player={player}
                                    visibleTags={visibleTags}
                                    onTogglePlayerTag={handleTogglePlayerTag}
                                    isDrafting={isDrafting}
                                    isDragging={draggedPlayerId === player.id}
                                    isDragOver={dragOverPlayerId === player.id}
                                    onDragStart={handleDragStart}
                                    onDragEnter={handleDragEnter}
                                    onDragEnd={handleDragEnd}
                                />
                            ))
                        ) : (
                            <p className="p-6 text-center text-gray-500">No players found or failed to load.</p>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;