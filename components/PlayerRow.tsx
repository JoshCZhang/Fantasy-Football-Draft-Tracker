import React from 'react';
import { Player } from '../types';
import { 
    DraftedIcon, 
    PriceTagIcon,
    ExclamationIcon,
    BandAidIcon,
    MoonIcon,
    LightningBoltIcon,
    GraduationCapIcon,
    StarIcon,
    DragHandleIcon
} from './Icons';

interface PlayerRowProps {
    player: Player;
    visibleTags: string[];
    onTogglePlayerTag: (playerId: number, tag: string) => void;
    isDragging: boolean;
    isDragOver: boolean;
    isDrafting: boolean;
    onDragStart: (e: React.DragEvent, playerId: number) => void;
    onDragEnter: (e: React.DragEvent, playerId: number) => void;
    onDragEnd: (e: React.DragEvent) => void;
}

const positionColorMap: { [key: string]: string } = {
    QB: 'bg-red-500/20 text-red-300 border-red-500/30',
    RB: 'bg-green-500/20 text-green-300 border-green-500/30',
    WR: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    TE: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    K: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    DST: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const tagIconMap: { [key: string]: React.FC } = {
    'Value': PriceTagIcon,
    'Bust': ExclamationIcon,
    'Injury Prone': BandAidIcon,
    'Sleeper': MoonIcon,
    'Breakout': LightningBoltIcon,
    'Rookie': GraduationCapIcon,
    'My Man': StarIcon,
};

const tagColumnWidths: { [key: string]: string } = {
    'Breakout': 'w-28',
    'Injury Prone': 'w-36', // Increased width
};
const defaultTagWidth = 'w-20';


const PlayerRow: React.FC<PlayerRowProps> = ({ 
    player, 
    visibleTags, 
    onTogglePlayerTag,
    isDragging,
    isDragOver,
    isDrafting,
    onDragStart,
    onDragEnter,
    onDragEnd
}) => {
    return (
        <div 
            draggable={!isDrafting}
            onDragStart={(e) => onDragStart(e, player.id)}
            onDragEnter={(e) => onDragEnter(e, player.id)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()} // Necessary to allow dropping
            className={`flex items-stretch border-b border-gray-800 transition-colors duration-200 relative
                ${player.isDrafted ? 'bg-gray-800/60' : 'hover:bg-gray-800/50'}
                ${isDragging ? 'opacity-30' : 'opacity-100'}`}
        >
            {isDragOver && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-20" />}
            
            {/* Drag Handle */}
            <div className={`w-10 flex-shrink-0 flex items-center justify-center p-2 border-r border-gray-700 text-gray-500 ${!isDrafting ? 'cursor-grab' : 'cursor-not-allowed'}`}>
                {!isDrafting && <DragHandleIcon />}
            </div>

            {/* Player */}
            <div className="flex-grow flex items-center min-w-0 p-2 border-r border-gray-700">
                <div className="w-10 flex-shrink-0 text-center text-gray-400 font-bold">{player.rank}</div>
                <div className="ml-2 min-w-0">
                    <p className={`font-semibold truncate ${player.isDrafted ? 'text-red-500' : 'text-white'}`}>{player.name}</p>
                    <p className="text-xs text-gray-400">{player.team} &bull; Bye: {player.bye}</p>
                </div>
            </div>
            {/* Position */}
            <div className="w-16 flex-shrink-0 flex justify-center items-center p-2 border-r border-gray-700">
                <div className={`text-xs font-bold py-1 px-2 rounded-full border ${positionColorMap[player.position]}`}>
                    {player.position}
                </div>
            </div>
            {/* Dynamic Tag Columns */}
            {visibleTags.map(tag => {
                const IconComponent = tagIconMap[tag];
                const hasTag = player.tags?.includes(tag) ?? false;
                const widthClass = tagColumnWidths[tag] || defaultTagWidth;
                return (
                    <div key={tag} className={`${widthClass} flex-shrink-0 flex justify-center items-center p-2 border-r border-gray-700`}>
                        <button
                            onClick={() => onTogglePlayerTag(player.id, tag)}
                            className="p-1 rounded-md transition-colors duration-200 w-full h-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500/50 hover:bg-gray-700/50"
                            title={`Toggle ${tag} for ${player.name}`}
                        >
                            {hasTag && IconComponent && <IconComponent />}
                        </button>
                    </div>
                )
            })}
            {/* Drafted */}
            <div className="w-20 flex-shrink-0 flex justify-center items-center p-2">
                {player.isDrafted && <DraftedIcon />}
            </div>
        </div>
    );
};

export default PlayerRow;