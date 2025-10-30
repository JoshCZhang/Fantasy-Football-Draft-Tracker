
import React from 'react';

interface LoadingOverlayProps {
    isLoading: boolean;
    text?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading, text = 'Loading...' }) => {
    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center z-[100]" aria-live="assertive" role="alert">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-400"></div>
            <p className="text-white text-lg mt-4 font-semibold">{text}</p>
        </div>
    );
};

export default LoadingOverlay;
