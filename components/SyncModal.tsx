
import React, { useState } from 'react';
import { CloseIcon, PlayIcon, PauseIcon, TrashIcon } from './Icons';

type SyncStatus = 'idle' | 'syncing' | 'active' | 'paused' | 'error';

interface SyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartSync: (draftId: string) => void;
    onRemoveSync: () => void;
    status: SyncStatus;
    error: string | null;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose, onStartSync, onRemoveSync, status, error }) => {
    const [inputValue, setInputValue] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onStartSync(inputValue);
    };

    const renderStatus = () => {
        switch (status) {
            case 'syncing':
                return <div className="text-yellow-400">Connecting to draft...</div>;
            case 'active':
                return <div className="text-green-400">Live Sync Active</div>;
            case 'paused':
                 return <div className="text-gray-400">Sync Paused</div>;
            case 'error':
                return <div className="text-red-400">Error: {error}</div>;
            case 'idle':
            default:
                 return <div className="text-gray-400">Enter a Sleeper URL or Draft ID to begin.</div>;
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <h2 className="text-2xl font-bold text-white">Sync Live Draft</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <CloseIcon />
                        </button>
                    </div>
                    <div className="mt-4 text-sm">
                        {renderStatus()}
                    </div>
                    
                    {/* FIX: Swapped ternary branches and adjusted condition to correctly show disabled form during 'syncing' state and 'Remove Sync' button for 'active' state. */}
                    {status === 'active' || status === 'paused' ? (
                        <div className="mt-6 flex justify-center">
                            <button
                                onClick={onRemoveSync}
                                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <TrashIcon /> Remove Sync
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Sleeper URL or Draft ID"
                                className="flex-grow bg-gray-900 border border-gray-600 rounded-md py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={status === 'syncing'}
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-800 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                disabled={status === 'syncing' || !inputValue.trim()}
                            >
                                <PlayIcon /> Start Sync
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SyncModal;
