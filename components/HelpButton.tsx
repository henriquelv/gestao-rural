
import React from 'react';
import { HelpCircle } from 'lucide-react';
import { notify } from '../services/notification.service';

interface HelpButtonProps {
  text: string;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ text }) => {
  return (
    <button
      type="button"
      onClick={() => notify(text, 'info')}
      className="ml-2 text-blue-400 hover:text-blue-600 transition-colors"
      title="Clique para ver uma dica"
    >
      <HelpCircle size={16} />
    </button>
  );
};
