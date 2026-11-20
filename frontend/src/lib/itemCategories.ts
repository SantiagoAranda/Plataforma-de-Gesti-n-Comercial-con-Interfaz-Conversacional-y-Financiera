// Generated from docs/archivos-interfaz/Nuevo Productos Ajustes.html (CATEGORY_TREE).
// Ids are stable and persisted in Item.categoryId / Item.subcategoryId: never rename an id.
// Mirrored from backend/src/items/item-categories.data.ts; parity is tested.

export type ItemCatalogCategory = {
  id: string;
  label: string;
  subcategories: ReadonlyArray<{ id: string; label: string }>;
};

/** "Otra categoría": the item carries its own customCategoryName/customSubcategoryName. */
export const OTHER_CATEGORY_ID = 'otra';

export const ITEM_CATEGORIES: ReadonlyArray<ItemCatalogCategory> = [
  {
    id: 'alimentos-y-bebidas',
    label: 'Alimentos y Bebidas',
    subcategories: [
      {
        id: 'alimentos-y-bebidas/snacks-y-pasabocas',
        label: 'Snacks y Pasabocas',
      },
      {
        id: 'alimentos-y-bebidas/bebidas-sin-alcohol',
        label: 'Bebidas sin alcohol',
      },
      {
        id: 'alimentos-y-bebidas/licores-y-cervezas',
        label: 'Licores y Cervezas',
      },
      { id: 'alimentos-y-bebidas/lacteos-y-huevos', label: 'Lácteos y Huevos' },
      {
        id: 'alimentos-y-bebidas/carnes-pescados-y-embutidos',
        label: 'Carnes, Pescados y Embutidos',
      },
      {
        id: 'alimentos-y-bebidas/frutas-y-verduras',
        label: 'Frutas y Verduras',
      },
      {
        id: 'alimentos-y-bebidas/panaderia-y-galletas',
        label: 'Panadería y Galletas',
      },
      {
        id: 'alimentos-y-bebidas/dulces-y-chocolates',
        label: 'Dulces y Chocolates',
      },
      {
        id: 'alimentos-y-bebidas/cereales-y-desayuno',
        label: 'Cereales y Desayuno',
      },
      {
        id: 'alimentos-y-bebidas/cafe-te-e-infusiones',
        label: 'Café, Té e Infusiones',
      },
      {
        id: 'alimentos-y-bebidas/aceites-salsas-y-condimentos',
        label: 'Aceites, Salsas y Condimentos',
      },
      {
        id: 'alimentos-y-bebidas/despensa-y-granos',
        label: 'Despensa y Granos',
      },
      {
        id: 'alimentos-y-bebidas/congelados-y-helados',
        label: 'Congelados y Helados',
      },
      { id: 'alimentos-y-bebidas/comida-para-bebe', label: 'Comida para bebé' },
      {
        id: 'alimentos-y-bebidas/comida-saludable-y-organica',
        label: 'Comida saludable y orgánica',
      },
    ],
  },
  {
    id: 'electronica-y-tecnologia',
    label: 'Electrónica y Tecnología',
    subcategories: [
      {
        id: 'electronica-y-tecnologia/celulares-y-accesorios',
        label: 'Celulares y Accesorios',
      },
      {
        id: 'electronica-y-tecnologia/computadores-y-portatiles',
        label: 'Computadores y Portátiles',
      },
      {
        id: 'electronica-y-tecnologia/tablets-y-e-readers',
        label: 'Tablets y E-readers',
      },
      {
        id: 'electronica-y-tecnologia/audio-y-sonido',
        label: 'Audio y Sonido',
      },
      { id: 'electronica-y-tecnologia/tv-y-video', label: 'TV y Video' },
      {
        id: 'electronica-y-tecnologia/camaras-y-fotografia',
        label: 'Cámaras y Fotografía',
      },
      {
        id: 'electronica-y-tecnologia/videojuegos-y-consolas',
        label: 'Videojuegos y Consolas',
      },
      {
        id: 'electronica-y-tecnologia/relojes-inteligentes-y-wearables',
        label: 'Relojes inteligentes y Wearables',
      },
      {
        id: 'electronica-y-tecnologia/cables-cargadores-y-baterias',
        label: 'Cables, Cargadores y Baterías',
      },
      {
        id: 'electronica-y-tecnologia/redes-y-conectividad',
        label: 'Redes y Conectividad',
      },
      {
        id: 'electronica-y-tecnologia/componentes-y-almacenamiento',
        label: 'Componentes y Almacenamiento',
      },
      {
        id: 'electronica-y-tecnologia/impresoras-y-escaneres',
        label: 'Impresoras y Escáneres',
      },
      {
        id: 'electronica-y-tecnologia/drones-y-gadgets',
        label: 'Drones y Gadgets',
      },
    ],
  },
  {
    id: 'electrodomesticos',
    label: 'Electrodomésticos',
    subcategories: [
      {
        id: 'electrodomesticos/cocina-neveras-estufas-hornos',
        label: 'Cocina (neveras, estufas, hornos)',
      },
      { id: 'electrodomesticos/lavado-y-secado', label: 'Lavado y Secado' },
      {
        id: 'electrodomesticos/pequenos-electrodomesticos',
        label: 'Pequeños electrodomésticos',
      },
      {
        id: 'electrodomesticos/climatizacion-y-ventilacion',
        label: 'Climatización y Ventilación',
      },
      {
        id: 'electrodomesticos/aspiradoras-y-limpieza',
        label: 'Aspiradoras y Limpieza',
      },
      {
        id: 'electrodomesticos/cuidado-personal-planchas-secadores',
        label: 'Cuidado personal (planchas, secadores)',
      },
    ],
  },
  {
    id: 'hogar-y-muebles',
    label: 'Hogar y Muebles',
    subcategories: [
      { id: 'hogar-y-muebles/muebles-de-sala', label: 'Muebles de sala' },
      { id: 'hogar-y-muebles/muebles-de-comedor', label: 'Muebles de comedor' },
      {
        id: 'hogar-y-muebles/dormitorio-y-colchones',
        label: 'Dormitorio y Colchones',
      },
      { id: 'hogar-y-muebles/iluminacion', label: 'Iluminación' },
      { id: 'hogar-y-muebles/decoracion', label: 'Decoración' },
      {
        id: 'hogar-y-muebles/textiles-de-hogar-sabanas-cortinas',
        label: 'Textiles de hogar (sábanas, cortinas)',
      },
      {
        id: 'hogar-y-muebles/organizacion-y-almacenamiento',
        label: 'Organización y Almacenamiento',
      },
      { id: 'hogar-y-muebles/bano', label: 'Baño' },
      {
        id: 'hogar-y-muebles/alfombras-y-tapetes',
        label: 'Alfombras y Tapetes',
      },
    ],
  },
  {
    id: 'cocina-y-menaje',
    label: 'Cocina y Menaje',
    subcategories: [
      { id: 'cocina-y-menaje/ollas-y-sartenes', label: 'Ollas y Sartenes' },
      {
        id: 'cocina-y-menaje/vajillas-y-cubiertos',
        label: 'Vajillas y Cubiertos',
      },
      { id: 'cocina-y-menaje/vasos-y-copas', label: 'Vasos y Copas' },
      {
        id: 'cocina-y-menaje/utensilios-de-cocina',
        label: 'Utensilios de cocina',
      },
      {
        id: 'cocina-y-menaje/recipientes-y-termos',
        label: 'Recipientes y Termos',
      },
      {
        id: 'cocina-y-menaje/reposteria-y-moldes',
        label: 'Repostería y Moldes',
      },
    ],
  },
  {
    id: 'aseo-y-limpieza',
    label: 'Aseo y Limpieza',
    subcategories: [
      {
        id: 'aseo-y-limpieza/detergentes-y-jabones',
        label: 'Detergentes y Jabones',
      },
      {
        id: 'aseo-y-limpieza/desinfectantes-y-limpiadores',
        label: 'Desinfectantes y Limpiadores',
      },
      {
        id: 'aseo-y-limpieza/papel-higienico-y-desechables',
        label: 'Papel higiénico y Desechables',
      },
      { id: 'aseo-y-limpieza/bolsas-y-empaques', label: 'Bolsas y Empaques' },
      {
        id: 'aseo-y-limpieza/escobas-traperos-y-utensilios',
        label: 'Escobas, Traperos y Utensilios',
      },
      { id: 'aseo-y-limpieza/ambientadores', label: 'Ambientadores' },
    ],
  },
  {
    id: 'moda-mujer',
    label: 'Moda Mujer',
    subcategories: [
      { id: 'moda-mujer/camisas-y-blusas', label: 'Camisas y Blusas' },
      { id: 'moda-mujer/vestidos-y-faldas', label: 'Vestidos y Faldas' },
      { id: 'moda-mujer/pantalones-y-jeans', label: 'Pantalones y Jeans' },
      { id: 'moda-mujer/ropa-deportiva', label: 'Ropa deportiva' },
      {
        id: 'moda-mujer/ropa-interior-y-pijamas',
        label: 'Ropa interior y Pijamas',
      },
      { id: 'moda-mujer/abrigos-y-chaquetas', label: 'Abrigos y Chaquetas' },
      { id: 'moda-mujer/trajes-de-bano', label: 'Trajes de baño' },
    ],
  },
  {
    id: 'moda-hombre',
    label: 'Moda Hombre',
    subcategories: [
      { id: 'moda-hombre/camisas-y-camisetas', label: 'Camisas y Camisetas' },
      { id: 'moda-hombre/pantalones-y-jeans', label: 'Pantalones y Jeans' },
      { id: 'moda-hombre/ropa-deportiva', label: 'Ropa deportiva' },
      {
        id: 'moda-hombre/ropa-interior-y-pijamas',
        label: 'Ropa interior y Pijamas',
      },
      { id: 'moda-hombre/abrigos-y-chaquetas', label: 'Abrigos y Chaquetas' },
      { id: 'moda-hombre/trajes-y-formal', label: 'Trajes y Formal' },
      { id: 'moda-hombre/trajes-de-bano', label: 'Trajes de baño' },
    ],
  },
  {
    id: 'moda-infantil',
    label: 'Moda Infantil',
    subcategories: [
      { id: 'moda-infantil/ropa-de-nina', label: 'Ropa de niña' },
      { id: 'moda-infantil/ropa-de-nino', label: 'Ropa de niño' },
      { id: 'moda-infantil/ropa-de-bebe', label: 'Ropa de bebé' },
      { id: 'moda-infantil/uniformes-escolares', label: 'Uniformes escolares' },
      { id: 'moda-infantil/disfraces', label: 'Disfraces' },
    ],
  },
  {
    id: 'calzado',
    label: 'Calzado',
    subcategories: [
      { id: 'calzado/tenis-y-deportivos', label: 'Tenis y Deportivos' },
      { id: 'calzado/zapatos-formales', label: 'Zapatos formales' },
      { id: 'calzado/sandalias-y-chancletas', label: 'Sandalias y Chancletas' },
      { id: 'calzado/botas', label: 'Botas' },
      { id: 'calzado/calzado-infantil', label: 'Calzado infantil' },
      { id: 'calzado/calzado-de-seguridad', label: 'Calzado de seguridad' },
    ],
  },
  {
    id: 'accesorios-y-joyeria',
    label: 'Accesorios y Joyería',
    subcategories: [
      {
        id: 'accesorios-y-joyeria/bolsos-y-carteras',
        label: 'Bolsos y Carteras',
      },
      {
        id: 'accesorios-y-joyeria/mochilas-y-maletas',
        label: 'Mochilas y Maletas',
      },
      { id: 'accesorios-y-joyeria/relojes', label: 'Relojes' },
      {
        id: 'accesorios-y-joyeria/joyeria-y-bisuteria',
        label: 'Joyería y Bisutería',
      },
      { id: 'accesorios-y-joyeria/gafas-y-lentes', label: 'Gafas y Lentes' },
      {
        id: 'accesorios-y-joyeria/gorras-y-sombreros',
        label: 'Gorras y Sombreros',
      },
      {
        id: 'accesorios-y-joyeria/cinturones-y-billeteras',
        label: 'Cinturones y Billeteras',
      },
    ],
  },
  {
    id: 'belleza-y-cuidado-personal',
    label: 'Belleza y Cuidado Personal',
    subcategories: [
      { id: 'belleza-y-cuidado-personal/maquillaje', label: 'Maquillaje' },
      {
        id: 'belleza-y-cuidado-personal/cuidado-de-la-piel',
        label: 'Cuidado de la piel',
      },
      {
        id: 'belleza-y-cuidado-personal/cuidado-del-cabello',
        label: 'Cuidado del cabello',
      },
      {
        id: 'belleza-y-cuidado-personal/perfumes-y-fragancias',
        label: 'Perfumes y Fragancias',
      },
      { id: 'belleza-y-cuidado-personal/cuidado-oral', label: 'Cuidado oral' },
      {
        id: 'belleza-y-cuidado-personal/afeitado-y-depilacion',
        label: 'Afeitado y Depilación',
      },
      {
        id: 'belleza-y-cuidado-personal/higiene-personal',
        label: 'Higiene personal',
      },
      {
        id: 'belleza-y-cuidado-personal/unas-y-manicura',
        label: 'Uñas y Manicura',
      },
    ],
  },
  {
    id: 'salud-y-bienestar',
    label: 'Salud y Bienestar',
    subcategories: [
      {
        id: 'salud-y-bienestar/vitaminas-y-suplementos',
        label: 'Vitaminas y Suplementos',
      },
      { id: 'salud-y-bienestar/primeros-auxilios', label: 'Primeros auxilios' },
      { id: 'salud-y-bienestar/equipos-medicos', label: 'Equipos médicos' },
      { id: 'salud-y-bienestar/cuidado-sexual', label: 'Cuidado sexual' },
      {
        id: 'salud-y-bienestar/salud-visual-y-auditiva',
        label: 'Salud visual y auditiva',
      },
      {
        id: 'salud-y-bienestar/ortopedia-y-soporte',
        label: 'Ortopedia y Soporte',
      },
      {
        id: 'salud-y-bienestar/productos-naturales',
        label: 'Productos naturales',
      },
    ],
  },
  {
    id: 'bebes-y-maternidad',
    label: 'Bebés y Maternidad',
    subcategories: [
      {
        id: 'bebes-y-maternidad/panales-y-toallitas',
        label: 'Pañales y Toallitas',
      },
      {
        id: 'bebes-y-maternidad/alimentacion-y-lactancia',
        label: 'Alimentación y Lactancia',
      },
      {
        id: 'bebes-y-maternidad/coches-y-sillas-de-auto',
        label: 'Coches y Sillas de auto',
      },
      {
        id: 'bebes-y-maternidad/cunas-y-mobiliario',
        label: 'Cunas y Mobiliario',
      },
      {
        id: 'bebes-y-maternidad/juguetes-para-bebe',
        label: 'Juguetes para bebé',
      },
      {
        id: 'bebes-y-maternidad/ropa-de-maternidad',
        label: 'Ropa de maternidad',
      },
      {
        id: 'bebes-y-maternidad/bano-y-cuidado-del-bebe',
        label: 'Baño y Cuidado del bebé',
      },
    ],
  },
  {
    id: 'juguetes-y-juegos',
    label: 'Juguetes y Juegos',
    subcategories: [
      {
        id: 'juguetes-y-juegos/munecas-y-peluches',
        label: 'Muñecas y Peluches',
      },
      {
        id: 'juguetes-y-juegos/juegos-de-mesa-y-puzzles',
        label: 'Juegos de mesa y Puzzles',
      },
      {
        id: 'juguetes-y-juegos/construccion-y-bloques',
        label: 'Construcción y Bloques',
      },
      {
        id: 'juguetes-y-juegos/vehiculos-y-radiocontrol',
        label: 'Vehículos y Radiocontrol',
      },
      {
        id: 'juguetes-y-juegos/juguetes-educativos',
        label: 'Juguetes educativos',
      },
      {
        id: 'juguetes-y-juegos/juegos-al-aire-libre',
        label: 'Juegos al aire libre',
      },
      {
        id: 'juguetes-y-juegos/figuras-y-coleccionables',
        label: 'Figuras y Coleccionables',
      },
    ],
  },
  {
    id: 'deportes-y-fitness',
    label: 'Deportes y Fitness',
    subcategories: [
      {
        id: 'deportes-y-fitness/ropa-y-calzado-deportivo',
        label: 'Ropa y Calzado deportivo',
      },
      { id: 'deportes-y-fitness/gimnasio-y-pesas', label: 'Gimnasio y Pesas' },
      { id: 'deportes-y-fitness/ciclismo', label: 'Ciclismo' },
      {
        id: 'deportes-y-fitness/futbol-y-deportes-de-equipo',
        label: 'Fútbol y Deportes de equipo',
      },
      { id: 'deportes-y-fitness/natacion', label: 'Natación' },
      { id: 'deportes-y-fitness/yoga-y-pilates', label: 'Yoga y Pilates' },
      { id: 'deportes-y-fitness/patines-y-skate', label: 'Patines y Skate' },
      {
        id: 'deportes-y-fitness/suplementos-deportivos',
        label: 'Suplementos deportivos',
      },
      {
        id: 'deportes-y-fitness/artes-marciales-y-boxeo',
        label: 'Artes marciales y Boxeo',
      },
    ],
  },
  {
    id: 'camping-y-aventura',
    label: 'Camping y Aventura',
    subcategories: [
      { id: 'camping-y-aventura/carpas-y-dormir', label: 'Carpas y Dormir' },
      {
        id: 'camping-y-aventura/mochilas-de-viaje',
        label: 'Mochilas de viaje',
      },
      { id: 'camping-y-aventura/pesca', label: 'Pesca' },
      { id: 'camping-y-aventura/senderismo', label: 'Senderismo' },
      {
        id: 'camping-y-aventura/linternas-y-navegacion',
        label: 'Linternas y Navegación',
      },
    ],
  },
  {
    id: 'automotriz-y-motos',
    label: 'Automotriz y Motos',
    subcategories: [
      {
        id: 'automotriz-y-motos/repuestos-de-carro',
        label: 'Repuestos de carro',
      },
      {
        id: 'automotriz-y-motos/repuestos-de-moto',
        label: 'Repuestos de moto',
      },
      { id: 'automotriz-y-motos/llantas-y-rines', label: 'Llantas y Rines' },
      {
        id: 'automotriz-y-motos/aceites-y-lubricantes',
        label: 'Aceites y Lubricantes',
      },
      {
        id: 'automotriz-y-motos/accesorios-para-carro',
        label: 'Accesorios para carro',
      },
      {
        id: 'automotriz-y-motos/accesorios-para-moto-y-cascos',
        label: 'Accesorios para moto y Cascos',
      },
      {
        id: 'automotriz-y-motos/audio-y-electronica-vehicular',
        label: 'Audio y Electrónica vehicular',
      },
      {
        id: 'automotriz-y-motos/limpieza-y-cuidado-del-auto',
        label: 'Limpieza y Cuidado del auto',
      },
    ],
  },
  {
    id: 'herramientas-y-ferreteria',
    label: 'Herramientas y Ferretería',
    subcategories: [
      {
        id: 'herramientas-y-ferreteria/herramientas-electricas',
        label: 'Herramientas eléctricas',
      },
      {
        id: 'herramientas-y-ferreteria/herramientas-manuales',
        label: 'Herramientas manuales',
      },
      {
        id: 'herramientas-y-ferreteria/pinturas-y-acabados',
        label: 'Pinturas y Acabados',
      },
      {
        id: 'herramientas-y-ferreteria/plomeria-y-griferia',
        label: 'Plomería y Grifería',
      },
      {
        id: 'herramientas-y-ferreteria/electricidad-e-iluminacion',
        label: 'Electricidad e Iluminación',
      },
      {
        id: 'herramientas-y-ferreteria/cerraduras-y-seguridad',
        label: 'Cerraduras y Seguridad',
      },
      {
        id: 'herramientas-y-ferreteria/materiales-de-construccion',
        label: 'Materiales de construcción',
      },
      {
        id: 'herramientas-y-ferreteria/tornilleria-y-fijaciones',
        label: 'Tornillería y Fijaciones',
      },
    ],
  },
  {
    id: 'jardin-y-exteriores',
    label: 'Jardín y Exteriores',
    subcategories: [
      {
        id: 'jardin-y-exteriores/plantas-y-semillas',
        label: 'Plantas y Semillas',
      },
      {
        id: 'jardin-y-exteriores/macetas-y-jardineras',
        label: 'Macetas y Jardineras',
      },
      {
        id: 'jardin-y-exteriores/herramientas-de-jardin',
        label: 'Herramientas de jardín',
      },
      { id: 'jardin-y-exteriores/riego', label: 'Riego' },
      {
        id: 'jardin-y-exteriores/muebles-de-exterior',
        label: 'Muebles de exterior',
      },
      {
        id: 'jardin-y-exteriores/piscinas-y-accesorios',
        label: 'Piscinas y Accesorios',
      },
      {
        id: 'jardin-y-exteriores/asadores-y-parrillas',
        label: 'Asadores y Parrillas',
      },
    ],
  },
  {
    id: 'mascotas',
    label: 'Mascotas',
    subcategories: [
      { id: 'mascotas/alimento-para-perros', label: 'Alimento para perros' },
      { id: 'mascotas/alimento-para-gatos', label: 'Alimento para gatos' },
      { id: 'mascotas/accesorios-y-juguetes', label: 'Accesorios y Juguetes' },
      {
        id: 'mascotas/camas-y-transportadores',
        label: 'Camas y Transportadores',
      },
      { id: 'mascotas/higiene-y-salud', label: 'Higiene y Salud' },
      { id: 'mascotas/peces-y-acuarios', label: 'Peces y Acuarios' },
      { id: 'mascotas/aves-y-otros-animales', label: 'Aves y otros animales' },
    ],
  },
  {
    id: 'papeleria-y-oficina',
    label: 'Papelería y Oficina',
    subcategories: [
      {
        id: 'papeleria-y-oficina/cuadernos-y-papel',
        label: 'Cuadernos y Papel',
      },
      {
        id: 'papeleria-y-oficina/escritura-y-dibujo',
        label: 'Escritura y Dibujo',
      },
      {
        id: 'papeleria-y-oficina/organizacion-y-archivo',
        label: 'Organización y Archivo',
      },
      {
        id: 'papeleria-y-oficina/mobiliario-de-oficina',
        label: 'Mobiliario de oficina',
      },
      { id: 'papeleria-y-oficina/utiles-escolares', label: 'Útiles escolares' },
      {
        id: 'papeleria-y-oficina/impresion-y-tintas',
        label: 'Impresión y Tintas',
      },
      {
        id: 'papeleria-y-oficina/equipos-de-oficina',
        label: 'Equipos de oficina',
      },
    ],
  },
  {
    id: 'libros-musica-y-peliculas',
    label: 'Libros, Música y Películas',
    subcategories: [
      { id: 'libros-musica-y-peliculas/libros', label: 'Libros' },
      {
        id: 'libros-musica-y-peliculas/revistas-y-comics',
        label: 'Revistas y Cómics',
      },
      {
        id: 'libros-musica-y-peliculas/musica-cd-y-vinilos',
        label: 'Música (CD y Vinilos)',
      },
      {
        id: 'libros-musica-y-peliculas/peliculas-y-series',
        label: 'Películas y Series',
      },
      {
        id: 'libros-musica-y-peliculas/material-educativo',
        label: 'Material educativo',
      },
    ],
  },
  {
    id: 'instrumentos-musicales',
    label: 'Instrumentos Musicales',
    subcategories: [
      {
        id: 'instrumentos-musicales/guitarras-y-bajos',
        label: 'Guitarras y Bajos',
      },
      {
        id: 'instrumentos-musicales/teclados-y-pianos',
        label: 'Teclados y Pianos',
      },
      {
        id: 'instrumentos-musicales/bateria-y-percusion',
        label: 'Batería y Percusión',
      },
      {
        id: 'instrumentos-musicales/vientos-y-cuerdas',
        label: 'Vientos y Cuerdas',
      },
      {
        id: 'instrumentos-musicales/audio-profesional',
        label: 'Audio profesional',
      },
      {
        id: 'instrumentos-musicales/accesorios-musicales',
        label: 'Accesorios musicales',
      },
    ],
  },
  {
    id: 'arte-y-manualidades',
    label: 'Arte y Manualidades',
    subcategories: [
      { id: 'arte-y-manualidades/pintura-y-dibujo', label: 'Pintura y Dibujo' },
      { id: 'arte-y-manualidades/telas-y-costura', label: 'Telas y Costura' },
      { id: 'arte-y-manualidades/tejido-y-lanas', label: 'Tejido y Lanas' },
      {
        id: 'arte-y-manualidades/scrapbooking-y-papel',
        label: 'Scrapbooking y Papel',
      },
      {
        id: 'arte-y-manualidades/bisuteria-insumos',
        label: 'Bisutería (insumos)',
      },
      {
        id: 'arte-y-manualidades/modelismo-y-hobbies',
        label: 'Modelismo y Hobbies',
      },
    ],
  },
  {
    id: 'fiestas-y-regalos',
    label: 'Fiestas y Regalos',
    subcategories: [
      {
        id: 'fiestas-y-regalos/decoracion-de-fiestas',
        label: 'Decoración de fiestas',
      },
      { id: 'fiestas-y-regalos/globos-y-pinatas', label: 'Globos y Piñatas' },
      {
        id: 'fiestas-y-regalos/desechables-para-fiestas',
        label: 'Desechables para fiestas',
      },
      {
        id: 'fiestas-y-regalos/tarjetas-y-empaques-de-regalo',
        label: 'Tarjetas y Empaques de regalo',
      },
      {
        id: 'fiestas-y-regalos/disfraces-y-accesorios',
        label: 'Disfraces y Accesorios',
      },
      {
        id: 'fiestas-y-regalos/articulos-navidenos',
        label: 'Artículos navideños',
      },
      {
        id: 'fiestas-y-regalos/detalles-y-regalos-personalizados',
        label: 'Detalles y Regalos personalizados',
      },
    ],
  },
  {
    id: 'industria-y-seguridad',
    label: 'Industria y Seguridad',
    subcategories: [
      {
        id: 'industria-y-seguridad/dotacion-y-uniformes',
        label: 'Dotación y Uniformes',
      },
      {
        id: 'industria-y-seguridad/elementos-de-proteccion-personal',
        label: 'Elementos de protección personal',
      },
      {
        id: 'industria-y-seguridad/equipos-industriales',
        label: 'Equipos industriales',
      },
      {
        id: 'industria-y-seguridad/seguridad-y-vigilancia',
        label: 'Seguridad y Vigilancia',
      },
      {
        id: 'industria-y-seguridad/empaque-y-embalaje',
        label: 'Empaque y Embalaje',
      },
      {
        id: 'industria-y-seguridad/insumos-para-restaurantes',
        label: 'Insumos para restaurantes',
      },
      {
        id: 'industria-y-seguridad/insumos-medicos-y-de-laboratorio',
        label: 'Insumos médicos y de laboratorio',
      },
    ],
  },
  {
    id: 'digital-y-servicios',
    label: 'Digital y Servicios',
    subcategories: [
      {
        id: 'digital-y-servicios/tarjetas-de-regalo',
        label: 'Tarjetas de regalo',
      },
      {
        id: 'digital-y-servicios/software-y-licencias',
        label: 'Software y Licencias',
      },
      { id: 'digital-y-servicios/recargas-y-pines', label: 'Recargas y Pines' },
      {
        id: 'digital-y-servicios/cursos-y-contenido',
        label: 'Cursos y Contenido',
      },
      { id: 'digital-y-servicios/suscripciones', label: 'Suscripciones' },
    ],
  },
];
