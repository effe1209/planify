import { houseFor, levelLabel } from '../lib/project';
import { sheetBox } from '../lib/sheet';
import PlanSvg from './PlanSvg';

const LAYERS = { furniture: true, labels: true, dims: true, grid: false };

/* Vista globale: tutti i piani affiancati, ognuno adattato al suo riquadro. Clic = apri il piano. */
export default function FloorsOverview({ project, stage, devices, stairs, onOpen }) {
  const n = project.floors.length;
  const house = houseFor(project);
  const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(200, (stage.w - 40) / cols - 16);
  const cellH = Math.max(160, (stage.h - 40) / rows - 40);
  return (
    <div className="pf-overview" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {project.floors.map((f) => {
        const box = sheetBox(f.plan, false);
        const z = Math.min(cellW / box.w, cellH / box.h, 1.2);
        return (
          <button key={f.id} type="button" className="pf-overview-cell" onClick={() => onOpen(f.id)}
            title={`Apri ${f.name}`}>
            <span><em>{levelLabel(f.level)}</em> {f.name}</span>
            <div className="pf-sheet">
              <PlanSvg plan={f.plan} layers={LAYERS} zoom={z} typeLabel={f.name} style={f.meta?.style}
                devices={devices?.filter((d) => d.floor === f.id)} stairs={stairs?.[f.id]} house={house} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
