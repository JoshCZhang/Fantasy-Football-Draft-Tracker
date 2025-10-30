import React, { useState } from 'react';
import { Position } from '../types';
import { SearchIcon, ChevronDownIcon } from './Icons';

interface HeaderProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    positionFilter: Position;
    setPositionFilter: (position: Position) => void;
    allTags: string[];
    visibleTags: string[];
    onToggleTagVisibility: (tag: string) => void;
}

const positionFilters: Position[] = [Position.ALL, Position.QB, Position.RB, Position.WR, Position.TE, Position.K, Position.DST];

const Header: React.FC<HeaderProps> = ({ 
    searchTerm, setSearchTerm, positionFilter, setPositionFilter, 
    allTags, visibleTags, onToggleTagVisibility
}) => {
    const [isTagsDropdownOpen, setIsTagsDropdownOpen] = useState(false);

    return (
        <header className="bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40 p-4 border-b border-gray-700">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-center md:text-left">
                    <h1 className="text-2xl font-bold text-white tracking-tight">Fantasy Draft Assistant</h1>
                    <p className="text-sm text-gray-400">Your AI-Powered Drafting Co-Pilot</p>
                </div>
                
                <div className="flex-grow w-full md:w-auto flex flex-col sm:flex-row items-center gap-4">
                    {/* Search Input */}
                    <div className="relative w-full sm:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                           <SearchIcon />
                        </div>
                        <input
                            type="text"
                            placeholder="Search players..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    
                    {/* Position Filters */}
                    <div className="flex items-center gap-2">
                        {positionFilters.map(pos => (
                            <button
                                key={pos}
                                onClick={() => setPositionFilter(pos)}
                                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${positionFilter === pos ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>

                    {/* Tags Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsTagsDropdownOpen(!isTagsDropdownOpen)}
                            className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md flex items-center gap-2 hover:bg-gray-600 transition-colors"
                        >
                            <span className="text-sm font-semibold">Tags</span>
                            <ChevronDownIcon />
                        </button>
                        {isTagsDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50">
                                {allTags.map(tag => (
                                    <label key={tag} className="flex items-center px-4 py-2 text-sm text-white hover:bg-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleTags.includes(tag)}
                                            onChange={() => onToggleTagVisibility(tag)}
                                            className="h-4 w-4 rounded bg-gray-700 border-gray-500 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="ml-3">{tag}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;