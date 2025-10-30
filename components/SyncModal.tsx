import React, { useState } from 'react';
import { CloseIcon, PlayIcon, PauseIcon, RefreshIcon, TrashIcon } from './Icons';

type SyncStatus = 'idle' | 'syncing' | 'active' | 'paused' | 'error';

interface SyncModalProps {
    isOpen: boolean;
    status: SyncStatus;
    error: string | null;
    lastSyncTime: Date | null;
    onClose: () => void;
    onStartSync: (url: string) => void;
    onTogglePause: () => void;
    onForceRefresh: () => void;
    onRemoveSync: () => void;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, status, error, lastSyncTime, onClose, onStartSync, onTogglePause, onForceRefresh, onRemoveSync }) => {
    const [url, setUrl] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url) {
            onStartSync(url);
        }
    };
    
    const getStatusContent = () => {
        switch (status) {
            case 'syncing':
                return (
                    <div className="flex items-center justify-center text-yellow-400">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-400 mr-3"></div>
                        Syncing...
                    </div>
                );
            case 'active':
                return (
                    <div className="text-center">
                        <p className="text-green-400 font-semibold">Live sync is active.</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Last updated: {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'N/A'}
                        </p>
                    </div>
                );
            case 'paused':
                 return (
                    <div className="text-center">
                        <p className="text-yellow-400 font-semibold">Live sync is paused.</p>
                        <p className="text-xs text-gray-400 mt-1">
                             Last updated: {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'N/A'}
                        </p>
                    </div>
                );
            case 'error':
                return <p className="text-red-400 text-center">{error}</p>;
            case 'idle':
            default:
                return <p className="text-sm text-gray-400 text-center">Paste your Sleeper draft URL to sync live draft picks.</p>;
        }
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <h2 className="text-xl font-bold text-white">Sync Live Draft</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <CloseIcon />
                        </button>
                    </div>

                    <div className="mt-6 space-y-4">
                        {(status === 'idle' || status === 'error') && (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://sleeper.com/draft/nfl/..."
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    aria-label="Sleeper draft URL"
                                />
                                <button
                                    type="submit"
                                    disabled={!url}
                                    className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                                >
                                    Start Sync
                                </button>
                            </form>
                        )}
                        
                        {(status === 'active' || status === 'paused' || status === 'syncing') && (
                            <div className="flex items-center justify-center gap-4">
                                <button 
                                    onClick={onTogglePause}
                                    className="p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition-colors"
                                    title={status === 'active' ? 'Pause Sync' : 'Resume Sync'}
                                >
                                    {status === 'active' ? <PauseIcon /> : <PlayIcon />}
                                </button>
                                 <button 
                                    onClick={onForceRefresh}
                                    className="p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition-colors"
                                    title="Force Refresh"
                                >
                                    <RefreshIcon />
                                </button>
                                <button
                                    onClick={onRemoveSync}
                                    className="p-2 bg-gray-700 text-red-400 rounded-full hover:bg-gray-600 transition-colors"
                                    title="Remove Sync and Reset Board"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        )}

                        <div className="mt-4 p-4 bg-gray-900/50 rounded-md min-h-[60px] flex items-center justify-center">
                           {getStatusContent()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncModal;