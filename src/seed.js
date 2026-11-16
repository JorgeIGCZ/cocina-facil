// Datos iniciales sacados de sus libretas (10 páginas de menús semanales).
// vecesPrevias = cuántas veces aparece el platillo en esas páginas.

const C = ['comida', 'cena'];
const D = ['desayuno'];

export const PLATILLOS = [
  // --- comidas ---
  { nombre: 'Tacos dorados', categoria: 'antojito', tiempo: 'medio', vecesPrevias: 5, ingredientes: ['tortillas', 'pollo', 'lechuga', 'crema', 'queso rayado', 'jitomate'], guarniciones: ['sopa'] },
  { nombre: 'Tinga', categoria: 'pollo', tiempo: 'medio', vecesPrevias: 3, ingredientes: ['pechuga', 'jitomate', 'cebolla', 'chipotle', 'tostadas', 'crema'], guarniciones: ['tostadas', 'frijoles'] },
  { nombre: 'Pollo enchilado', categoria: 'pollo', tiempo: 'medio', vecesPrevias: 3, ingredientes: ['m/p (muslo con pierna)', 'chile guajillo', 'jitomate', 'ajo'], guarniciones: ['spaguetti', 'pasta con crema y jamón', 'arroz'] },
  { nombre: 'Chuletas', categoria: 'cerdo', tiempo: 'rapido', vecesPrevias: 3, ingredientes: ['chuletas de cerdo'], guarniciones: ['frijoles', 'puré', 'ensalada', 'spaguetti'] },
  { nombre: 'Arroz con frijoles', categoria: 'sin carne', tiempo: 'rapido', vecesPrevias: 3, ingredientes: ['arroz', 'frijoles'], guarniciones: ['huevo', 'aguacate'] },
  { nombre: 'Entomatadas', categoria: 'antojito', tiempo: 'medio', vecesPrevias: 2, ingredientes: ['tortillas', 'jitomate', 'cebolla', 'queso fresco', 'crema'], guarniciones: ['frijoles'] },
  { nombre: 'Caldo de res', categoria: 'caldo', tiempo: 'largo', vecesPrevias: 2, ingredientes: ['carne para caldo', 'elote', 'papa', 'calabaza', 'zanahoria', 'hierbabuena', 'cilantro'], guarniciones: ['arroz', 'tortillas'], etiquetas: ['invitados'] },
  { nombre: 'Pollo empanizado', categoria: 'pollo', tiempo: 'medio', vecesPrevias: 2, ingredientes: ['pechuga filete', 'pan molido', 'huevos'], guarniciones: ['verduras al vapor', 'spaguetti', 'ensalada'] },
  { nombre: 'Pasta con pollo', categoria: 'pasta', tiempo: 'rapido', vecesPrevias: 2, ingredientes: ['pasta', 'pechuga', 'crema'], guarniciones: ['bolillo'] },
  { nombre: 'Pollo asado', categoria: 'pollo', tiempo: 'medio', vecesPrevias: 2, ingredientes: ['m/p (muslo con pierna)', 'limón', 'tortillas'], guarniciones: ['frijoles', 'ensalada'] },
  { nombre: 'Bistec a la mexicana', categoria: 'res', tiempo: 'rapido', vecesPrevias: 2, ingredientes: ['bistec', 'jitomate', 'cebolla', 'chiles'], guarniciones: ['frijoles', 'arroz'] },
  { nombre: 'Bistec ranchero (entomatado)', categoria: 'res', tiempo: 'medio', vecesPrevias: 2, ingredientes: ['bistec', 'jitomate', 'cebolla', 'chiles'], guarniciones: ['arroz'] },
  { nombre: 'Carne de puerco', categoria: 'cerdo', tiempo: 'medio', vecesPrevias: 2, ingredientes: ['costilla de puerco'], guarniciones: ['arroz con elote'] },
  { nombre: 'Fajitas de res', categoria: 'res', tiempo: 'rapido', vecesPrevias: 2, ingredientes: ['filete de res', 'pimientos', 'cebolla', 'tortillas'], guarniciones: ['frijoles', 'guacamole'] },
  { nombre: 'Mole', categoria: 'pollo', tiempo: 'largo', vecesPrevias: 2, ingredientes: ['m/p (muslo con pierna)', 'mole'], guarniciones: ['arroz'], etiquetas: ['invitados'] },
  { nombre: 'Carne encebollada', categoria: 'res', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['diezmillo', 'cebolla'], guarniciones: ['guacamole', 'verduras'] },
  { nombre: 'Carne asada', categoria: 'res', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['diezmillo', 'tortillas', 'aguacate', 'limón'], guarniciones: ['frijoles', 'pico de gallo'], etiquetas: ['invitados'] },
  { nombre: 'Aporreadillo', categoria: 'res', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['cecina', 'huevos', 'jitomate', 'chiles'], guarniciones: ['frijoles', 'tortillas'] },
  { nombre: 'Bistec con papa', categoria: 'res', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['bistec', 'papa', 'jitomate'], guarniciones: ['frijoles'] },
  { nombre: 'Tacos de pastor', categoria: 'antojito', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['carne al pastor', 'tortillas', 'piña', 'cilantro', 'cebolla'], guarniciones: ['sopa'], etiquetas: ['invitados'] },
  { nombre: 'Aguja norteña', categoria: 'res', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['aguja norteña', 'tortillas'], guarniciones: ['frijoles', 'ensalada'], etiquetas: ['invitados'] },
  { nombre: 'Punta norteña', categoria: 'res', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['punta norteña', 'tortillas'], guarniciones: ['frijoles', 'ensalada'], etiquetas: ['invitados'] },
  { nombre: 'Enfrijoladas con cecina', categoria: 'antojito', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['tortillas', 'frijoles', 'cecina', 'queso fresco', 'crema'], guarniciones: [] },
  { nombre: 'Enmoladas', categoria: 'antojito', tiempo: 'medio', vecesPrevias: 1, ingredientes: ['tortillas', 'mole', 'pechuga', 'queso fresco', 'crema'], guarniciones: ['arroz'] },
  { nombre: 'Fajitas de pollo', categoria: 'pollo', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['pechuga filete', 'pimientos', 'cebolla'], guarniciones: ['arroz rojo'] },
  { nombre: 'Pollo con verduras al vapor', categoria: 'pollo', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['pechuga', 'verduras al vapor'], guarniciones: ['arroz'] },
  { nombre: 'Caldo de pollo', categoria: 'caldo', tiempo: 'largo', vecesPrevias: 1, ingredientes: ['m/p (muslo con pierna)', 'papa', 'zanahoria', 'calabaza', 'arroz'], guarniciones: ['tortillas'] },
  { nombre: 'Barbacoa', categoria: 'res', tiempo: 'largo', vecesPrevias: 0, ingredientes: ['carne para barbacoa', 'tortillas', 'cebolla', 'cilantro'], guarniciones: ['consomé'], etiquetas: ['invitados'] },
  { nombre: 'Cecina', categoria: 'res', tiempo: 'rapido', vecesPrevias: 0, ingredientes: ['cecina', 'aguacate', 'tortillas'], guarniciones: ['frijoles', 'nopales'] },
  { nombre: 'Filete al ajillo', categoria: 'pescado', tiempo: 'rapido', vecesPrevias: 0, ingredientes: ['filete', 'ajo', 'mantequilla', 'limón'], guarniciones: ['arroz', 'ensalada'], notas: 'Revisar: ¿filete de pescado o de pollo?' },
  { nombre: 'Filete empanizado', categoria: 'pescado', tiempo: 'medio', vecesPrevias: 0, ingredientes: ['filete', 'pan molido', 'huevos'], guarniciones: ['ensalada', 'puré'], notas: 'Revisar: ¿filete de pescado o de pollo?' },
  { nombre: 'Carne en su jugo', categoria: 'res', tiempo: 'largo', vecesPrevias: 0, ingredientes: ['filete de res', 'tocino', 'frijoles', 'cebolla', 'cilantro'], guarniciones: ['tortillas'], etiquetas: ['invitados', 'adultos'] },
  // --- desayunos ---
  { nombre: 'Tostadas de frijol', tipos: D, categoria: 'desayuno', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['tostadas', 'frijoles', 'queso fresco', 'crema'] },
  { nombre: 'Queso panela a la mexicana', tipos: D, categoria: 'desayuno', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['queso panela', 'jitomate', 'cebolla', 'chiles'] },
  { nombre: 'Avena trasnochada', tipos: D, categoria: 'desayuno', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['avena', 'leche', 'yogurt', 'fruta'] },
  { nombre: 'Licuado', tipos: D, categoria: 'desayuno', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['leche', 'plátano', 'avena'] },
  { nombre: 'Sandwich de panela', tipos: D, categoria: 'desayuno', tiempo: 'rapido', vecesPrevias: 1, ingredientes: ['pan', 'queso panela', 'jamón', 'aguacate'] },
];

export const PERSONAS = [
  { nombre: 'Mamá', emoji: '👩', rol: 'adulto' },
  { nombre: 'Papá', emoji: '👨', rol: 'adulto' },
  { nombre: 'Niño 1', emoji: '👦', rol: 'nino' },
  { nombre: 'Niño 2', emoji: '🧒', rol: 'nino' },
];

export async function sembrar(store, cocina) {
  if ((await store.all('personas')).length === 0) {
    for (const p of PERSONAS) await cocina.guardarPersona(p);
  }
  if ((await store.all('platillos')).length === 0) {
    for (const p of PLATILLOS) await cocina.crearPlatillo({ tipos: C, etiquetas: [], guarniciones: [], ...p });
    return true;
  }
  return false;
}
