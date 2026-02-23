import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  targetRoute?: string;
}

// Logo Vetorial MDA Fidedigna
const MDA_LOGO_SVG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgNjAiPgogIDx0ZXh0IHg9IjIiIHk9IjE4IiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM4ODg4ODgiPnNpc3RlbWE8L3RleHQ+CiAgPHRleHQgeD0iMCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzMzMzMzMyI+TTwvdGV4dD4KICA8dGV4dCB4PSI0NCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzAwOWFkZSI+RDwvdGV4dD4KICA8dGV4dCB4PSI4NCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzMzMzMzMyI+QTwvdGV4dD4KPC9zdmc+`;

export const Header: React.FC<HeaderProps> = ({ title, showBack = true, targetRoute }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (targetRoute) {
      navigate(targetRoute);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-50 flex items-center px-4 h-16 shadow-sm shrink-0">
      {showBack && (
        <button 
          onClick={handleBack}
          className="mr-3 p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600"
        >
          <ArrowLeft size={24} />
        </button>
      )}
      
      <div className="flex-1 flex items-center justify-between overflow-hidden">
        <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight truncate mr-2">
          {title}
        </h1>
        <img 
          src={MDA_LOGO_SVG} 
          alt="Sistema MDA" 
          className="h-10 w-auto object-contain"
        />
      </div>
    </div>
  );
};
