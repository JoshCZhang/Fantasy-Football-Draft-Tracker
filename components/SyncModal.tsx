import React, { useState } from 'react';
import { CloseIcon, SyncIcon } from './Icons';

interface SyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartSync: (url: string) => void;
    onStopSync: () => void;
    onRefresh: () => void;
    syncStatus: 'idle' | 'syncing' | 'active' | 'error';
    draftId: string | null;
    error: string | null;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose, onStartSync, onStopSync, onRefresh, syncStatus, draftId, error }) => {
    const [draftUrl, setDraftUrl] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onStartSync(draftUrl);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="text-indigo-400"><SyncIcon /></div>
                            <div>
                               <h2 className="text-2xl font-bold text-white">Live Draft Sync</h2>
                               <p className="text-sm text-gray-400">Connect to your live Sleeper draft.</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                           <CloseIcon />
                        </button>
                    </div>

                    <div className="mt-6">
                        {syncStatus === 'idle' || syncStatus === 'error' ? (
                            <form onSubmit={handleSubmit}>
                                <label htmlFor="draft-url" className="block text-sm font-medium text-gray-300 mb-2">
                                    Sleeper Draft URL
                                </label>
                                <input
                                    id="draft-url"
                                    type="text"
                                    value={draftUrl}
                                    onChange={(e) => setDraftUrl(e.target.value)}
                                    placeholder="https://sleeper.com/draft/nfl/..."
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                                <button
                                    type="submit"
                                    // FIX: The `syncStatus` can only be 'idle' or 'error' in this block, so it can't be 'syncing'.
                                    // The button should be enabled. When clicked, the parent component's state change will
                                    // replace this form with a loading spinner.
                                    disabled={false}
                                    className="mt-4 w-full bg-indigo-600 text-white font-semibold py-2 rounded-md hover:bg-indigo-500 transition-colors disabled:bg-indigo-800 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {/* FIX: The button text was also checking for a 'syncing' status which is not possible in this render path. The text should be 'Start Sync'. */}
                                    {'Start Sync'}
                                </button>
                            </form>
                        ) : (
                            <div className="text-center">
                                {syncStatus === 'syncing' && (
                                     <div className="flex flex-col items-center gap-4">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
                                        <p className="text-lg text-white">Connecting to draft...</p>
                                     </div>
                                )}
                                {syncStatus === 'active' && (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="h-12 w-12 flex items-center justify-center text-green-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <p className="text-lg text-white">Live sync is active!</p>
                                        <p className="text-sm text-gray-400">Draft ID: {draftId}</p>
                                        <div className="flex gap-4 mt-2">
                                            <button onClick={onRefresh} className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors">Refresh</button>
                                            <button onClick={onStopSync} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors">Remove Sync</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncModal;