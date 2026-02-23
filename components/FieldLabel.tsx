
import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface FieldLabelProps {
  label: string;
  helpText?: string;
  className?: string;
  children?: React.ReactNode; // Optional children to render alongside label (e.g. icons)
}

export const FieldLabel: React.FC<FieldLabelProps> = ({ label, helpText, className = '', children }) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className={`mb-2 ${className}`}>
        <div className="flex items-center gap-2 mb-1 w-fit">
            <label className="text-gray-500 font-bold uppercase text-xs select-none flex items-center gap-2">
                {children}
                {label}
            </label>
            {helpText && (
                <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowHelp(!showHelp); }}
                    className={`transition-colors p-1 rounded-full hover:bg-blue-50 ${showHelp ? 'text-blue-600' : 'text-blue-400'}`}
                    title="Ajuda"
                >
                    <HelpCircle size={14} />
                </button>
            )}
        </div>
        {showHelp && helpText && (
            <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg border border-blue-100 mb-2 animate-in slide-in-from-top-1 fade-in duration-200">
                {helpText}
            </div>
        )}
    </div>
  );
};
