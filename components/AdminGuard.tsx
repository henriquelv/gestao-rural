import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldX } from 'lucide-react';
import { Header } from './Header';
import { Layout } from './Layout';
import { permissionsService } from '../services/permissions.service';

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  if (permissionsService.isAdmin()) return <>{children}</>;

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Acesso da gestão" targetRoute="/" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full rounded-[24px] border border-[#d8d0c2] bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f7e7dd] text-[#8b3e2f]">
            <ShieldX size={32} />
          </div>
          <h2 className="campo-display mt-5 text-2xl text-[#173f32]">Área exclusiva do administrador</h2>
          <p className="mt-2 text-sm leading-6 text-[#68746d]">Configurações, valores gerais e indicadores da equipe são acessíveis somente ao Administrador.</p>
          <button type="button" onClick={() => navigate('/')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#173f32] px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-white">
            <ArrowLeft size={17} /> Voltar ao início
          </button>
        </div>
      </main>
    </Layout>
  );
};
