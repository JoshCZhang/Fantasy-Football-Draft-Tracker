
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './Icons';

interface SaveRankingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    existingNames: string[];
}

const SaveRankingsModal: React.FC<SaveRankingsModalProps> = ({ isOpen, onClose, onSave, existingNames }) => {
    const [name, setName] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!name.trim()) {
            alert('Please enter a name for your rankings.');
            return;
        }
        if (existingNames.includes(name.trim())) {
            if (!window.confirm(`A ranking set named "${name.trim()}" already exists. Do you want to overwrite it?`)) {
                return;
            }
        }
        onSave(name.trim());
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <h2 className="text-xl font-bold text-white">Save Rankings</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <CloseIcon />
                        </button>
                    </div>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label htmlFor="ranking-name" className="block text-sm font-medium text-gray-300 mb-2">
                                Ranking Name
                            </label>
                            <input
                                id="ranking-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., My Zero-RB Strategy"
                                className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex justify-end gap-4">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500"
                                disabled={!name.trim()}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaveRankingsModal;
