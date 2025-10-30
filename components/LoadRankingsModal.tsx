
import React from 'react';
import { CloseIcon, TrashIcon } from './Icons';

interface SavedRanking {
    name: string;
    players: any[];
    date: string;
}

interface LoadRankingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedRankings: SavedRanking[];
    onLoad: (name: string) => void;
    onDelete: (name: string) => void;
}

const LoadRankingsModal: React.FC<LoadRankingsModalProps> = ({ isOpen, onClose, savedRankings, onLoad, onDelete }) => {
    if (!isOpen) return null;

    const sortedRankings = [...savedRankings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <h2 className="text-xl font-bold text-white">Load Rankings</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <CloseIcon />
                        </button>
                    </div>
                    <div className="mt-4 max-h-96 overflow-y-auto">
                        {sortedRankings.length > 0 ? (
                            <ul className="space-y-2">
                                {sortedRankings.map((ranking) => (
                                    <li key={ranking.name} className="flex items-center justify-between bg-gray-900/50 p-3 rounded-md">
                                        <div>
                                            <p className="font-semibold text-white">{ranking.name}</p>
                                            <p className="text-xs text-gray-400">
                                                Saved on {new Date(ranking.date).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onLoad(ranking.name)}
                                                className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-colors"
                                            >
                                                Load
                                            </button>
                                            <button
                                                onClick={() => onDelete(ranking.name)}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                title={`Delete "${ranking.name}"`}
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-center text-gray-400 py-8">
                                You have no saved rankings.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoadRankingsModal;
