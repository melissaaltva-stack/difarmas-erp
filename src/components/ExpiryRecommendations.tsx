import { AlertTriangle, CalendarClock } from 'lucide-react';
import type { CartItem, Product } from '../domain/types';
import { earlierExpiryAlternatives } from '../services/expiryService';

export function ExpiryRecommendations({products,cart}:{products:Product[];cart:CartItem[]}) {
  const recommendations = cart.flatMap(item => earlierExpiryAlternatives(item, products).map(candidate => ({current:item, candidate})));
  if (!recommendations.length) return null;
  return <div className="card expiry-recommendations" role="status">
    <div className="expiry-recommendations-title"><CalendarClock size={18}/><strong>Recomendación FEFO: vender primero lo que vence antes</strong></div>
    <p>Hay productos con el mismo principio activo y una fecha de vencimiento anterior. Revisa la alternativa antes de cobrar.</p>
    {recommendations.map(({current,candidate})=><div className="expiry-recommendation" key={current.id+'-'+candidate.id}>
      <AlertTriangle size={16}/><span><strong>Prioriza: {candidate.name}</strong><small>Vence {candidate.expiry} · Stock {candidate.stock}. En el carrito está {current.name}, que vence {current.expiry}.</small></span>
    </div>)}
    <small className="helper">La coincidencia se basa en los principios activos registrados en las fichas de inventario. Confirma que presentación, concentración y medicamento sean adecuados antes de sustituir.</small>
  </div>;
}
