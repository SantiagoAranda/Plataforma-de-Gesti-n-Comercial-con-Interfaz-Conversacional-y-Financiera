import React from 'react';
import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Music2,
  Phone,
  Twitter,
  Youtube,
  type LucideIcon,
} from 'lucide-react';

export type FooterPhone = {
  label?: string;
  value: string;
};

export type FooterSocial = {
  type: string;
  label?: string;
  value: string;
};

export interface FooterConfig {
  backgroundColor?: string;
  titulo?: string;
  frasePrincipal?: string;
  logoUrl?: string | null;
  showLogo?: boolean;
  contacto: {
    email?: string;
    telefonos: FooterPhone[];
    redesSociales: FooterSocial[];
  };
}

export interface FooterProps {
  config: FooterConfig;
}

export const Footer: React.FC<FooterProps> = ({ config }) => {
  const {
    backgroundColor = '#064e3b',
    titulo,
    frasePrincipal,
    logoUrl,
    showLogo,
    contacto
  } = config;

  const { email, telefonos = [], redesSociales = [] } = contacto;
  const socialIcons: Record<string, LucideIcon> = {
    facebook: Facebook,
    instagram: Instagram,
    youtube: Youtube,
    tiktok: Music2,
    linkedin: Linkedin,
    x: Twitter,
    twitter: Twitter,
    whatsapp: MessageCircle,
    website: Globe,
  };

  return (
    <footer 
      className="w-full mt-auto bg-white text-neutral-800 border-t-2 border-[#064e3b] transition-colors duration-300 flex flex-col"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 md:py-3 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          
          {/* Columna Izquierda: Branding */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            {showLogo && logoUrl && (
              <img
                src={logoUrl}
                alt={titulo || 'Logo'}
                className="mb-3 h-12 w-12 rounded-full object-cover md:h-14 md:w-14"
              />
            )}
            {titulo && (
              <div className="text-sm font-medium tracking-tight leading-none text-[#064e3b]">
                {titulo}
              </div>
            )}
            {frasePrincipal && (
              <div className="text-[10px] md:text-xs text-neutral-500 mt-1">
                {frasePrincipal}
              </div>
            )}
          </div>

          {/* Columna Derecha: Contacto y Social */}
          <div className="flex flex-col items-center md:items-end gap-2 mt-2 md:mt-0">
            
            {/* Contacto: Teléfonos y Email */}
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-3 gap-y-1">
              {telefonos.map((telefono, index) => (
                <div key={`${telefono.value}-${index}`} className="flex items-center space-x-1 group">
                  <Phone className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#064e3b]" strokeWidth={2} />
                  <span className="text-[10px] md:text-xs text-neutral-700">{telefono.value}</span>
                </div>
              ))}
              {email && (
                <div className="flex items-center space-x-1 group">
                  <Mail className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#064e3b]" strokeWidth={2} />
                  <a 
                    href={`mailto:${email}`} 
                    className="text-[10px] md:text-xs text-neutral-700 hover:text-[#064e3b] transition-colors"
                  >
                    {email}
                  </a>
                </div>
              )}
            </div>

            {/* Redes Sociales */}
            {redesSociales.length > 0 && (
              <div className="flex items-center justify-center md:justify-end space-x-3">
                {redesSociales.map((social, index) => {
                  const Icon = socialIcons[social.type] ?? Globe;
                  return (
                  <a 
                    key={`${social.type}-${index}`}
                    href={social.value} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center hover:-translate-y-0.5 transition-transform duration-300 ease-out text-[#064e3b] hover:text-emerald-700"
                    aria-label={social.label || social.type}
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Franja de Copyright (El Remate) */}
      <div className="w-full border-t border-neutral-100 bg-neutral-50/50 py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-[10px] text-neutral-400 text-center">
            © 2026&nbsp;
            <a 
              href="https://www.instagram.com/sactec.dev/" 
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#064e3b] transition-colors font-medium text-neutral-500 hover:underline underline-offset-2"
            >
              Sactec
            </a>
            &nbsp;| Desarrollado por{' '}
            <a 
              href="https://instagram.com/savik.ar" 
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#064e3b] transition-colors font-medium text-neutral-500 hover:underline underline-offset-2"
            >
              Savik
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
