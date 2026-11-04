/*
 * Liquid Glass (libreria glisse): adattatori con le stesse proprietà dei controlli già usati nell'app, così si sostituiscono
 * uno a uno senza toccare la logica. Ogni adattatore chiama i gestori come li chiamava l'elemento nativo ({ target: { value | checked } }).
 */
import { forwardRef } from 'react';
import { Button, Glass, Input, Menu, SearchField, SegmentedControl, Slider, Switch, TabBar } from 'glisse';

export { Glass, Menu, SearchField, SegmentedControl, TabBar };

const cx = (...a) => a.filter(Boolean).join(' ');

/* Pulsante: «filled» solo per le azioni principali (pf-primary, pf-btn-add), rosso per quelle che eliminano; il resto è vetro chiaro.
   Le voci «accent» delle barre (is-accent, pf-tool-accent) restano vetro con il testo nel colore dell'app, come nel disegno originale. */
export const GButton = forwardRef(function GButton({ className = '', ...rest }, ref) {
  const filled = /\b(pf-primary|pf-btn-add)\b/.test(className);
  const destructive = /\bis-danger\b/.test(className);
  return <Button ref={ref} variant={filled ? 'filled' : 'glass'} destructive={destructive} className={cx('pf-gb', className)} {...rest} />;
});

/* Cursore: un range nativo → Slider di glisse. */
export const GRange = forwardRef(function GRange({ onChange, className = '', value, min, max, step, ...rest }, ref) {
  return (
    <Slider ref={ref} className={cx('pf-gslider', className)} value={Number(value)} min={Number(min)} max={Number(max)} step={step === undefined ? undefined : Number(step)}
      onValueChange={(v) => onChange?.({ target: { value: String(v), valueAsNumber: v } })} {...rest} />
  );
});

/* Casella di spunta → interruttore. */
export const GCheck = forwardRef(function GCheck({ onChange, checked, className = '', ...rest }, ref) {
  return <Switch ref={ref} className={cx('pf-gswitch', className)} checked={!!checked} onCheckedChange={(on) => onChange?.({ target: { checked: on } })} {...rest} />;
});

/* Campo di testo (testo, ricerca) → Input di glisse. */
export const GText = forwardRef(function GText({ onChange, className = '', type = 'text', ...rest }, ref) {
  return <Input ref={ref} type={type} className={cx('pf-ginput', className)} onValueChange={(v) => onChange?.({ target: { value: v } })} {...rest} />;
});
