import React, { useState } from 'react';
import { CloseIcon } from './Icons';

type SyncStatus = 'idle' | 'syncing' | 'active' | 'error';

interface SyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartSync: (draftIdentifier: string) => void;
    onStopSync: () => void;
    syncStatus: SyncStatus;
    errorMessage: string | null;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose, onStartSync, onStopSync, syncStatus, errorMessage }) => {
    const [draftIdentifier, setDraftIdentifier] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (draftIdentifier.trim()) {
            setIsSubmitting(true);
            await onStartSync(draftIdentifier.trim());
            // Only set submitting to false if an error occurred, otherwise status will change
            if (syncStatus !== 'active' && syncStatus !== 'syncing') {
               setIsSubmitting(false);
            }
        }
    };
    
    // When the status changes from the parent, update the local submitting state
    React.useEffect(() => {
        if (syncStatus !== 'syncing') {
            setIsSubmitting(false);
        }
    }, [syncStatus]);

    if (!isOpen) return null;

    const getStatusMessage = () => {
        switch (syncStatus) {
            case 'syncing':
                return "Connecting to draft...";
            case 'active':
                return "Live sync is active. Player updates will appear automatically.";
            case 'error':
                return errorMessage || "An unknown error occurred.";
            default:
                return "Enter your Sleeper draft URL or Draft ID to begin.";
        }
    };

    const getStatusColor = () => {
         switch (syncStatus) {
            case 'active':
                return "text-green-400";
            case 'error':
                return "text-red-400";
            default:
                return "text-gray-400";
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <h2 className="text-2xl font-bold text-white">Sync Live Draft</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <CloseIcon />
                        </button>
                    </div>

                    <p className={`mt-2 text-sm ${getStatusColor()}`}>{getStatusMessage()}</p>
                    
                    <div className="mt-6">
                        {syncStatus === 'active' ? (
                             <button
                                onClick={onStopSync}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-md transition-colors"
                            >
                                Remove Sync
                            </button>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <input
                                    type="text"
                                    value={draftIdentifier}
                                    onChange={(e) => setDraftIdentifier(e.target.value)}
                                    placeholder="Sleeper URL or Draft ID"
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    disabled={isSubmitting || syncStatus === 'syncing'}
                                />
                                <button
                                    type="submit"
                                    disabled={!draftIdentifier.trim() || isSubmitting || syncStatus === 'syncing'}
                                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition-colors"
                                >
                                    {isSubmitting || syncStatus === 'syncing' ? 'Connecting...' : 'Start Sync'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncModal;
