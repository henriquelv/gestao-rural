
import React, { useState, useRef } from 'react';
import { Mic, StopCircle, Loader2 } from 'lucide-react';
import { notify } from '../services/notification.service';

interface MicrophoneButtonProps {
  onResult: (text: string) => void;
  className?: string;
}

export const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ onResult, className = '' }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleListening = async () => {
    try {
      // Verifica se está em HTTPS ou localhost (requisito do SpeechRecognition)
      const isSecureContext = window.isSecureContext || 
                               window.location.protocol === 'https:' || 
                               window.location.hostname === 'localhost' || 
                               window.location.hostname === '127.0.0.1';
      
      if (!isSecureContext) {
        notify("Reconhecimento de voz requer HTTPS ou localhost. Use 'npm run dev' para testar localmente.", "error");
        return;
      }

      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        notify("Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.", "error");
        return;
      }

      // Se já está ouvindo, para
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Erro ao parar:', e);
        }
        setIsListening(false);
        recognitionRef.current = null;
        return;
      }

      // Solicita permissão de microfone primeiro
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Libera o stream imediatamente
      } catch (permError: any) {
        const errorName = permError?.name || 'Unknown';
        if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
          notify("Permissão de microfone negada. Clique no ícone de cadeado na barra de endereços e permita o microfone.", "error");
        } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
          notify("Nenhum microfone encontrado. Conecte um microfone e tente novamente.", "error");
        } else {
          notify("Erro ao acessar o microfone. Verifique as permissões do navegador.", "error");
        }
        console.error('Erro de permissão:', permError);
        return;
      }

      // Cria instância do reconhecimento
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        notify("Ouvindo... Fale agora.", "info");
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        recognitionRef.current = null;
        
        const errorMessages: Record<string, string> = {
          'no-speech': 'Nenhum áudio detectado. Tente falar mais alto ou mais próximo do microfone.',
          'audio-capture': 'Não foi possível acessar o microfone. Verifique as permissões.',
          'not-allowed': 'Permissão de microfone negada. Permita nas configurações do navegador.',
          'network': 'Erro de rede. Verifique sua conexão com a internet.',
          'aborted': 'Reconhecimento cancelado.',
          'service-not-allowed': 'Serviço de reconhecimento não disponível.',
        };
        
        const errorMsg = errorMessages[event.error] || `Erro: ${event.error}. Tente novamente.`;
        notify(errorMsg, "error");
        console.error('Speech recognition error:', event.error, event);
      };

      recognition.onresult = (event: any) => {
        try {
          if (event.results && event.results.length > 0 && event.results[0].length > 0) {
            const transcript = event.results[0][0].transcript;
            if (transcript && transcript.trim()) {
              onResult(transcript.trim());
              notify("Texto transcrito!", "success");
            } else {
              notify("Nenhum texto foi detectado. Tente falar novamente.", "info");
            }
          }
        } catch (e) {
          console.error('Erro ao processar resultado:', e);
          notify("Erro ao processar o texto transcrito.", "error");
        }
      };

      // Inicia o reconhecimento
      try {
        recognition.start();
      } catch (startError: any) {
        setIsListening(false);
        recognitionRef.current = null;
        console.error('Erro ao iniciar reconhecimento:', startError);
        if (startError.message?.includes('already started')) {
          notify("Reconhecimento já está em andamento. Aguarde um momento.", "info");
        } else {
          notify("Erro ao iniciar o reconhecimento. Tente novamente.", "error");
        }
      }
    } catch (error: any) {
      setIsListening(false);
      recognitionRef.current = null;
      console.error('Erro geral no reconhecimento:', error);
      notify("Erro ao iniciar o reconhecimento de voz. Verifique se está usando Chrome/Edge em HTTPS ou localhost.", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${
        isListening 
          ? 'bg-red-500 text-white animate-pulse shadow-red-300 shadow-lg' 
          : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600'
      } ${className}`}
      title="Gravar áudio para texto"
    >
      {isListening ? <StopCircle size={20} /> : <Mic size={20} />}
    </button>
  );
};
