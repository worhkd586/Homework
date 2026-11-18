import { createPlaceProvider, createRouteProvider } from '../services/places';
import { RuleBasedRecommender } from '../services/recommend/RuleBasedRecommender';

export const placeProvider = createPlaceProvider();
export const routeProvider = createRouteProvider();
export const recommender = new RuleBasedRecommender(placeProvider, routeProvider);
