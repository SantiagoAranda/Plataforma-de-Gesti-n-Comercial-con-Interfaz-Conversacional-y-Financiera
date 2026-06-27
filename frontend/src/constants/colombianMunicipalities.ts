export type ColombianMunicipality = {
  code: string;
  name: string;
};

export const COLOMBIAN_MUNICIPALITIES: ColombianMunicipality[] = [
  { code: "11001", name: "Bogota D.C. (Cundinamarca)" },
  { code: "05001", name: "Medellin (Antioquia)" },
  { code: "76001", name: "Cali (Valle del Cauca)" },
  { code: "08001", name: "Barranquilla (Atlantico)" },
  { code: "13001", name: "Cartagena (Bolivar)" },
  { code: "68001", name: "Bucaramanga (Santander)" },
  { code: "54001", name: "Cucuta (Norte de Santander)" },
  { code: "66001", name: "Pereira (Risaralda)" },
  { code: "17001", name: "Manizales (Caldas)" },
  { code: "73001", name: "Ibague (Tolima)" },
  { code: "47001", name: "Santa Marta (Magdalena)" },
  { code: "52001", name: "Pasto (Narino)" },
  { code: "41001", name: "Neiva (Huila)" },
  { code: "50001", name: "Villavicencio (Meta)" },
  { code: "05266", name: "Envigado (Antioquia)" },
  { code: "05631", name: "Sabaneta (Antioquia)" },
  { code: "05360", name: "Itagui (Antioquia)" },
  { code: "05088", name: "Bello (Antioquia)" },
  { code: "08758", name: "Soledad (Atlantico)" },
  { code: "68276", name: "Floridablanca (Santander)" },
];

export function getMunicipalityName(code: string) {
  return COLOMBIAN_MUNICIPALITIES.find((municipality) => municipality.code === code)?.name ?? code;
}

export function getDepartmentCodeFromMunicipality(code: string) {
  return code.trim().slice(0, 2);
}
