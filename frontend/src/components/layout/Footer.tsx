import React from 'react';
import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
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

export type FooterLocation = {
  label?: string;
  value: string;
};

export interface FooterConfig {
  backgroundColor?: string;
  textColor?: string;
  titulo?: string;
  frasePrincipal?: string;
  logoUrl?: string | null;
  showLogo?: boolean;
  contacto: {
    email?: string;
    telefonos: FooterPhone[];
    redesSociales: FooterSocial[];
    ubicacion?: FooterLocation;
  };
}

export interface FooterProps {
  config: FooterConfig;
}

export const Footer: React.FC<FooterProps> = ({ config }) => {
  const {
    backgroundColor,
    textColor,
    titulo,
    frasePrincipal,
    logoUrl,
    showLogo,
    contacto
  } = config;

  const { email, telefonos = [], redesSociales = [], ubicacion } = contacto;
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
  const visiblePhones = telefonos.filter((telefono) => telefono.value?.trim());
  const visibleSocials = redesSociales.filter(
    (social) => social.value?.trim() && Boolean(socialIcons[social.type]),
  );
  const visibleEmail = email?.trim();
  const visibleLocation = ubicacion?.value?.trim() ? ubicacion : undefined;
  const hasCustomColors = Boolean(backgroundColor || textColor);
  const footerStyle = hasCustomColors
    ? {
        backgroundColor: backgroundColor || undefined,
        color: textColor || undefined,
        borderColor: textColor || backgroundColor || undefined,
      }
    : undefined;
  const mutedStyle = hasCustomColors ? { color: textColor || undefined, opacity: 0.78 } : undefined;
  const iconStyle = hasCustomColors ? { color: textColor || undefined } : undefined;
  const linkClassName = hasCustomColors
    ? "text-[10px] md:text-xs transition-colors hover:opacity-80"
    : "text-[10px] md:text-xs text-neutral-700 hover:text-[#064e3b] transition-colors";
  const iconLinkClassName = hasCustomColors
    ? "flex items-center justify-center hover:-translate-y-0.5 transition-transform duration-300 ease-out hover:opacity-80"
    : "flex items-center justify-center hover:-translate-y-0.5 transition-transform duration-300 ease-out text-[#064e3b] hover:text-emerald-700";

  return (
    <footer 
      className={`w-full mt-auto border-t-2 transition-colors duration-300 flex flex-col ${
        hasCustomColors ? "" : "bg-white text-neutral-800 border-[#064e3b]"
      }`}
      style={footerStyle}
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
              <div
                className={`text-sm font-medium tracking-tight leading-none ${
                  hasCustomColors ? "" : "text-[#064e3b]"
                }`}
              >
                {titulo}
              </div>
            )}
            {frasePrincipal && (
              <div
                className={`text-[10px] md:text-xs mt-1 ${hasCustomColors ? "" : "text-neutral-500"}`}
                style={mutedStyle}
              >
                {frasePrincipal}
              </div>
            )}
          </div>

          {/* Columna Derecha: Contacto y Social */}
          <div className="flex flex-col items-center md:items-end gap-2 mt-2 md:mt-0">
            
            {/* Contacto: Teléfonos y Email */}
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-3 gap-y-1">
              {visiblePhones.map((telefono, index) => (
                <div key={`${telefono.value}-${index}`} className="flex items-center space-x-1 group">
                  <Phone className={`w-3 h-3 md:w-3.5 md:h-3.5 ${hasCustomColors ? "" : "text-[#064e3b]"}`} style={iconStyle} strokeWidth={2} />
                  <span className={`text-[10px] md:text-xs ${hasCustomColors ? "" : "text-neutral-700"}`}>{telefono.value}</span>
                </div>
              ))}
              {visibleEmail && (
                <div className="flex items-center space-x-1 group">
                  <Mail className={`w-3 h-3 md:w-3.5 md:h-3.5 ${hasCustomColors ? "" : "text-[#064e3b]"}`} style={iconStyle} strokeWidth={2} />
                  <a 
                    href={`mailto:${visibleEmail}`} 
                    className={linkClassName}
                  >
                    {visibleEmail}
                  </a>
                </div>
              )}
              {visibleLocation && (
                <div className="flex items-center space-x-1 group">
                  <MapPin className={`w-3 h-3 md:w-3.5 md:h-3.5 ${hasCustomColors ? "" : "text-[#064e3b]"}`} style={iconStyle} strokeWidth={2} />
                  <a
                    href={visibleLocation.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClassName}
                  >
                    {visibleLocation.label || "Cómo llegar"}
                  </a>
                </div>
              )}
            </div>

            {/* Redes Sociales */}
            {visibleSocials.length > 0 && (
              <div className="flex items-center justify-center md:justify-end space-x-3">
                {visibleSocials.map((social, index) => {
                  const Icon = socialIcons[social.type];
                  return (
                  <a 
                    key={`${social.type}-${index}`}
                    href={social.value} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={iconLinkClassName}
                    style={iconStyle}
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
      <div
        className={`w-full border-t py-2 ${hasCustomColors ? "bg-transparent" : "border-neutral-100 bg-neutral-50/50"}`}
        style={hasCustomColors ? { borderColor: textColor || undefined } : undefined}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-[10px] text-center ${hasCustomColors ? "" : "text-neutral-400"}`}
            style={mutedStyle}
          >
            © 2026&nbsp;
            <a 
              href="https://www.instagram.com/sactec.dev/" 
              target="_blank"
              rel="noopener noreferrer"
              className={`transition-colors font-medium hover:underline underline-offset-2 ${
                hasCustomColors ? "hover:opacity-80" : "text-neutral-500 hover:text-[#064e3b]"
              }`}
            >
              Sactec
            </a>
            &nbsp;| Desarrollado por{' '}
            <a 
              href="https://portfolioempresa.pages.dev/" 
              target="_blank"
              rel="noopener noreferrer"
              className={`transition-colors font-medium hover:underline underline-offset-2 duration-200 ${
                hasCustomColors ? "hover:opacity-80" : "text-emerald-600 hover:text-[#064e3b]"
              }`}
            >
              SAVIK
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
