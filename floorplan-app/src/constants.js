import { Home, Briefcase, Maximize2, BedDouble, Car, Trees } from 'lucide-react';

export const SHAPES = [
  { id: 'auto', label: 'Varia', d: null },
  { id: 'rect', label: 'Rettangolo', d: 'M3 6h18v12H3z' },
  { id: 'l', label: 'A L', d: 'M3 5h11v6h7v8H3z' },
  { id: 'u', label: 'A U', d: 'M3 5h5v7h8V5h5v14H3z' },
  { id: 't', label: 'A T', d: 'M3 5h18v6h-6v8H9v-8H3z' },
  { id: 'step', label: 'Scalare', d: 'M3 5h9v5h5v5h4v4H3z' },
];
export const SHAPE_NAME = {
  rect: 'rettangolare', l: 'a L', u: 'a U', t: 'a T', step: 'scalare', sketch: 'libera',
};

export const TYPES = [
  { id: 'apartment', label: 'Appartamento', Icon: Home },
  { id: 'open-space', label: 'Open space', Icon: Maximize2 },
  { id: 'office', label: 'Ufficio', Icon: Briefcase },
  { id: 'hotel-room', label: 'Camera Hotel', Icon: BedDouble },
  { id: 'garage', label: 'Garage / interrato', Icon: Car },
  { id: 'garden', label: 'Giardino', Icon: Trees },
];
export const TYPE_NAME = {
  apartment: 'Appartamento',
  'open-space': 'Open space',
  office: 'Ufficio',
  'hotel-room': 'Camera Hotel',
  garage: 'Garage / interrato',
  garden: 'Giardino',
  sketch: 'Schizzo',
  dxf: 'Import DXF',
  pdf: 'Import PDF',
  catasto: 'Planimetria catastale',
};

export const STYLES = [
  { id: 'modern', label: 'Moderno', bg: '#e0f2fe', desc: 'Minimal e contemporaneo' },
  { id: 'classic', label: 'Classico', bg: '#fef3c7', desc: 'Caldo e tradizionale' },
  { id: 'nordic', label: 'Nordico', bg: '#e8f5e9', desc: 'Legno chiaro e salvia' },
  { id: 'industrial', label: 'Industriale', bg: '#cfd8dc', desc: 'Loft e cemento' },
  { id: 'japandi', label: 'Japandi', bg: '#f7f4ea', desc: 'Zen e naturale' },
  { id: 'luxury', label: 'Luxury', bg: '#f9f6f0', desc: 'Elegante e raffinato' },
];

export const PRESETS = [
  { label: 'Bilocale', w: 8, l: 6.5, type: 'apartment', rooms: 2 },
  { label: 'Trilocale', w: 10, l: 8, type: 'apartment', rooms: 3 },
  { label: 'Quadrilocale', w: 13, l: 9.5, type: 'apartment', rooms: 4 },
  { label: 'Monolocale', w: 6.5, l: 5.5, type: 'open-space', rooms: 1 },
  { label: 'Loft', w: 12, l: 8, type: 'open-space', rooms: 1, style: 'industrial' },
  { label: 'Ufficio', w: 14, l: 10, type: 'office', rooms: 3 },
  { label: 'Camera Std', w: 4.2, l: 6.0, type: 'hotel-room', rooms: 1 },
  { label: 'Camera Deluxe', w: 5.0, l: 6.8, type: 'hotel-room', rooms: 1 },
  { label: 'Suite Hotel', w: 6.0, l: 8.0, type: 'hotel-room', rooms: 1 },
  { label: 'Box auto', w: 6.0, l: 9.0, type: 'garage', rooms: 1 },
  { label: 'Giardino', w: 14, l: 10, type: 'garden', rooms: 1 },
];

export const FLOOR_PALETTES = [
  { name: 'Rovere Chiaro', color: '#fdf6e3' },
  { name: 'Parquet Noce', color: '#efe0c8' },
  { name: 'Ceramica Bianca', color: '#f8fafc' },
  { name: 'Cotto Caldo', color: '#fef3c7' },
  { name: 'Resina Grigia', color: '#e2e8f0' },
  { name: 'Azzurro Spa', color: '#e0f2fe' },
  { name: 'Verde Salvia', color: '#e8f5e9' },
  { name: 'Marmo Luxury', color: '#faf7f5' },
];

/* Destinazioni d'uso selezionabili (schizzo e personalizzazione stanza). */
export const ROOM_KINDS = [
  { id: 'living', label: 'Soggiorno', name: 'Soggiorno' },
  { id: 'living_kitchen', label: 'Soggiorno + cucina', name: 'Soggiorno con Cucina' },
  { id: 'kitchen', label: 'Cucina', name: 'Cucina' },
  { id: 'bed', label: 'Camera matrimoniale', name: 'Camera Matrimoniale' },
  { id: 'bed_single', label: 'Camera singola', name: 'Camera Singola' },
  { id: 'bath', label: 'Bagno', name: 'Bagno' },
  { id: 'study', label: 'Studio', name: 'Studio' },
  { id: 'corridor', label: 'Disimpegno', name: 'Disimpegno' },
  { id: 'entry', label: 'Ingresso', name: 'Ingresso' },
  { id: 'stairs', label: 'Vano scala', name: 'Scala' },
  { id: 'dining', label: 'Zona pranzo', name: 'Zona Pranzo' },
  { id: 'closet', label: 'Cabina armadio', name: 'Cabina armadio' },
  { id: 'storage', label: 'Ripostiglio', name: 'Ripostiglio' },
  { id: 'laundry', label: 'Lavanderia', name: 'Lavanderia' },
  { id: 'garage', label: 'Garage', name: 'Garage' },
  { id: 'garden', label: 'Giardino / esterno', name: 'Giardino' },
  { id: 'hotel_room', label: 'Camera hotel', name: 'Camera' },
];
export const ROOM_KIND_NAME = Object.fromEntries(ROOM_KINDS.map((k) => [k.id, k.name]));

/* Catalogo per «Aggiungi arredo»: più varianti possono condividere lo stesso disegno (type). */
export const FURNITURE = [
  { id: 'bed_double', type: 'bed', label: 'Letto matrimoniale 160', w: 1.6, h: 2.0, group: 'Notte' },
  { id: 'bed_king', type: 'bed', label: 'Letto king 180', w: 1.8, h: 2.0, group: 'Notte' },
  { id: 'bed_single', type: 'bed', label: 'Letto singolo', w: 0.9, h: 2.0, group: 'Notte' },
  { id: 'nightstand', type: 'nightstand', label: 'Comodino', w: 0.45, h: 0.4, group: 'Notte' },
  { id: 'wardrobe', type: 'wardrobe', label: 'Armadio 3 ante', w: 1.8, h: 0.6, group: 'Notte' },
  { id: 'wardrobe_small', type: 'wardrobe', label: 'Armadio 2 ante', w: 1.2, h: 0.6, group: 'Notte' },
  { id: 'desk', type: 'desk', label: 'Scrivania con sedia', w: 1.2, h: 0.6, group: 'Notte' },
  { id: 'sofa_2', type: 'sofa', label: 'Divano 2 posti', w: 1.6, h: 0.9, group: 'Giorno' },
  { id: 'sofa_3', type: 'sofa', label: 'Divano 3 posti', w: 2.2, h: 0.9, group: 'Giorno' },
  { id: 'sofa_corner', type: 'sofa_corner', label: 'Divano angolare', w: 2.6, h: 1.7, group: 'Giorno' },
  { id: 'armchair', type: 'armchair', label: 'Poltrona', w: 0.8, h: 0.8, group: 'Giorno' },
  { id: 'coffee_table', type: 'coffee_table', label: 'Tavolino da salotto', w: 1.0, h: 0.55, group: 'Giorno' },
  { id: 'tv', type: 'tv', label: 'Mobile TV', w: 1.6, h: 0.25, group: 'Giorno' },
  { id: 'table', type: 'table', label: 'Tavolo rettangolare', w: 1.6, h: 0.9, group: 'Giorno' },
  { id: 'table_round', type: 'table_round', label: 'Tavolo tondo', w: 1.1, h: 1.1, group: 'Giorno' },
  { id: 'table_round_small', type: 'table_round', label: 'Tavolino tondo', w: 0.8, h: 0.8, group: 'Giorno' },
  { id: 'kitchen_counter', type: 'kitchen_counter', label: 'Piano cucina', w: 2.4, h: 0.6, group: 'Cucina' },
  { id: 'kitchen_peninsula', type: 'kitchen_peninsula', label: 'Penisola con sgabelli', w: 0.9, h: 2.0, group: 'Cucina' },
  { id: 'shower', type: 'shower', label: 'Doccia quadrata', w: 0.9, h: 0.9, group: 'Bagno' },
  { id: 'shower_rect', type: 'shower', label: 'Doccia rettangolare', w: 1.2, h: 0.8, group: 'Bagno' },
  { id: 'shower_round', type: 'shower_round', label: 'Doccia angolare tonda', w: 0.9, h: 0.9, group: 'Bagno' },
  { id: 'shower_walkin', type: 'shower_walkin', label: 'Doccia walk-in', w: 1.4, h: 0.9, group: 'Bagno' },
  { id: 'bathtub', type: 'bathtub', label: 'Vasca da bagno', w: 1.7, h: 0.75, group: 'Bagno' },
  { id: 'toilet', type: 'toilet', label: 'WC', w: 0.4, h: 0.65, group: 'Bagno' },
  { id: 'bidet', type: 'bidet', label: 'Bidet', w: 0.38, h: 0.55, group: 'Bagno' },
  { id: 'sink', type: 'sink', label: 'Lavabo', w: 0.6, h: 0.5, group: 'Bagno' },
  { id: 'sink_double', type: 'sink', label: 'Lavabo doppio', w: 1.2, h: 0.5, group: 'Bagno' },
  { id: 'vanity', type: 'sink', label: 'Lavabo con mobile', w: 0.8, h: 0.5, group: 'Bagno', parts: { cabinet: 1 } },
  { id: 'bath_column', type: 'bath_column', label: 'Colonna contenitore', w: 0.4, h: 0.35, group: 'Bagno' },
  { id: 'towel_radiator', type: 'towel_radiator', label: 'Scaldasalviette', w: 0.5, h: 0.1, group: 'Bagno' },
  { id: 'minibar', type: 'minibar', label: 'Minibar', w: 0.8, h: 0.5, group: 'Giorno' },
  { id: 'console', type: 'console', label: 'Credenza / mobile basso', w: 1.4, h: 0.4, group: 'Giorno' },
  { id: 'plant', type: 'plant', label: 'Pianta', w: 0.5, h: 0.5, group: 'Giorno' },
  { id: 'washer', type: 'washer', label: 'Lavatrice', w: 0.6, h: 0.6, group: 'Lavanderia' },
  { id: 'dryer', type: 'dryer', label: 'Asciugatrice', w: 0.6, h: 0.6, group: 'Lavanderia' },
  { id: 'utility_sink', type: 'utility_sink', label: 'Lavatoio', w: 0.6, h: 0.5, group: 'Lavanderia' },
  { id: 'laundry_basket', type: 'laundry_basket', label: 'Cesto biancheria', w: 0.45, h: 0.45, group: 'Lavanderia' },
  { id: 'shelving', type: 'shelving', label: 'Scaffali modulari', w: 1.6, h: 0.4, group: 'Ripostiglio' },
  { id: 'vacuum', type: 'vacuum', label: 'Aspirapolvere / elettrodomestici', w: 0.4, h: 0.4, group: 'Ripostiglio' },
  { id: 'car', type: 'car', label: 'Auto', w: 1.9, h: 4.5, group: 'Garage' },
  { id: 'motorbike', type: 'motorbike', label: 'Moto', w: 0.8, h: 2.1, group: 'Garage' },
  { id: 'workbench', type: 'workbench', label: 'Banco da lavoro', w: 1.8, h: 0.6, group: 'Garage' },
  { id: 'shelving_heavy', type: 'shelving_heavy', label: 'Scaffalatura pesante', w: 2.0, h: 0.5, group: 'Garage' },
  { id: 'hedge', type: 'hedge', label: 'Siepe', w: 3.0, h: 0.5, group: 'Giardino' },
  { id: 'fence', type: 'fence', label: 'Recinzione', w: 3.0, h: 0.15, group: 'Giardino' },
  { id: 'gate_pedestrian', type: 'gate_pedestrian', label: 'Cancello pedonale', w: 1.0, h: 0.15, group: 'Giardino' },
  { id: 'gate_driveway', type: 'gate_driveway', label: 'Cancello carrabile', w: 3.0, h: 0.15, group: 'Giardino' },
  { id: 'gazebo', type: 'gazebo', label: 'Gazebo / pergolato', w: 3.0, h: 3.0, group: 'Giardino' },
  { id: 'path', type: 'path', label: 'Camminamento', w: 1.0, h: 4.0, group: 'Giardino' },
  { id: 'tree', type: 'tree', label: 'Albero', w: 1.4, h: 1.4, group: 'Giardino' },
];
export const FURNITURE_LABEL = {
  bed: 'Letto', nightstand: 'Comodino', wardrobe: 'Armadio', desk: 'Scrivania', sofa: 'Divano',
  sofa_corner: 'Divano angolare', armchair: 'Poltrona', coffee_table: 'Tavolino', tv: 'Mobile TV',
  table: 'Tavolo', table_round: 'Tavolo tondo', kitchen_counter: 'Piano cucina', kitchen_peninsula: 'Penisola',
  shower: 'Doccia', shower_round: 'Doccia angolare', shower_walkin: 'Doccia walk-in', bathtub: 'Vasca',
  toilet: 'WC', bidet: 'Bidet', sink: 'Lavabo', bath_column: 'Colonna contenitore', towel_radiator: 'Scaldasalviette', minibar: 'Minibar', console: 'Credenza', plant: 'Pianta',
  washer: 'Lavatrice', dryer: 'Asciugatrice', utility_sink: 'Lavatoio', laundry_basket: 'Cesto biancheria',
  shelving: 'Scaffali', vacuum: 'Aspirapolvere', car: 'Auto', motorbike: 'Moto', workbench: 'Banco da lavoro',
  shelving_heavy: 'Scaffalatura pesante', hedge: 'Siepe', fence: 'Recinzione', gate_pedestrian: 'Cancello pedonale',
  gate_driveway: 'Cancello carrabile', gazebo: 'Gazebo', path: 'Camminamento', ramp: 'Rampa garage', tree: 'Albero',
  sideboard: 'Madia', bookcase: 'Libreria', dresser: 'Cassettiera', shoe_cabinet: 'Scarpiera', floor_lamp: 'Lampada da terra',
};

export const LOADING_STEPS = [
  'Calcolo la sagoma e la volumetria…',
  'Traccio pareti e distribuisco gli ambienti…',
  'Inserisco porte, finestre e dotazioni di arredo…',
  'Controllo passaggi, circolazione e conformità…',
];

/* Stesse palette del motore Python (planner.PALETTES), usate per schizzi e import locali. */
export const PALETTES = {
  modern: { living: '#f8fafc', kitchen: '#f1f5f9', bed: '#f8fafc', bath: '#e0f2fe', corridor: '#e2e8f0', study: '#f1f5f9' },
  classic: { living: '#fdf6e3', kitchen: '#fef3c7', bed: '#fef9ef', bath: '#e7f0f7', corridor: '#efe7d6', study: '#f5ecd7' },
  nordic: { living: '#fafaf9', kitchen: '#f5f5f4', bed: '#fafaf9', bath: '#e8f5e9', corridor: '#f5f5f4', study: '#f0fdf4' },
  industrial: { living: '#eceff1', kitchen: '#e2e8f0', bed: '#f1f5f9', bath: '#cfd8dc', corridor: '#e2e8f0', study: '#e2e8f0' },
  japandi: { living: '#f7f4ea', kitchen: '#f3efe6', bed: '#faf7f0', bath: '#eaf0e8', corridor: '#f3efe6', study: '#faf7f0' },
  luxury: { living: '#f9f6f0', kitchen: '#f5efe6', bed: '#fbf8f5', bath: '#e2e8f0', corridor: '#f3eee5', study: '#fbf8f5' },
};
export const KIND_GROUP = {
  living: 'living', living_kitchen: 'living', zone_day: 'living', kitchen: 'kitchen', bed: 'bed', bed_single: 'bed',
  zone_night: 'bed', bath: 'bath', wc: 'bath', corridor: 'corridor', study: 'study', hotel_room: 'bed',
  entry: 'corridor', dining: 'living', closet: 'bed', storage: 'corridor', laundry: 'bath', garage: 'garage',
  garden: 'garden',
};
const OUTDOOR_COLORS = { garage: '#eceef1', garden: '#e3efd9' };
export const roomColor = (kind, style = 'modern') => {
  const group = KIND_GROUP[kind] || 'living';
  return (PALETTES[style] || PALETTES.modern)[group] || OUTDOOR_COLORS[group] || '#f8fafc';
};

/* Spessore muri e scala di disegno: allineati a planner.py. */
export const WALL = 0.2;
export const SCALE = 45;

/* Locali principali → (matrimoniali, singole), come nel motore: trilocale 1+1, quadrilocale 2+1. */
export function defaultBedrooms(rooms) {
  const beds = Math.max(1, rooms - 1);
  const doubles = 1 + Math.floor(Math.max(0, beds - 1) / 2);
  return { doubles, singles: beds - doubles };
}
