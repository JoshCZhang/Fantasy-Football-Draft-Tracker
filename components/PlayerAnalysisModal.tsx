
import React from 'react';
import { Player } from '../types';
import { CloseIcon } from './Icons';

// A simple markdown renderer
const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)/gm, '<li class="list-disc list-inside ml-4">$1</li>')
        .replace(/\n/g, '<br />');

    return <div className="prose prose-invert text-gray-300" dangerouslySetInnerHTML={{ __html: html }} />;
};


interface PlayerAnalysisModalProps {
    player: Player | null;
    analysis: string;
    isLoading: boolean;
    onClose: () => void;
}

const PlayerAnalysisModal: React.FC<PlayerAnalysisModalProps> = ({ player, analysis, isLoading, onClose }) => {
    if (!player) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                           <h2 className="text-2xl font-bold text-white">{player.name}</h2>
                           <p className="text-md text-indigo-400">{player.position} - {player.team}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                           <CloseIcon />
                        </button>
                    </div>
                    <div className="mt-6 min-h-[200px]">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
                            </div>
                        ) : (
                            <SimpleMarkdown text={analysis} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayerAnalysisModal;
