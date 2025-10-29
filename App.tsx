import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Player, Position } from './types';
import { PLAYERS_DATA } from './data/players';
import Header from './components/Header';
import PlayerRow from './components/PlayerRow';

const ALL_TAGS = ['My Man', 'Breakout', 'Bust', 'Sleeper', 'Value', 'Injury Prone', 'Rookie'];

const App: React.FC = () => {
    const [players, setPlayers] = useState<Player[]>(() => JSON.parse(JSON.stringify(PLAYERS_DATA)));
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState<Position>(Position.ALL);
    const [isDrafting, setIsDrafting] = useState<boolean>(false);
    const [visibleTags, setVisibleTags] = useState<string[]>([]);
    
    // Drag and Drop State
    const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState<number | null>(null);


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
        setPlayers(JSON.parse(JSON.stringify(PLAYERS_DATA)));
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
        // Style the drag image
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

            // Remove dragged player from its original position
            const filteredPlayers = currentPlayers.filter(p => p.id !== draggedPlayerId);

            // Find the index to insert the player
            const dropIndex = filteredPlayers.findIndex(p => p.id === dragOverPlayerId);

            // Insert the player at the new position
            const newPlayersList = [
                ...filteredPlayers.slice(0, dropIndex),
                draggedPlayer,
                ...filteredPlayers.slice(dropIndex)
            ];

            // Re-rank all players
            return newPlayersList.map((p, index) => ({ ...p, rank: index + 1 }));
        });
        
        handleDragEnd(new Event('dragend') as any); // Reset state after drop
    };


    const displayPlayers = useMemo(() => {
        const filtered = players
            .filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.team.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .filter(p => positionFilter === Position.ALL || p.position === positionFilter);
        
        // The list is now sorted by the user-defined rank
        return filtered.sort((a, b) => a.rank - b.rank);
    }, [players, searchTerm, positionFilter]);

    // Dynamic table width calculation
    const tagColumnWidths: { [key: string]: { class: string, pixels: number } } = {
        'Breakout': { class: 'w-28', pixels: 112 },
        'Injury Prone': { class: 'w-36', pixels: 144 }, // Increased width
    };
    const defaultTagWidth = { class: 'w-20', pixels: 80 };
    
    const baseTableWidth = 490; // Increased to account for drag handle
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
                    {/* Unified scroll container for both header and rows */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Sticky Header */}
                        <div className="sticky top-0 bg-gray-800 z-10">
                            <div className="flex items-center text-sm text-gray-400 font-bold uppercase border-b border-gray-700">
                                <div className="w-10 flex-shrink-0 p-2 border-r border-gray-700"></div> {/* Space for Drag Handle */}
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
                        {displayPlayers.length > 0 ? (
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
                            <p className="p-6 text-center text-gray-500">No players match your criteria.</p>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;