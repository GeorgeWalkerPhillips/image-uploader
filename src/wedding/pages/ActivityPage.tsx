import { ActivityFeed } from '../components/ActivityFeed';
import { ACTIVITY_PAGE } from '../extrasHooks';

export function ActivityPage() {
  return <ActivityFeed limit={ACTIVITY_PAGE} />;
}
